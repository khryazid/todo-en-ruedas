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
  const costUSD = product.cost + (product.freight || 0);
  const margin = product.customMargin ?? settings.defaultMargin;
  const vat = product.customVAT ?? settings.defaultVAT;

  // 1. Precio base = Costo + Margen + IVA
  const basePrice = Math.round((costUSD * (1 + margin / 100) * (1 + vat / 100)) * 100) / 100;

  // 2. LÓGICA TH (CAMUFLAJE BCV)
  let finalPriceUSD = basePrice;
  if (product.costType === 'TH') {
    const tasaTH = settings.tasaTH || 0;
    const tasaBCV = settings.tasaBCV || 0;

    if (tasaTH > 0 && tasaBCV > 0) {
      // Convertir: precio TH en Bs / tasa BCV = precio equivalente en USD al BCV
      finalPriceUSD = (basePrice * tasaTH) / tasaBCV;
    }
    // Si las tasas no están configuradas, finalPriceUSD = basePrice (sin ajuste)
  }

  // Redondear USD a 2 decimales
  finalPriceUSD = Math.round(finalPriceUSD * 100) / 100;

  // 3. Bs = USD × tasa BCV
  const tasaBCV = settings.tasaBCV || 0;
  const finalPriceVED = tasaBCV > 0
    ? Math.round((finalPriceUSD * tasaBCV) * 100) / 100
    : 0;

  return {
    baseCost: costUSD,
    basePrice,      // Precio base antes de la conversión TH (útil para mostrar P.TH)
    finalPriceUSD,
    finalPriceVED,
    margin,
    vat
  };
};