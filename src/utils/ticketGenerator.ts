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
