/**
 * @file pricing.ts
 * @description Utilidades para cálculo de precios y formateo de moneda.
 */

// CORRECCIÓN AQUÍ: Agregamos 'type' para satisfacer la configuración estricta
import type { Product, AppSettings } from '../types';

export const formatCurrency = (amount: number, currency: 'USD' | 'BS') => {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `Bs. ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const calculatePrices = (product: Product, settings: AppSettings) => {
  // 1. Determinar Costo Base en USD
  let costUSD = product.cost + (product.freight || 0);

  // 2. Calcular Precio Final
  // Precio = Costo * (1 + Margen%) * (1 + IVA%)
  const margin = product.customMargin ?? settings.defaultMargin;
  const vat = product.customVAT ?? settings.defaultVAT;

  const priceWithMargin = costUSD * (1 + margin / 100);
  const finalPriceUSD = priceWithMargin * (1 + vat / 100);

  // 3. Calcular Precio en Bolívares
  const priceVED_BCV = finalPriceUSD * settings.tasaBCV;
  const priceVED_Monitor = finalPriceUSD * settings.tasaTH;

  return {
    baseCost: costUSD,
    finalPriceUSD,
    priceVED_BCV,
    priceVED_Monitor,
    margin,
    vat
  };
};