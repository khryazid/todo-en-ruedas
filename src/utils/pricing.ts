import type { Product, GlobalSettings } from '../types';

export const calculatePrices = (product: Product, settings: GlobalSettings) => {
  // 1. CONVERSIÓN SEGURA DE DATOS (Blindaje contra NaN)
  const cost = Number(product.cost) || 0;
  const freight = Number(product.freight) || 0;
  const margin = Number(product.customMargin ?? settings.defaultMargin) || 0;
  const vatRate = Number(product.customVAT ?? settings.defaultVAT) || 0;

  // Evitamos división por cero asegurando que las tasas sean al menos 1 si no están cargadas
  const tasaBCV = Number(settings.tasaBCV) || 1;
  const tasaTH = Number(settings.tasaTH) || 1;

  // 2. Determinar tasa de compra
  const rateUsedForPurchase = product.costType === 'TH' ? tasaTH : tasaBCV;

  // 3. Costo Total Unitario (Factura + Flete) en Bolívares
  const totalCostRaw = cost + freight;
  const totalCostInBs = totalCostRaw * rateUsedForPurchase;

  // 4. Estandarizar a Dólar BCV (Costo Real)
  const standardizedCostUSD = totalCostInBs / tasaBCV;

  // 5. Calcular BASE IMPONIBLE (Precio antes de IVA)
  const basePriceUSD = standardizedCostUSD * (1 + margin / 100);

  // 6. Calcular IVA
  const taxAmountUSD = basePriceUSD * (vatRate / 100);

  // 7. Precio Final (PVP)
  const finalPriceUSD = basePriceUSD + taxAmountUSD;

  return {
    baseCostUSD: standardizedCostUSD, // Costo real con envío

    // Desglose para Facturación
    basePriceUSD: basePriceUSD,       // Base Imponible
    taxAmountUSD: taxAmountUSD,       // Monto IVA
    finalPriceUSD: finalPriceUSD,     // Total a Pagar

    // Referenciales en Bs (Precio Final)
    priceVED_BCV: finalPriceUSD * tasaBCV,
    priceVED_TH: finalPriceUSD * tasaTH
  };
};

export const formatCurrency = (amount: number, currency: 'USD' | 'VED') => {
  // Protección extra: Si amount llega como NaN, mostramos 0
  const safeAmount = isNaN(amount) ? 0 : amount;

  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency === 'VED' ? 'VES' : 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(safeAmount);
};