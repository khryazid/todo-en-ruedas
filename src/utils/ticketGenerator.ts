/**
 * @file ticketGenerator.ts
 * @description Generador de documentos imprimibles (Tickets térmicos y Reportes A4).
 * Solución híbrida para PC (iframe) y Móvil (Popup) para asegurar compatibilidad.
 */

import { formatCurrency } from './pricing';
import type { Sale, PaymentMethod } from '../types';
import { useStore } from '../store/useStore';

interface TicketData {
  type: 'X' | 'Z';
  date: string;
  totalUSD: number;
  totalBs: number;
  itemsCount: number;
  breakdown: Record<string, number>;
  reportNumber?: string;
  paymentMethods: PaymentMethod[];
}

// Estilos compartidos para tickets de 80mm
const TICKET_STYLES = `
  body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 5px; text-transform: uppercase; color: #000; }
  .container { width: 100%; max-width: 280px; margin: 0 auto; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
  .row { display: flex; justify-content: space-between; }
  .small { font-size: 10px; }
  .big { font-size: 16px; }
  .section-title { font-weight: bold; text-align: center; margin-top: 5px; margin-bottom: 2px; text-decoration: underline; }
`;

const getSettings = () => useStore.getState().settings;

/**
 * Detecta si el usuario está en un dispositivo móvil
 */
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Función Maestra de Impresión
 * Usa estrategias diferentes para PC y Móvil.
 */
const printHTML = (htmlContent: string) => {
  if (isMobile()) {
    // ESTRATEGIA MÓVIL: Popup (Fuerza renderizado visual)
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("⚠️ Permite las ventanas emergentes para imprimir.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Esperar carga de estilos
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);

  } else {
    // ESTRATEGIA PC: Iframe Oculto (Invisible y elegante)
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 100);
    };
  }
};

// =================================================================
// 1. REPORTE X/Z (CIERRE DE CAJA)
// =================================================================
export const printTicket = (data: TicketData) => {
  const settings = getSettings();
  const rate = settings.tasaBCV;

  const title = data.type === 'Z' ? 'CIERRE DIARIO (Z)' : 'CORTE PARCIAL (X)';
  const numberRow = data.type === 'Z' ? `<div class="row"><span>NO. REPORTE:</span><span>${data.reportNumber}</span></div>` : '';

  let rowsUSD = '';
  let rowsBs = '';
  let totalInUsdMethods = 0;
  let totalInBsMethods = 0;

  Object.entries(data.breakdown).forEach(([methodName, amountInUSD]) => {
    const methodInfo = data.paymentMethods.find(pm => pm.name === methodName);
    const currency = methodInfo ? methodInfo.currency : 'USD';

    if (currency === 'USD') {
      totalInUsdMethods += amountInUSD;
      rowsUSD += `<div class="row"><span>${methodName}</span><span>${formatCurrency(amountInUSD, 'USD')}</span></div>`;
    } else {
      const amountInBs = amountInUSD * rate;
      totalInBsMethods += amountInBs;
      rowsBs += `<div class="row"><span>${methodName}</span><span>Bs. ${amountInBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div>`;
    }
  });

  const base = data.totalBs / 1.16;
  const iva = data.totalBs - base;

  const htmlContent = `
    <html>
      <head><style>${TICKET_STYLES}</style></head>
      <body>
        <div class="container">
          <div class="center bold big">${settings.companyName}</div>
          <div class="center small">RIF: ${settings.rifType}-${settings.rif}</div>
          <div class="center small mb-2">${settings.address}</div>
          <div class="divider"></div>
          <div class="row bold"><span class="big">${title}</span></div>
          ${numberRow}
          <div class="row"><span>FECHA: ${data.date}</span><span>HORA: ${new Date().toLocaleTimeString('es-ES')}</span></div>
          <div class="divider"></div>
          <div class="center bold">RESUMEN DE VENTAS</div>
          <div class="row"><span>TICKETS EMITIDOS:</span><span>${data.itemsCount}</span></div>
          <br/>
          <div class="row"><span>BASE IMPONIBLE (G):</span><span>Bs. ${base.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div>
          <div class="row"><span>IVA (G) 16%:</span><span>Bs. ${iva.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div>
          <div class="divider"></div>
          <div class="row bold big"><span>TOTAL VENTA:</span><span>${formatCurrency(data.totalUSD, 'USD')}</span></div>
          <div class="row small right"><span>(Bs. ${data.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})</span></div>
          <div class="divider"></div>
          ${rowsUSD ? `<div class="section-title">DIVISAS ($)</div>${rowsUSD}<div class="right bold" style="border-top:1px solid #000">TOTAL USD: ${formatCurrency(totalInUsdMethods, 'USD')}</div><br/>` : ''}
          ${rowsBs ? `<div class="section-title">BOLÍVARES (Bs)</div>${rowsBs}<div class="right bold" style="border-top:1px solid #000">TOTAL Bs: Bs. ${totalInBsMethods.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>` : ''}
          <div class="divider"></div>
          <div class="center bold">REPORTE INTERNO NO FISCAL</div>
          <br/><br/>
          <div class="row center"><div style="border-top:1px dashed #000;width:40%;padding-top:5px">CAJERO</div><div style="border-top:1px dashed #000;width:40%;padding-top:5px">SUPERVISOR</div></div>
        </div>
      </body>
    </html>`;

  printHTML(htmlContent);
};

// =================================================================
// 2. FACTURA DE VENTA (TICKET 80mm) --> ¡ESTA ERA LA QUE FALTABA!
// =================================================================
export const printInvoice = (sale: Sale) => {
  const settings = getSettings();
  const rate = settings.tasaBCV;
  const isBsMain = settings.printerCurrency === 'BS';

  const itemsRows = sale.items.map(item => {
    const totalLineUSD = item.priceFinalUSD * item.quantity;
    const totalLineBs = totalLineUSD * rate;
    const displayTotal = isBsMain ? `Bs. ${totalLineBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : formatCurrency(totalLineUSD, 'USD');

    return `
      <div style="margin-bottom: 5px;">
        <div class="row"><span>${item.quantity} x ${item.name.substring(0, 20)}</span><span class="bold">${displayTotal}</span></div>
        ${!isBsMain ? `<div class="right small text-gray-500">Ref Bs: ${totalLineBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })}</div>` : ''}
      </div>`;
  }).join('');

  const mainTotal = isBsMain ? `Bs. ${sale.totalVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : formatCurrency(sale.totalUSD, 'USD');
  const subTotalRef = isBsMain ? `REF USD: ${formatCurrency(sale.totalUSD, 'USD')}` : `REF Bs: ${sale.totalVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;

  const htmlContent = `
    <html>
      <head><style>${TICKET_STYLES}</style></head>
      <body>
        <div class="container">
          <div class="center bold big">${settings.companyName}</div>
          <div class="center small">RIF: ${settings.rifType}-${settings.rif}</div>
          <div class="center small">${settings.address}</div>
          <div class="divider"></div>
          <div class="row"><span>TICKET DE VENTA</span><span class="bold">#${sale.id.slice(-6)}</span></div>
          <div class="row"><span>FECHA:</span><span>${new Date(sale.date).toLocaleString('es-ES')}</span></div>
          <div class="row"><span>CLIENTE:</span><span>CONTADO</span></div>
          <div class="divider"></div>
          <div class="center bold mb-2">DETALLE DE CONSUMO</div>
          ${itemsRows}
          <div class="divider"></div>
          <div class="row bold big"><span>TOTAL A PAGAR:</span></div>
          <div class="right bold big">${mainTotal}</div>
          <div class="right small">${subTotalRef}</div>
          <div class="divider"></div>
          <div class="row"><span>MÉTODO:</span><span>${sale.paymentMethod || 'EFECTIVO'}</span></div>
          <br/>
          <div class="center bold">¡GRACIAS POR SU COMPRA!</div>
        </div>
      </body>
    </html>`;

  printHTML(htmlContent);
};

// =================================================================
// 3. REPORTE LISTA (CARTA - A4)
// =================================================================
export const printSalesList = (sales: Sale[], startDate: string, endDate: string) => {
  const settings = getSettings();
  const totalUSD = sales.reduce((acc, s) => acc + s.totalUSD, 0);
  const rows = sales.map(s => `<tr><td>${new Date(s.date).toLocaleString()}</td><td>${s.id.slice(-6)}</td><td>${s.paymentMethod || 'Variado'}</td><td>${s.status === 'CANCELLED' ? 'ANULADA' : 'OK'}</td><td style="text-align:right">${formatCurrency(s.totalUSD, 'USD')}</td></tr>`).join('');

  const htmlContent = `
    <html>
      <head>
        <title>Reporte de Ventas</title>
        <style>body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; } table { width: 100%; border-collapse: collapse; margin-top: 20px; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #f2f2f2; } .right { text-align: right; } .header { text-align: center; margin-bottom: 20px; }</style>
      </head>
      <body>
        <div class="header"><h1>${settings.companyName}</h1><p>Reporte Detallado de Ventas</p><p>${startDate || 'Inicio'} - ${endDate || 'Hoy'}</p></div>
        <table><thead><tr><th>Fecha</th><th>Ticket</th><th>Método</th><th>Estado</th><th class="right">Total ($)</th></tr></thead><tbody>${rows}<tr><td colspan="4" class="right bold">TOTAL PERIODO:</td><td class="right bold">${formatCurrency(totalUSD, 'USD')}</td></tr></tbody></table>
      </body>
    </html>`;

  printHTML(htmlContent);
};