/**
 * @file utils/quoteGenerator.ts
 * @description Generador de tickets para Cotizaciones.
 */

import type { Quote, AppSettings } from '../types';

const printMobileFriendly = (content: string) => {
    let printArea = document.getElementById('print-area');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'print-area';
        document.body.appendChild(printArea);
    }
    printArea.innerHTML = content;

    const styleId = 'print-styles';
    if (!document.getElementById(styleId)) {
        const styleTag = document.createElement('style');
        styleTag.id = styleId;
        styleTag.innerHTML = `
            @media screen { #print-area { display: none; } }
            @media print {
                body * { visibility: hidden; }
                #root, #root * { display: none; }
                #print-area, #print-area * { visibility: visible; display: block; }
                #print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
                body { font-family: 'Courier New', monospace; font-size: 12px; color: black; background: white; }
                .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                .title { font-size: 16px; font-weight: bold; margin: 5px 0; }
                .subtitle { font-size: 10px; text-transform: uppercase; }
                .divider { border-top: 1px dashed #000; margin: 5px 0; }
                .item { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 6px; }
                .footer { text-align: center; margin-top: 20px; font-size: 10px; }
                .bold { font-weight: bold; }
            }
        `;
        document.head.appendChild(styleTag);
    }
    setTimeout(() => window.print(), 200);
};

export const printMobileQuote = (quote: Quote, settings: AppSettings) => {
    let itemsHTML = '';
    quote.items.forEach(item => {
        const subtotal = item.priceFinalUSD * item.quantity;
        itemsHTML += `
            <div style="margin-bottom: 4px;">
                <div style="font-weight:bold;">${item.name}</div>
                <div class="item">
                    <span>${item.quantity} x $${item.priceFinalUSD.toFixed(2)}</span>
                    <span>$${subtotal.toFixed(2)}</span>
                </div>
            </div>
        `;
    });

    const content = `
        <div class="header">
            <div class="title">${settings.companyName}</div>
            <div class="subtitle">${settings.rifType}-${settings.rif}</div>
            <div class="subtitle">${settings.address || ''}</div>
            <div class="divider"></div>
            <div class="title">COTIZACIÓN</div>
            <div><strong>Nº:</strong> ${quote.number}</div>
            <div>Fecha: ${new Date(quote.date).toLocaleDateString('es-VE')}</div>
            <div>Válida hasta: ${new Date(quote.validUntil).toLocaleDateString('es-VE')}</div>
            ${quote.clientName ? `<div class="divider"></div><div style="text-align:left"><strong>Cliente:</strong> ${quote.clientName}</div>` : ''}
        </div>

        <div class="divider"></div>
        ${itemsHTML}
        <div class="divider"></div>

        <div class="total-row">
            <span>TOTAL USD</span>
            <span>$${quote.totalUSD.toFixed(2)}</span>
        </div>
        <div class="item" style="font-size:10px; margin-top:2px;">
            <span>Ref. Bs (Tasa ${settings.tasaBCV}):</span>
            <span>Bs ${quote.totalBs.toFixed(2)}</span>
        </div>

        ${quote.notes ? `<div class="divider"></div><div style="font-size:10px;"><strong>Condiciones:</strong><br>${quote.notes}</div>` : ''}

        <div class="footer">
            <p>Esta cotización no constituye una factura.</p>
            <p>Generado por ${settings.companyName}</p>
        </div>
    `;

    printMobileFriendly(content);
};
