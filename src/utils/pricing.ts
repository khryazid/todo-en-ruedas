/**
 * @file pricing.ts
 * @description Utilidades para cálculo de precios y formateo de moneda.
 * ✅ PRICE LISTS: calculatePrices acepta priceList opcional para aplicar
 *    el margen de la lista asignada al cliente (Mayorista / Especial).
 * ✅ COP: Soporte para pesos colombianos.
 */

import Decimal from 'decimal.js';
import type { Product, AppSettings, PriceList } from '../types';

/**
 * Redondea un número a una cantidad fija de decimales usando precisión arbitraria Decimal.
 * Elimina imprecisiones acumulativas de punto flotante IEEE 754 (Finding 6).
 */
export const roundTo = (num: number, decimals: number = 2): number => {
  if (!Number.isFinite(num)) return 0;
  try {
    return new Decimal(num).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber();
  } catch {
    return 0;
  }
};

export const formatCurrency = (amount: number, currency: 'USD' | 'BS' | 'COP') => {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === 'COP') {
    return `$${amount.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} COP`;
  }
  return `Bs. ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Calcula los precios finales de un producto aplicando márgenes, IVA y tasa de cambio
 * utilizando aritmética decimal exacta con decimal.js.
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
  const rawCost = new Decimal(product.cost || 0).plus(product.freight || 0);
  const costUSD = rawCost.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

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

  // 1. Precio antes de IVA = Costo * (1 + margin / 100)
  const priceBeforeVat = costUSD.times(new Decimal(1).plus(new Decimal(margin).dividedBy(100)))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  // 2. Aplicar descuento de lista de precio
  const discountedPrice = priceBeforeVat.times(new Decimal(1).minus(new Decimal(discountPct).dividedBy(100)))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  // 3. Precio base final = Precio con descuento + IVA
  const basePriceDecimal = discountedPrice.times(new Decimal(1).plus(new Decimal(vat).dividedBy(100)))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const basePrice = basePriceDecimal.toNumber();

  // 4. LÓGICA TH (CAMUFLAJE BCV) — Decisión legal/de negocio preservada
  // Preserva el importe exacto en Bolívares sin truncar prematuramente el USD intermediario
  const tasaBCV = settings.tasaBCV || 0;
  const tasaTH = settings.tasaTH || 0;
  const tasaCOP = settings.tasaCOP || 0;

  let finalPriceUSD = basePrice;
  let finalPriceVED = 0;

  if (product.costType === 'TH' && tasaTH > 0 && tasaBCV > 0) {
    const bolivaresExact = basePriceDecimal.times(tasaTH).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    finalPriceVED = bolivaresExact.toNumber();
    // USD camuflado para cobro exacto a tasa BCV
    finalPriceUSD = bolivaresExact.dividedBy(tasaBCV).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  } else {
    finalPriceUSD = basePrice;
    finalPriceVED = tasaBCV > 0
      ? new Decimal(finalPriceUSD).times(tasaBCV).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
      : 0;
  }

  // 5. COP = USD real × tasa COP (entero)
  const finalPriceCOP = tasaCOP > 0
    ? basePriceDecimal.times(tasaCOP).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    : 0;

  return {
    baseCost: costUSD.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    basePrice,
    finalPriceUSD,
    finalPriceVED,
    finalPriceCOP,
    margin,
    vat
  };
};