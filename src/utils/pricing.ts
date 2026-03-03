/**
 * @file pricing.ts
 * @description Utilidades para cálculo de precios y formateo de moneda.
 * ✅ PRICE LISTS: calculatePrices acepta priceList opcional para aplicar
 *    el margen de la lista asignada al cliente (Mayorista / Especial).
 */

import type { Product, AppSettings, PriceList } from '../types';

export const formatCurrency = (amount: number, currency: 'USD' | 'BS') => {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `Bs. ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Calcula los precios finales de un producto aplicando márgenes, IVA y tasa de cambio.
 *
 * @param product   - El producto a calcular
 * @param settings  - Configuración global (tasas, márgenes por defecto)
 * @param priceList - Lista de precio del cliente seleccionado (opcional).
 *                    Sólo se aplica si el producto NO tiene customMargin propio.
 */
export const calculatePrices = (
  product: Product,
  settings: AppSettings,
  priceList?: PriceList
) => {
  const costUSD = product.cost + (product.freight || 0);

  // customMargin del producto siempre tiene prioridad absoluta
  let margin: number;
  if (product.customMargin !== undefined && product.customMargin !== null) {
    margin = product.customMargin;
  } else if (priceList === 'Mayorista') {
    // Margen mayorista: valor configurado o 60% del margen base
    margin = settings.marginMayorista && settings.marginMayorista > 0
      ? settings.marginMayorista
      : settings.defaultMargin * 0.6;
  } else if (priceList === 'Especial') {
    // Margen especial: valor configurado o 40% del margen base
    margin = settings.marginEspecial && settings.marginEspecial > 0
      ? settings.marginEspecial
      : settings.defaultMargin * 0.4;
  } else {
    // 'Detal' o sin lista → margen global
    margin = settings.defaultMargin;
  }

  const vat = product.customVAT ?? settings.defaultVAT;

  // 1. Precio base = Costo + Margen + IVA
  const basePrice = Math.round((costUSD * (1 + margin / 100) * (1 + vat / 100)) * 100) / 100;

  // 2. LÓGICA TH (CAMUFLAJE BCV)
  let finalPriceUSD = basePrice;
  if (product.costType === 'TH') {
    const tasaTH = settings.tasaTH || 0;
    const tasaBCV = settings.tasaBCV || 0;

    if (tasaTH > 0 && tasaBCV > 0) {
      finalPriceUSD = (basePrice * tasaTH) / tasaBCV;
    }
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
    basePrice,
    finalPriceUSD,
    finalPriceVED,
    margin,
    vat
  };
};