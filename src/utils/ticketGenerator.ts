/**
 * @file ticketGenerator.ts
 * @description Motor de generación de tickets y reportes.
 * OPTIMIZADO V2: Usa Inyección CSS para evitar páginas en blanco en móviles.
 */

import type { Sale, AppSettings, PaymentMethod, Client } from '../types';
import { useStore } from '../store/useStore';

// --- 1. FUNCIÓN MAESTRA DE IMPRESIÓN (CSS INJECTION) ---
const printMobileFriendly = (content: string) => {
    // 1. Crear un contenedor para el ticket si no existe
    let printArea = document.getElementById('print-area');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'print-area';
        document.body.appendChild(printArea);
    }

    // 2. Inyectar el contenido del ticket
    printArea.innerHTML = content;

    // 3. Agregar estilos específicos para ocultar la App y mostrar solo el ticket al imprimir
    const styleId = 'print-styles';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        styleTag.innerHTML = `
            @media screen {
                #print-area { display: none; } /* Oculto en pantalla normal */
            }
            @media print {
                /* Ocultar TODO lo demás */
                body * { visibility: hidden; }
                #root, #root * { display: none; }
                
                /* Mostrar solo el área de impresión */
                #print-area, #print-area * { 
                    visibility: visible; 
                    display: block; 
                }
                #print-area {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    margin: 0;
                    padding: 0;
                }
                
                /* Estilos del Ticket */
                body { font-family: 'Courier New', monospace; font-size: 12px; color: black; background: white; }
                .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                .title { font-size: 16px; font-weight: bold; margin: 5px 0; }
                .subtitle { font-size: 10px; text-transform: uppercase; }
                .divider { border-top: 1px dashed #000; margin: 5px 0; }
                .item { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .totals { margin-top: 10px; border-top: 1px dashed #000; padding-top: 5px; }
                .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
                .footer { text-align: center; margin-top: 20px; font-size: 10px; }
                .bold { font-weight: bold; }
            }
        `;
        document.head.appendChild(styleTag);
    }

    // 4. Imprimir con un pequeño retraso para asegurar el renderizado
    setTimeout(() => {
        window.print();

        // Opcional: Limpiar el área de impresión después
        // setTimeout(() => { if(printArea) printArea.innerHTML = ''; }, 1000);
    }, 200);
};


// --- 2. IMPRIMIR FACTURA DE VENTA (TICKET) ---
export const printInvoice = (sale: Sale, directClient?: Client) => {
    const { settings, clients } = useStore.getState();
    const client = directClient || clients.find(c => c.id === sale.clientId);

    const date = new Date(sale.date).toLocaleString('es-VE');
    const currency = settings.printerCurrency || 'BS';

    const rate = settings.tasaBCV;
    const convert = (usd: number) => currency === 'BS' ? usd * rate : usd;
    const symbol = currency === 'BS' ? 'Bs.' : '$';

    let itemsHTML = '';
    sale.items.forEach(item => {
        const price = convert(item.priceFinalUSD);
        const subtotal = price * item.quantity;
        itemsHTML += `
            <div style="margin-bottom: 4px;">
                <div style="font-weight:bold;">${item.name}</div>
                <div class="item">
                    <span>${item.quantity} x ${symbol}${price.toFixed(2)}</span>
                    <span>${symbol}${subtotal.toFixed(2)}</span>
                </div>
            </div>
        `;
    });

    const content = `
        <div class="header">
            <div class="title">${settings.companyName}</div>
            <div class="subtitle">${settings.rifType}-${settings.rif}</div>
            <div class="subtitle">${settings.address}</div>
            <div class="divider"></div>
            <div>Ticket: #${sale.id.slice(-6)}</div>
            <div>Fecha: ${date}</div>
            ${client ? `<div class="divider"></div><div style="text-align:left">CLIENTE: ${client.name}<br>RIF: ${client.rif}</div>` : ''}
        </div>
        
        <div class="items">
            ${itemsHTML}
        </div>

        <div class="totals">
            <div class="total-row">
                <span>TOTAL (${currency})</span>
                <span>${symbol} ${convert(sale.totalUSD).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="item" style="margin-top:5px; font-size:10px;">
                <span>Ref. USD:</span>
                <span>$${sale.totalUSD.toFixed(2)}</span>
            </div>
        </div>

        <div class="footer">
            <p>Método Pago: ${sale.paymentMethod}</p>
            <p>¡Gracias por su compra!</p>
            ${sale.status === 'PENDING' ? '*** VENTA A CRÉDITO ***' : ''}
        </div>
    `;

    printMobileFriendly(content);
};

// --- 3. IMPRIMIR REPORTE X / Z (CIERRE) ---
interface CloseReportProps {
    type: 'X' | 'Z';
    date: string;
    totalUSD: number;
    totalBs: number;
    itemsCount: number;
    breakdown: Record<string, number>;
    reportNumber: string;
    paymentMethods: PaymentMethod[];
}

export const printTicket = (data: CloseReportProps) => {
    const { settings } = useStore.getState();
    const typeLabel = data.type === 'X' ? 'CORTE PARCIAL (X)' : 'CIERRE DIARIO (Z)';

    let breakdownHTML = '';
    Object.entries(data.breakdown).forEach(([method, amount]) => {
        breakdownHTML += `
            <div class="item">
                <span>${method}</span>
                <span>$${amount.toFixed(2)}</span>
            </div>
        `;
    });

    const content = `
        <div class="header">
            <div class="title">${settings.companyName}</div>
            <div class="subtitle">${typeLabel}</div>
            <div>Fecha: ${data.date}</div>
            <div>Reporte #: ${data.reportNumber}</div>
        </div>

        <div class="divider"></div>
        <div class="item bold">
            <span>VENTAS TOTALES ($)</span>
            <span>$${data.totalUSD.toFixed(2)}</span>
        </div>
        <div class="item">
            <span>Ref. Bolívares</span>
            <span>Bs. ${data.totalBs.toFixed(2)}</span>
        </div>
        <div class="item">
            <span>Transacciones</span>
            <span>${data.itemsCount}</span>
        </div>

        <div class="divider"></div>
        <div style="text-align:center; margin-bottom:5px; font-weight:bold;">DESGLOSE POR MÉTODO</div>
        ${breakdownHTML}

        <div class="footer">
            <p>Tasa BCV: ${settings.tasaBCV}</p>
            <p>Generado por Todo en Ruedas System</p>
        </div>
    `;

    printMobileFriendly(content);
};

// --- 4. IMPRIMIR LISTA DE VENTAS (HISTORIAL) ---
export const printSalesList = (sales: Sale[], start: string, end: string) => {
    const { settings, clients } = useStore.getState();
    const total = sales.reduce((acc, s) => acc + s.totalUSD, 0);

    let rows = '';
    sales.forEach(s => {
        const clientName = clients.find(c => c.id === s.clientId)?.name || '-';
        rows += `
            <tr>
                <td style="border-bottom:1px solid #ddd; padding:4px;">${new Date(s.date).toLocaleDateString()}</td>
                <td style="border-bottom:1px solid #ddd; padding:4px;">#${s.id.slice(-4)}</td>
                <td style="border-bottom:1px solid #ddd; padding:4px;">${clientName.substring(0, 10)}</td>
                <td style="border-bottom:1px solid #ddd; padding:4px; text-align:right">$${s.totalUSD.toFixed(2)}</td>
            </tr>
        `;
    });

    const content = `
        <div class="header">
            <h2>Reporte de Ventas</h2>
            <p>Periodo: ${start || 'Inicio'} - ${end || 'Fin'}</p>
            <p><strong>Total Periodo: $${total.toFixed(2)}</strong></p>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px;">
            <thead>
                <tr style="background:#f0f0f0;">
                    <th style="text-align:left; padding:4px;">Fecha</th>
                    <th style="text-align:left; padding:4px;">Tkt</th>
                    <th style="text-align:left; padding:4px;">Cliente</th>
                    <th style="text-align:right; padding:4px;">Total</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    printMobileFriendly(content);
};

// --- 5. GENERAR ENLACE DE WHATSAPP ---
export const sendToWhatsApp = (sale: Sale, directClient?: Client) => {
    const { settings, clients } = useStore.getState();
    const client = directClient || clients.find(c => c.id === sale.clientId);
    const phone = client?.phone ? client.phone.replace(/\D/g, '') : '';

    let message = `*${settings.companyName}*\n`;
    message += `🧾 Recibo de Venta #${sale.id.slice(-6)}\n`;
    message += `📅 Fecha: ${new Date(sale.date).toLocaleDateString()}\n`;
    message += `------------------------------\n`;

    sale.items.forEach(item => {
        message += `${item.quantity}x ${item.name} ($${item.priceFinalUSD.toFixed(2)})\n`;
    });

    message += `------------------------------\n`;
    message += `*TOTAL: $${sale.totalUSD.toFixed(2)}*\n`;
    message += `(Bs. ${sale.totalVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })})\n`;

    if (sale.status === 'PENDING') {
        const debt = sale.totalUSD - sale.paidAmountUSD;
        message += `⚠️ *Saldo Pendiente: $${debt.toFixed(2)}*\n`;
    }

    message += `\nGracias por su compra! 🚗`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
};

// --- REPORTE CIERRE DE CAJA (Formato A4 / PDF) ---
export interface DailyCloseReportData {
    type: 'X' | 'Z';
    date: string;
    totalUSD: number;
    totalBs: number;
    txCount: number;
    breakdown: Record<string, number>;
    sellerBreakdown?: Record<string, { count: number; totalUSD: number }>;
    companyName: string;
    reportNumber: string;
    shiftOpenTime?: string;
}

export const printDailyCloseReport = (data: DailyCloseReportData) => {
    const methodRows = Object.entries(data.breakdown)
        .filter(([, v]) => v > 0)
        .map(([method, amount]) => `
            <tr>
                <td style="padding:8px 12px;font-weight:600;color:#374151;">${method}</td>
                <td style="padding:8px 12px;text-align:right;font-weight:700;color:#111827;">$${amount.toFixed(2)}</td>
            </tr>
        `).join('');

    const sellerRows = data.sellerBreakdown
        ? Object.entries(data.sellerBreakdown).map(([seller, { count, totalUSD }]) => `
            <tr>
                <td style="padding:8px 12px;color:#374151;">${seller}</td>
                <td style="padding:8px 12px;text-align:center;color:#6b7280;">${count} op.</td>
                <td style="padding:8px 12px;text-align:right;font-weight:700;color:#111827;">$${totalUSD.toFixed(2)}</td>
            </tr>
        `).join('')
        : '';

    const isZ = data.type === 'Z';
    const html = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#111;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e5e7eb;">
                <div>
                    <h1 style="margin:0;font-size:20px;font-weight:900;color:#111;">${data.companyName}</h1>
                    <p style="margin:4px 0 0;color:#6b7280;font-size:12px;">REPORTE DE ${isZ ? 'CIERRE Z — DEFINITIVO' : 'CORTE X — PARCIAL'}</p>
                </div>
                <div style="text-align:right;">
                    <span style="display:inline-block;padding:6px 16px;border-radius:20px;font-weight:900;font-size:13px;background:${isZ ? '#fee2e2' : '#dbeafe'};color:${isZ ? '#b91c1c' : '#1d4ed8'};">
                        ${isZ ? '🔒 CIERRE Z' : '📊 CORTE X'}
                    </span>
                    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">N° ${data.reportNumber}</p>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;">
                <div style="background:#f9fafb;border-radius:10px;padding:14px;border:1px solid #e5e7eb;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;">Fecha Cierre</p>
                    <p style="margin:0;font-size:13px;font-weight:700;color:#111;">${data.date}</p>
                </div>
                ${data.shiftOpenTime ? `
                <div style="background:#f0fdf4;border-radius:10px;padding:14px;border:1px solid #bbf7d0;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;color:#22c55e;">Apertura</p>
                    <p style="margin:0;font-size:13px;font-weight:700;color:#111;">${data.shiftOpenTime}</p>
                </div>` : '<div></div>'}
                <div style="background:#f9fafb;border-radius:10px;padding:14px;border:1px solid #e5e7eb;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;">Operaciones</p>
                    <p style="margin:0;font-size:24px;font-weight:900;color:#111;">${data.txCount}</p>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
                <div style="background:${isZ ? '#111827' : '#1e3a5f'};color:white;border-radius:12px;padding:20px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;opacity:0.6;">TOTAL USD</p>
                    <p style="margin:0;font-size:32px;font-weight:900;">$${data.totalUSD.toFixed(2)}</p>
                </div>
                <div style="background:#f9fafb;border-radius:12px;padding:20px;border:1px solid #e5e7eb;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;">TOTAL Bs.</p>
                    <p style="margin:0;font-size:28px;font-weight:900;color:#374151;">Bs. ${data.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>

            <div style="margin-bottom:24px;">
                <h3 style="margin:0 0 10px;font-size:13px;font-weight:800;text-transform:uppercase;color:#374151;letter-spacing:0.04em;">💳 Desglose por Método de Pago</h3>
                <table style="width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
                    <thead><tr style="background:#f3f4f6;">
                        <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#9ca3af;">Método</th>
                        <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#9ca3af;">Monto</th>
                    </tr></thead>
                    <tbody>${methodRows}</tbody>
                </table>
            </div>

            ${sellerRows ? `
            <div style="margin-bottom:24px;">
                <h3 style="margin:0 0 10px;font-size:13px;font-weight:800;text-transform:uppercase;color:#374151;letter-spacing:0.04em;">👥 Desglose por Vendedor</h3>
                <table style="width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
                    <thead><tr style="background:#f3f4f6;">
                        <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#9ca3af;">Vendedor</th>
                        <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#9ca3af;">Ops.</th>
                        <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#9ca3af;">Total USD</th>
                    </tr></thead>
                    <tbody>${sellerRows}</tbody>
                </table>
            </div>` : ''}

            <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
                <p style="margin:0;font-size:11px;color:#9ca3af;">Generado el ${new Date().toLocaleString('es-VE')} • ${data.companyName} • Sistema POS Todo en Ruedas</p>
                ${isZ ? '<p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#b91c1c;">⚠ Este es un documento de CIERRE DEFINITIVO — Los contadores han sido reiniciados.</p>' : ''}
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Reporte ${data.type} — ${data.date}</title>
        <style>@page{margin:20px;}body{margin:0;padding:0;background:white;}</style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
};
import type { Quote } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// PDF COTIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────
export const printQuoteReport = (quote: Quote, companyName: string, rate: number) => {
    const statusLabels: Record<string, string> = {
        DRAFT: 'Borrador', SENT: 'Enviada', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', EXPIRED: 'Expirada',
    };
    const statusColors: Record<string, string> = {
        DRAFT: '#64748b', SENT: '#2563eb', ACCEPTED: '#16a34a', REJECTED: '#dc2626', EXPIRED: '#9ca3af',
    };

    const totalUSD = quote.totalUSD;
    const totalBs = totalUSD * rate;

    const html = `
        <div style="font-family:Inter,system-ui,sans-serif;max-width:800px;margin:0 auto;color:#111827;">
            <!-- HEADER -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #dc2626;margin-bottom:24px;">
                <div>
                    <h1 style="margin:0;font-size:28px;font-weight:900;color:#111827;">${companyName}</h1>
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Sistema de Punto de Venta</p>
                </div>
                <div style="text-align:right;">
                    <div style="background:#dc2626;color:white;padding:8px 18px;border-radius:10px;font-size:20px;font-weight:900;letter-spacing:0.03em;">COTIZACIÓN</div>
                    <p style="margin:8px 0 2px;font-size:12px;color:#6b7280;">N° de Referencia</p>
                    <p style="margin:0;font-size:15px;font-weight:700;font-family:monospace;">#${quote.number || quote.id.slice(-8).toUpperCase()}</p>
                </div>
            </div>

            <!-- INFO -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
                <div style="background:#f9fafb;padding:16px;border-radius:10px;">
                    <p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;font-weight:700;color:#6b7280;letter-spacing:0.1em;">Cliente</p>
                    <p style="margin:0;font-size:15px;font-weight:800;color:#111827;">${quote.clientName || 'Sin Cliente Asignado'}</p>
                </div>
                <div style="background:#f9fafb;padding:16px;border-radius:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:11px;color:#6b7280;font-weight:600;">Fecha de emisión</span>
                        <span style="font-size:11px;font-weight:700;">${new Date(quote.date).toLocaleDateString('es-VE')}</span>
                    </div>
                    ${quote.validUntil ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:11px;color:#6b7280;font-weight:600;">Válida hasta</span>
                        <span style="font-size:11px;font-weight:700;">${new Date(quote.validUntil).toLocaleDateString('es-VE')}</span>
                    </div>` : ''}
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-size:11px;color:#6b7280;font-weight:600;">Estado</span>
                        <span style="font-size:11px;font-weight:800;color:${statusColors[quote.status] || '#111827'};">${statusLabels[quote.status] || quote.status}</span>
                    </div>
                </div>
            </div>

            <!-- TABLA DE ÍTEMS -->
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <thead>
                    <tr style="background:#1f2937;color:white;">
                        <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Código</th>
                        <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;">Descripción</th>
                        <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Cant.</th>
                        <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;">P. Unit. USD</th>
                        <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;">Subtotal USD</th>
                    </tr>
                </thead>
                <tbody>
                    ${quote.items.map((item, i) => `
                    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                        <td style="padding:10px 12px;font-size:11px;font-family:monospace;color:#6b7280;">${item.sku}</td>
                        <td style="padding:10px 12px;font-size:12px;font-weight:600;">${item.name}</td>
                        <td style="padding:10px 12px;text-align:center;font-size:12px;font-weight:700;">${item.quantity}</td>
                        <td style="padding:10px 12px;text-align:right;font-size:12px;">$${item.priceFinalUSD.toFixed(2)}</td>
                        <td style="padding:10px 12px;text-align:right;font-size:12px;font-weight:700;">$${(item.priceFinalUSD * item.quantity).toFixed(2)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>

            <!-- TOTALES -->
            <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
                <div style="width:280px;background:#f9fafb;border-radius:10px;padding:16px;">
                    <div style="display:flex;justify-content:space-between;padding-top:10px;border-top:2px solid #e5e7eb;">
                        <span style="font-size:14px;font-weight:800;">TOTAL USD</span>
                        <span style="font-size:18px;font-weight:900;color:#dc2626;">$${totalUSD.toFixed(2)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:6px;">
                        <span style="font-size:11px;color:#6b7280;">Ref. Bs. (${rate.toFixed(2)})</span>
                        <span style="font-size:11px;font-weight:700;">Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>

            ${quote.notes ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin-bottom:20px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;">Observaciones</p>
                <p style="margin:0;font-size:12px;color:#78350f;">${quote.notes}</p>
            </div>` : ''}

            <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
                <p style="margin:0;font-size:11px;color:#9ca3af;">Esta cotización es válida por los días indicados • ${companyName} • Generado el ${new Date().toLocaleString('es-VE')}</p>
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Cotización #${quote.number || quote.id.slice(-8).toUpperCase()} — ${companyName}</title>
        <style>@page{margin:20px;}body{margin:0;padding:20px;background:white;}</style>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
};
