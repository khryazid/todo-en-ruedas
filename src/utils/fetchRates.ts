/**
 * @file utils/fetchRates.ts
 * @description Obtiene tasas de cambio desde APIs públicas gratuitas.
 *
 * - BCV (Bs/USD): https://rates.dolarvzla.com/bcv/current.json
 * - COP (COP/USD): https://co.dolarapi.com/v1/trm
 *
 * Ambas APIs son gratuitas, sin API key y con CORS abierto.
 * La tasa Monitor (dólar paralelo) NO se obtiene automáticamente;
 * el usuario la ingresa manualmente.
 */

const TIMEOUT_MS = 8000;

interface BCVResponse {
  current: { date: string; usd: number; eur: number };
}

interface COPResponse {
  unidad: string;
  nombre: string;
  valor: number;
  fechaActualizacion: string;
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
 * Obtiene la tasa BCV oficial (Bs por 1 USD).
 * @returns La tasa o null si falla.
 */
export const fetchBCVRate = async (): Promise<number | null> => {
  try {
    const res = await fetchWithTimeout('https://rates.dolarvzla.com/bcv/current.json');
    if (!res.ok) return null;
    const data: BCVResponse = await res.json();
    const rate = data?.current?.usd;
    return typeof rate === 'number' && rate > 0 ? Math.round(rate * 10000) / 10000 : null;
  } catch (err) {
    console.warn('fetchBCVRate falló:', err);
    return null;
  }
};

/**
 * Obtiene la Tasa Representativa del Mercado (TRM) de Colombia (COP por 1 USD).
 * @returns La tasa o null si falla.
 */
export const fetchCOPRate = async (): Promise<number | null> => {
  try {
    const res = await fetchWithTimeout('https://co.dolarapi.com/v1/trm');
    if (!res.ok) return null;
    const data: COPResponse = await res.json();
    const rate = data?.valor;
    return typeof rate === 'number' && rate > 0 ? Math.round(rate * 100) / 100 : null;
  } catch (err) {
    console.warn('fetchCOPRate falló:', err);
    return null;
  }
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
