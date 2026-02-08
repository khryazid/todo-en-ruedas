/**
 * @file pricing.ts
 * @description Funciones puras para cálculos monetarios y formateo de divisas.
 * Centraliza la lógica de precios para asegurar consistencia en toda la app.
 */

import type { Product, GlobalSettings } from '../types';

/**
 * Resultado del cálculo de precios.
 */
interface PriceResult {
  baseCostUSD: number;    // Costo real (Costo + Flete) en USD
  basePriceUSD: number;   // Base Imponible (Precio sin IVA)
  taxAmountUSD: number;   // Monto del IVA
  finalPriceUSD: number;  // Precio de Venta al Público (PVP)
  priceVED_BCV: number;   // PVP en Bolívares (Tasa BCV)
  priceVED_TH: number;    // PVP en Bolívares (Tasa Monitor)
}

/**
 * Calcula todos los precios derivados de un producto basado en la configuración global.
 * * @param product - El producto con sus costos y márgenes.
 * @param settings - Configuración global (tasas, márgenes por defecto).
 */
export const calculatePrices = (product: Product, settings: GlobalSettings): PriceResult => {
  // 1. CONVERSIÓN SEGURA DE DATOS (Blindaje contra NaN o undefined)
  const cost = Number(product.cost) || 0;
  const freight = Number(product.freight) || 0;

  // Usar margen/IVA del producto si existe, sino el global
  const margin = Number(product.customMargin ?? settings.defaultMargin) || 0;
  const vatRate = Number(product.customVAT ?? settings.defaultVAT) || 0;

  // Evitamos división por cero asegurando que las tasas sean al menos 1
  const tasaBCV = Number(settings.tasaBCV) || 1;
  const tasaTH = Number(settings.tasaTH) || 1;

  // 2. Determinar tasa de compra original para estandarizar
  // Si compraste a Tasa Monitor (TH), el costo en libros debe ajustarse a BCV para contabilidad legal
  const rateUsedForPurchase = product.costType === 'TH' ? tasaTH : tasaBCV;

  // 3. Costo Total Unitario (Factura + Flete) en Bolívares teóricos
  const totalCostRaw = cost + freight;
  const totalCostInBs = totalCostRaw * rateUsedForPurchase;

  // 4. Estandarizar a Dólar BCV (Costo Real Contable)
  const standardizedCostUSD = totalCostInBs / tasaBCV;

  // 5. Calcular BASE IMPONIBLE (Precio antes de IVA)
  // Fórmula: Costo * (1 + %Margen)
  const basePriceUSD = standardizedCostUSD * (1 + margin / 100);

  // 6. Calcular IVA
  const taxAmountUSD = basePriceUSD * (vatRate / 100);

  // 7. Precio Final (PVP)
  const finalPriceUSD = basePriceUSD + taxAmountUSD;

  return {
    baseCostUSD: standardizedCostUSD,
    basePriceUSD: basePriceUSD,
    taxAmountUSD: taxAmountUSD,
    finalPriceUSD: finalPriceUSD,
    priceVED_BCV: finalPriceUSD * tasaBCV,
    priceVED_TH: finalPriceUSD * tasaTH
  };
};

/**
 * Formatea un número como moneda local o extranjera.
 * @param amount - Cantidad numérica
 * @param currency - 'USD' o 'VED'
 */
export const formatCurrency = (amount: number, currency: 'USD' | 'VED') => {
  const safeAmount = isNaN(amount) ? 0 : amount;

  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency === 'VED' ? 'VES' : 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(safeAmount);
};