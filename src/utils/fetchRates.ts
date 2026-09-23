/**
 * @file utils/fetchRates.ts
 * @description Obtiene tasas de cambio desde APIs públicas gratuitas con redundancia.
 *
 * BCV (Bs/USD):
 * 1. https://ve.dolarapi.com/v1/dolares/oficial
 * 2. https://rates.dolarvzla.com/bcv/current.json
 *
 * COP (COP/USD):
 * 1. https://co.dolarapi.com/v1/trm
 * 2. https://open.er-api.com/v6/latest/USD
 * 3. https://api.exchangerate-api.com/v4/latest/USD
 */

import { roundTo } from './pricing';

const TIMEOUT_MS = 6000;

interface BCVResponse {
  current?: { date: string; usd: number; eur: number };
}

interface DolarApiVeResponse {
  promedio?: number;
  precio?: number;
}

interface COPResponse {
  valor?: number;
}

interface OpenExchangeResponse {
  rates?: Record<string, number>;
}

/**
 * Fetch con timeout para evitar bloqueos.
 */
const fetchWithTimeout = async (url: string, ms = TIMEOUT_MS): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Obtiene la tasa BCV oficial (Bs por 1 USD) con redundancia entre proveedores.
 */
export const fetchBCVRate = async (): Promise<number | null> => {
  // Proveedor 1: DolarApi Venezuela
  try {
    const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/oficial');
    if (res.ok) {
      const data: DolarApiVeResponse = await res.json();
      const rate = data?.promedio ?? data?.precio;
      if (typeof rate === 'number' && rate > 0) {
        return roundTo(rate, 4);
      }
    }
  } catch (err) {
    console.warn('ve.dolarapi.com no disponible, probando fallback:', err);
  }

  // Proveedor 2: DolarVzla Rates
  try {
    const res = await fetchWithTimeout('https://rates.dolarvzla.com/bcv/current.json');
    if (res.ok) {
      const data: BCVResponse = await res.json();
      const rate = data?.current?.usd;
      if (typeof rate === 'number' && rate > 0) {
        return roundTo(rate, 4);
      }
    }
  } catch (err) {
    console.warn('rates.dolarvzla.com falló:', err);
  }

  return null;
};

/**
 * Obtiene la tasa oficial de Colombia COP por 1 USD con redundancia.
 */
export const fetchCOPRate = async (): Promise<number | null> => {
  // Proveedor 1: DolarApi Colombia TRM
  try {
    const res = await fetchWithTimeout('https://co.dolarapi.com/v1/trm');
    if (res.ok) {
      const data: COPResponse = await res.json();
      const rate = data?.valor;
      if (typeof rate === 'number' && rate > 0) {
        return roundTo(rate, 2);
      }
    }
  } catch (err) {
    console.warn('co.dolarapi.com no disponible, probando fallback:', err);
  }

  // Proveedor 2: Open Exchange Rates
  try {
    const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data: OpenExchangeResponse = await res.json();
      const rate = data?.rates?.COP;
      if (typeof rate === 'number' && rate > 0) {
        return roundTo(rate, 2);
      }
    }
  } catch (err) {
    console.warn('open.er-api.com falló:', err);
  }

  // Proveedor 3: ExchangeRate API
  try {
    const res = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD');
    if (res.ok) {
      const data: OpenExchangeResponse = await res.json();
      const rate = data?.rates?.COP;
      if (typeof rate === 'number' && rate > 0) {
        return roundTo(rate, 2);
      }
    }
  } catch (err) {
    console.warn('api.exchangerate-api.com falló:', err);
  }

  return null;
};

export interface FetchedRates {
  bcv: number | null;
  cop: number | null;
}

/**
 * Obtiene ambas tasas en paralelo.
 */
export const fetchAllRates = async (): Promise<FetchedRates> => {
  const [bcv, cop] = await Promise.all([fetchBCVRate(), fetchCOPRate()]);
  return { bcv, cop };
};
