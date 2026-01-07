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

const getSettings = () => useStore.getState().settings;

// =================================================================
// 1. REPORTE X/Z (TICKET 80mm)
// =================================================================
export const printTicket = (data: TicketData) => {
  const settings = getSettings();
  const isBsMain = settings.printerCurrency === 'BS';
  const rate = settings.tasaBCV;

  const mainTotal = isBsMain ? `Bs. ${data.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : formatCurrency(data.totalUSD, 'USD');
  const subTotal = isBsMain ? `(REF USD: ${formatCurrency(data.totalUSD, 'USD')})` : `(REF Bs: ${data.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})`;

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const title = data.type === 'Z' ? 'CIERRE DIARIO (Z)' : 'CORTE PARCIAL (X)';
  const numberRow = data.type === 'Z' ? `<div style="display:flex; justify-content:space-between;"><span>NO. REPORTE:</span><span>${data.reportNumber}</span></div>` : '';

  let rowsUSD = '';
  let rowsBs = '';
  let totalInUsdMethods = 0;
  let totalInBsMethods = 0;

  Object.entries(data.breakdown).forEach(([methodName, amountInUSD]) => {
    const methodInfo = data.paymentMethods.find(pm => pm.name === methodName);
    const currency = methodInfo ? methodInfo.currency : 'USD';

    if (currency === 'USD') {
      totalInUsdMethods += amountInUSD;
      rowsUSD += `<div style="display:flex; justify-content:space-between;"><span>${methodName.toUpperCase()}</span><span>${formatCurrency(amountInUSD, 'USD')}</span></div>`;
    } else {
      const amountInBs = amountInUSD * rate;
      totalInBsMethods += amountInBs;
      rowsBs += `<div style="display:flex; justify-content:space-between;"><span>${methodName.toUpperCase()}</span><span>Bs. ${amountInBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div>`;
    }
  });

  const base = data.totalBs / 1.16;
  const iva = data.totalBs - base;

  const htmlContent = `
    <html>
      <head>
        <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 10px; text-transform: uppercase; color: #000; }
            .container { max-width: 300px; margin: 0 auto; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            .row { display: flex; justify-content: space-between; }
            .small { font-size: 10px; }
            .section-title { font-weight: bold; text-align: center; margin-top: 5px; margin-bottom: 2px; text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="center bold">SENIAT<br/>${settings.companyName}<br/>RIF: ${settings.rifType}-${settings.rif}<br/>${settings.address}</div>
          <div class="divider"></div>
          <div class="row"><span class="bold">REPORTE ${data.type}</span><span class="bold">${title}</span></div>
          ${numberRow}
          <div class="row"><span>FECHA: ${data.date}</span><span>HORA: ${new Date().toLocaleTimeString('es-ES')}</span></div>
          <div class="divider"></div>
          <div class="center bold" style="margin-bottom:5px">RESUMEN DE VENTAS</div>
          <div class="row"><span>FACTURAS EMITIDAS:</span><span>${data.itemsCount}</span></div>
          <br/>
          <div class="row"><span>BASE IMPONIBLE (G):</span><span>Bs. ${base.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div>
          <div class="row"><span>IVA (G) 16%:</span><span>Bs. ${iva.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div>
          <div class="divider"></div>
          <div class="row bold" style="font-size:14px"><span>TOTAL VENTA:</span><span>${mainTotal}</span></div>
          <div class="row small" style="margin-top:2px;justify-content:flex-end"><span>${subTotal}</span></div>
          <div class="divider"></div>
          ${rowsUSD ? `<div class="section-title">PAGOS EN DIVISAS ($)</div>${rowsUSD}<div style="text-align:right; font-weight:bold; margin-top:2px; border-top:1px solid #000">TOTAL USD: ${formatCurrency(totalInUsdMethods, 'USD')}</div><br/>` : ''}
          ${rowsBs ? `<div class="section-title">PAGOS EN BOLÍVARES (Bs)</div>${rowsBs}<div style="text-align:right; font-weight:bold; margin-top:2px; border-top:1px solid #000">TOTAL Bs: Bs. ${totalInBsMethods.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>` : ''}
          <div class="divider"></div>
          <div class="center">REPORTE DE CONTROL INTERNO<br/>NO FISCAL</div>
          <br/><br/><br/>
          <div class="row center"><div style="border-top:1px dashed #000;width:45%;padding-top:5px">CAJERO</div><div style="border-top:1px dashed #000;width:45%;padding-top:5px">SUPERVISOR</div></div>
        </div>
      </body>
    </html>`;

  doc.open(); doc.write(htmlContent); doc.close();
  iframe.onload = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000); };
};

// =================================================================
// 2. FACTURA INDIVIDUAL (TICKET 80mm)
// =================================================================
export const printInvoice = (sale: Sale) => {
  const settings = getSettings();
  const isBsMain = settings.printerCurrency === 'BS';
  const rate = settings.tasaBCV;

  const itemsRows = sale.items.map(item => {
    const totalPriceUSD = item.priceFinalUSD * item.quantity;
    const totalPriceBs = totalPriceUSD * rate;

    const displayTotal = isBsMain
      ? `Bs. ${totalPriceBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
      : formatCurrency(totalPriceUSD, 'USD');

    const displayRef = isBsMain
      ? `(Ref: ${formatCurrency(totalPriceUSD, 'USD')})`
      : ''; // Si es USD principal, no solemos poner ref en Bs en cada línea

    return `<div style="margin-bottom: 8px;"><div style="display:flex; justify-content:space-between;"><span>${item.quantity} x ${item.name.substring(0, 18)}</span><span style="font-weight:bold">${displayTotal}</span></div>${isBsMain ? `<div style="text-align:right; font-size:9px; color:#333;">${displayRef}</div>` : ''}</div>`;
  }).join('');

  const mainTotal = isBsMain ? `Bs. ${sale.totalVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : formatCurrency(sale.totalUSD, 'USD');
  const subTotal = isBsMain ? `(REF TOTAL: ${formatCurrency(sale.totalUSD, 'USD')})` : `(REF TOTAL: Bs. ${sale.totalVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })})`;

  const baseBs = sale.totalVED / 1.16;
  const ivaBs = sale.totalVED - baseBs;

  const htmlContent = `<html><head><style>body{font-family:'Courier New',monospace;font-size:12px;margin:0;padding:10px;text-transform:uppercase;color:#000}.container{max-width:300px;margin:0 auto}.center{text-align:center}.bold{font-weight:bold}.divider{border-bottom:1px dashed #000;margin:10px 0}.row{display:flex;justify-content:space-between}.right{text-align:right}</style></head><body><div class="container"><div class="center bold">SENIAT<br/>${settings.companyName}<br/>RIF: ${settings.rifType}-${settings.rif}<br/>${settings.address}</div><div class="divider"></div><div class="row"><span>FACTURA</span><span>${sale.id.slice(-6)}</span></div><div class="row"><span>FECHA:</span><span>${new Date(sale.date).toLocaleDateString('es-ES')}</span></div><div class="row"><span>HORA:</span><span>${new Date(sale.date).toLocaleTimeString('es-ES')}</span></div><div class="row"><span>CLIENTE:</span><span>CONTADO</span></div><div class="row"><span>RIF/CI:</span><span>V-00000000</span></div><div class="divider"></div><div class="center bold" style="margin-bottom:5px">DETALLE DE COMPRA</div>${itemsRows}<div class="divider"></div><div class="row"><span>SUBTOTAL (G):</span><span>Bs. ${baseBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div><div class="row"><span>IVA (G) 16%:</span><span>Bs. ${ivaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div><div class="divider"></div><div class="row bold" style="font-size:16px"><span>TOTAL A PAGAR:</span></div><div class="right bold" style="font-size:18px; margin-bottom:5px">${mainTotal}</div><div class="right" style="font-size:11px">${subTotal}</div><div class="divider"></div><div class="row"><span>FORMA PAGO:</span><span>${sale.paymentMethod || 'EFECTIVO'}</span></div><br/><br/><div class="center">GRACIAS POR SU COMPRA</div></div></body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (doc) { doc.open(); doc.write(htmlContent); doc.close(); iframe.onload = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000); }; }
};

// =================================================================
// 3. REPORTE LISTA (CARTA - A4) - AHORA CON DOBLE MONEDA
// =================================================================
export const printSalesList = (sales: Sale[], startDate: string, endDate: string) => {
  const settings = getSettings();
  const isBsMain = settings.printerCurrency === 'BS';

  // Totales del Periodo
  const totalUSD = sales.reduce((acc, s) => acc + s.totalUSD, 0);
  const totalBs = sales.reduce((acc, s) => acc + s.totalVED, 0);

  const mainTotalPeriod = isBsMain ? `Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : formatCurrency(totalUSD, 'USD');
  const subTotalPeriod = isBsMain ? formatCurrency(totalUSD, 'USD') : `Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;

  const symbol = isBsMain ? 'Bs.' : '$';

  const rows = sales.map(s => {
    // MONEDA DE CADA FILA
    const rowMain = isBsMain
      ? `Bs. ${s.totalVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
      : formatCurrency(s.totalUSD, 'USD');

    const rowSub = isBsMain
      ? formatCurrency(s.totalUSD, 'USD')
      : `Bs. ${s.totalVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;

    return `
        <tr>
            <td>${new Date(s.date).toLocaleDateString('es-ES')} ${new Date(s.date).toLocaleTimeString('es-ES')}</td>
            <td>${s.id.slice(-6)}</td>
            <td>${s.paymentMethod || 'Efectivo'}</td>
            <td>${s.status === 'CANCELLED' ? '<span style="color:red">ANULADA</span>' : 'COMPLETADA'}</td>
            <td style="text-align:right">
                <div style="font-weight:bold; font-size:12px;">${rowMain}</div>
                <div style="font-size:10px; color:#555;">${rowSub}</div>
            </td>
        </tr>`;
  }).join('');

  const htmlContent = `
        <html>
        <head>
            <title>Reporte_Ventas</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
                h1 { text-align: center; margin-bottom: 5px; font-size: 18px; text-transform: uppercase; }
                p { text-align: center; margin-top: 0; color: #555; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: middle; }
                th { background-color: #f2f2f2; font-weight: bold; }
                .total-row td { border-top: 2px solid #000; font-weight: bold; font-size: 14px; background-color: #e8e8e8; }
                .right { text-align: right; }
            </style>
        </head>
        <body>
            <h1>${settings.companyName}</h1>
            <p>${settings.rifType}-${settings.rif} | ${settings.address}</p>
            <p style="margin-top:10px; font-weight:bold;">REPORTE DETALLADO DE VENTAS</p>
            <p><strong>RANGO:</strong> ${startDate || 'INICIO'} - ${endDate || 'HOY'}</p>
            <table>
                <thead>
                    <tr><th>FECHA/HORA</th><th>TICKET</th><th>MÉTODO</th><th>ESTADO</th><th class="right">TOTAL (${symbol})</th></tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr class="total-row">
                        <td colspan="4" class="right">TOTAL PERIODO:</td>
                        <td class="right">
                            <div>${mainTotalPeriod}</div>
                            <div style="font-size:10px; font-weight:normal;">${subTotalPeriod}</div>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div style="margin-top: 30px; font-size: 10px; color: #888; text-align: center;">Generado el ${new Date().toLocaleString()}</div>
        </body>
        </html>
    `;

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open(); doc.write(htmlContent); doc.close();
    iframe.onload = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000); };
  }
};