/**
 * @file ticketGenerator.ts
 * @description Motor de generación de tickets y reportes.
 * OPTIMIZADO PARA MÓVIL: Usa reemplazo del cuerpo del documento en lugar de pop-ups.
 */

import type { Sale, AppSettings, PaymentMethod } from '../types';
import { useStore } from '../store/useStore';

// --- 1. FUNCIÓN MAESTRA DE IMPRESIÓN (MÓVIL FRIENDLY) ---
// Esta función reemplaza la pantalla actual, imprime y recarga.
const printMobileFriendly = (content: string) => {
    // 1. Guardar estilos base para impresión térmica
    const style = `
        <style>
            body { 
                font-family: 'Courier New', monospace; 
                font-size: 12px; 
                margin: 0; 
                padding: 10px; 
                color: #000; 
                background: #fff; 
                width: 100%;
            }
            .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
            .title { font-size: 16px; font-weight: bold; margin: 5px 0; }
            .subtitle { font-size: 10px; text-transform: uppercase; }
            .divider { border-top: 1px dashed #000; margin: 5px 0; }
            .item { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .totals { margin-top: 10px; border-top: 1px dashed #000; padding-top: 5px; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; }
            .bold { font-weight: bold; }
            
            /* Ocultar elementos de la interfaz si quedara algo */
            @media print {
                @page { margin: 0; size: auto; }
                body { margin: 0; }
                .no-print { display: none; }
            }
        </style>
    `;

    // 2. Construir el HTML final
    const fullHTML = `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                ${style}
            </head>
            <body>
                ${content}
                <script>
                    // Esperar un momento para asegurar que el renderizado esté listo
                    setTimeout(() => {
                        window.print();
                        // En móviles, es mejor recargar después de imprimir para recuperar los eventos de React
                        // Un pequeño delay para que no corte el diálogo de impresión
                        setTimeout(() => {
                           window.location.reload();
                        }, 500);
                    }, 500);
                </script>
            </body>
        </html>
    `;

    // 3. Reemplazar el documento actual (La técnica "Body Swap")
    document.open();
    document.write(fullHTML);
    document.close();
};


// --- 2. IMPRIMIR FACTURA DE VENTA (TICKET) ---
export const printInvoice = (sale: Sale) => {
    const { settings, clients } = useStore.getState();
    const client = clients.find(c => c.id === sale.clientId);

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
// (Esta función se mantiene igual porque no usa impresión)
export const sendToWhatsApp = (sale: Sale) => {
    const { settings, clients } = useStore.getState();
    const client = clients.find(c => c.id === sale.clientId);

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