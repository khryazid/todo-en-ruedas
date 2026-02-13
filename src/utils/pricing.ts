/**
 * @file pricing.ts
 * @description Utilidades para cálculo de precios y formateo de moneda.
 */

import type { Product, AppSettings } from '../types';

export const formatCurrency = (amount: number, currency: 'USD' | 'BS') => {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `Bs. ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const calculatePrices = (product: Product, settings: AppSettings) => {
  let costUSD = product.cost + (product.freight || 0);
  const margin = product.customMargin ?? settings.defaultMargin;
  const vat = product.customVAT ?? settings.defaultVAT;

  // 1. Calculamos el precio base (Costo + Margen + IVA) y redondeamos a 2 decimales (ej. 1.508 -> 1.51)
  const basePrice = Math.round((costUSD * (1 + margin / 100) * (1 + vat / 100)) * 100) / 100;

  // 2. LÓGICA DE LA ILUSIÓN (CAMUFLAJE BCV)
  let finalPriceUSD = basePrice;
  if (product.costType === 'TH') {
    // Si es TH, multiplicamos por TH para saber los Bs reales, y dividimos entre BCV para "inflar" el USD
    finalPriceUSD = (basePrice * settings.tasaTH) / settings.tasaBCV;
  }

  // Redondeamos el USD final a 2 decimales para mostrar en pantalla
  finalPriceUSD = Math.round(finalPriceUSD * 100) / 100;

  // 3. El precio en Bolívares SIEMPRE es el finalPriceUSD multiplicado estrictamente por BCV
  const finalPriceVED = Math.round((finalPriceUSD * settings.tasaBCV) * 100) / 100;

  return {
    baseCost: costUSD,
    finalPriceUSD,
    finalPriceVED,
    margin,
    vat
  };
};