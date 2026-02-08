/**
 * @file ticketGenerator.ts
 * @description Motor de generación de tickets y reportes.
 * Maneja la impresión térmica y la generación de mensajes para WhatsApp.
 */

// CORRECCIÓN AQUÍ: Agregamos 'type' para satisfacer verbatimModuleSyntax
import type { Sale, AppSettings, PaymentMethod } from '../types';
import { useStore } from '../store/useStore'; // useStore es una función (valor), así que se queda igual

// Helper para formatear moneda
const format = (amount: number, currency: 'USD' | 'BS') => {
  return currency === 'USD'
    ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `Bs. ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// --- 1. GENERADOR DE HTML PARA IMPRESIÓN ---
const generateHTML = (title: string, content: string) => {
  return `
    <html>
        <head>
            <title>${title}</title>
            <style>
                body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 0; color: #000; }
                .container { width: 100%; max-width: 300px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                .title { font-size: 16px; font-weight: bold; margin: 5px 0; }
                .subtitle { font-size: 10px; text-transform: uppercase; }
                .divider { border-top: 1px dashed #000; margin: 5px 0; }
                .item { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .item-name { font-weight: bold; }
                .totals { margin-top: 10px; border-top: 1px dashed #000; padding-top: 5px; }
                .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
                .footer { text-align: center; margin-top: 20px; font-size: 10px; }
                .bold { font-weight: bold; }
                @media print {
                    @page { margin: 0; size: auto; }
                    body { margin: 5mm; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                ${content}
            </div>
            <script>
                window.onload = function() { window.print(); window.close(); }
            </script>
        </body>
    </html>
    `;
};

// --- 2. IMPRIMIR FACTURA DE VENTA (TICKET) ---
export const printInvoice = (sale: Sale) => {
  const { settings, clients } = useStore.getState();
  const client = clients.find(c => c.id === sale.clientId);

  const date = new Date(sale.date).toLocaleString('es-VE');
  const currency = settings.printerCurrency || 'BS'; // Moneda preferida para imprimir

  // Convertir montos si la impresión es en Bs
  const rate = settings.tasaBCV;
  const convert = (usd: number) => currency === 'BS' ? usd * rate : usd;
  const symbol = currency === 'BS' ? 'Bs.' : '$';

  let itemsHTML = '';
  sale.items.forEach(item => {
    const price = convert(item.priceFinalUSD);
    const subtotal = price * item.quantity;
    itemsHTML += `
            <div style="margin-bottom: 4px;">
                <div class="item-name">${item.name}</div>
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

  const w = window.open('', '_blank', 'width=400,height=600');
  if (w) w.document.write(generateHTML('Recibo de Venta', content));
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

  const w = window.open('', '_blank', 'width=400,height=600');
  if (w) w.document.write(generateHTML(typeLabel, content));
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
                <td>${new Date(s.date).toLocaleDateString()}</td>
                <td>#${s.id.slice(-4)}</td>
                <td>${clientName.substring(0, 10)}</td>
                <td style="text-align:right">$${s.totalUSD.toFixed(2)}</td>
            </tr>
        `;
  });

  const html = `
    <html>
    <head>
        <title>Reporte de Ventas</title>
        <style>
            body { font-family: sans-serif; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border-bottom: 1px solid #ddd; padding: 5px; text-align: left; }
            th { background-color: #f0f0f0; }
            .header { text-align: center; margin-bottom: 20px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>Reporte de Ventas</h2>
            <p>Periodo: ${start || 'Inicio'} - ${end || 'Fin'}</p>
            <p><strong>Total Periodo: $${total.toFixed(2)}</strong></p>
        </div>
        <table>
            <thead><tr><th>Fecha</th><th>Ticket</th><th>Cliente</th><th style="text-align:right">Total</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <script>window.print();</script>
    </body>
    </html>
    `;

  const w = window.open('', '_blank', 'width=800,height=600');
  if (w) w.document.write(html);
};

// --- 5. GENERAR ENLACE DE WHATSAPP ---
export const sendToWhatsApp = (sale: Sale) => {
  const { settings, clients } = useStore.getState();
  const client = clients.find(c => c.id === sale.clientId);

  // Si el cliente tiene teléfono, lo usamos. Si no, dejamos el número vacío para que el usuario elija contacto.
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