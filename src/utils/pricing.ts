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

  // El margen siempre es el custom o el default
  const margin: number = product.customMargin !== undefined && product.customMargin !== null
    ? product.customMargin
    : settings.defaultMargin;

  // Definir el % de descuento basado en la lista de precio (sólo si no tiene customMargin)
  let discountPct = 0;
  if ((product.customMargin === undefined || product.customMargin === null)) {
    if (priceList === 'Mayorista') {
      discountPct = settings.marginMayorista && settings.marginMayorista > 0
        ? settings.marginMayorista
        : 10; // 10% de descuento por defecto si no se ha configurado
    } else if (priceList === 'Especial') {
      discountPct = settings.marginEspecial && settings.marginEspecial > 0
        ? settings.marginEspecial
        : 15; // 15% de descuento por defecto
    }
  }

  const vat = product.customVAT ?? settings.defaultVAT;

  // 1. Precio antes de IVA = Costo + Margen
  const priceBeforeVat = costUSD * (1 + margin / 100);

  // 2. Aplicar descuento de lista de precio
  const discountedPrice = priceBeforeVat * (1 - discountPct / 100);

  // 3. Precio base final = Precio con descuento + IVA
  const basePrice = Math.round((discountedPrice * (1 + vat / 100)) * 100) / 100;

  // 4. LÓGICA TH (CAMUFLAJE BCV)
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