/**
 * @file utils/cashAudit.ts
 * @description Módulo de Conciliación y Arqueo de Caja Multimoneda (FIN-ARQ-005).
 * Permite capturar el conteo de gaveta física por denominación y calcular faltantes/sobrantes.
 */

import { roundTo } from './pricing';

export interface DenominationItem {
  denomination: number;
  label: string;
}

export const USD_DENOMINATIONS: DenominationItem[] = [
  { denomination: 100, label: '$100' },
  { denomination: 50, label: '$50' },
  { denomination: 20, label: '$20' },
  { denomination: 10, label: '$10' },
  { denomination: 5, label: '$5' },
  { denomination: 1, label: '$1' },
];

export const BS_DENOMINATIONS: DenominationItem[] = [
  { denomination: 100, label: 'Bs. 100' },
  { denomination: 50, label: 'Bs. 50' },
  { denomination: 20, label: 'Bs. 20' },
  { denomination: 10, label: 'Bs. 10' },
  { denomination: 5, label: 'Bs. 5' },
];

export const COP_DENOMINATIONS: DenominationItem[] = [
  { denomination: 100000, label: '$100.000 COP' },
  { denomination: 50000, label: '$50.000 COP' },
  { denomination: 20000, label: '$20.000 COP' },
  { denomination: 10000, label: '$10.000 COP' },
  { denomination: 5000, label: '$5.000 COP' },
  { denomination: 2000, label: '$2.000 COP' },
];

export type DenominationCountMap = Record<number, number>;

/**
 * Calcula la suma total de un mapa de denominaciones { [denominacion]: cantidad }
 */
export const sumDenominationMap = (counts: DenominationCountMap): number => {
  let total = 0;
  for (const [denomStr, qty] of Object.entries(counts)) {
    const denom = Number(denomStr);
    const count = Number(qty) || 0;
    if (denom > 0 && count > 0) {
      total += denom * count;
    }
  }
  return roundTo(total, 2);
};

export interface CurrencyReconciliation {
  systemExpected: number;
  physicalDeclared: number;
  difference: number; // physicalDeclared - systemExpected
  status: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE';
}

export interface CashDrawerAuditResult {
  usd: CurrencyReconciliation;
  bs: CurrencyReconciliation;
  cop: CurrencyReconciliation;
  shortageUSD: number;
  overageUSD: number;
  netDiscrepancyUSD: number;
  isClean: boolean;
}

/**
 * Realiza la conciliación matemática determinista entre el efectivo esperado en sistema y el arqueo físico declarado.
 */
export const calculateCashDrawerAudit = (
  expected: { usd: number; bs: number; cop: number },
  declared: { usd: number; bs: number; cop: number },
  tasaBCV: number = 0,
  tasaCOP: number = 0
): CashDrawerAuditResult => {
  const usdDiff = roundTo(declared.usd - expected.usd, 2);
  const bsDiff = roundTo(declared.bs - expected.bs, 2);
  const copDiff = roundTo(declared.cop - expected.cop, 0);

  const getStatus = (diff: number, tolerance: number = 0.01): 'CUADRADO' | 'SOBRANTE' | 'FALTANTE' => {
    if (diff > tolerance) return 'SOBRANTE';
    if (diff < -tolerance) return 'FALTANTE';
    return 'CUADRADO';
  };

  const usdRec: CurrencyReconciliation = {
    systemExpected: roundTo(expected.usd, 2),
    physicalDeclared: roundTo(declared.usd, 2),
    difference: usdDiff,
    status: getStatus(usdDiff, 0.01),
  };

  const bsRec: CurrencyReconciliation = {
    systemExpected: roundTo(expected.bs, 2),
    physicalDeclared: roundTo(declared.bs, 2),
    difference: bsDiff,
    status: getStatus(bsDiff, 0.05),
  };

  const copRec: CurrencyReconciliation = {
    systemExpected: roundTo(expected.cop, 0),
    physicalDeclared: roundTo(declared.cop, 0),
    difference: copDiff,
    status: getStatus(copDiff, 50),
  };

  // Convertir diferencias de BS y COP a USD para determinar impacto patrimonial neto
  let bsDiffInUSD = 0;
  if (tasaBCV > 0) {
    bsDiffInUSD = roundTo(bsDiff / tasaBCV, 2);
  }

  let copDiffInUSD = 0;
  if (tasaCOP > 0) {
    copDiffInUSD = roundTo(copDiff / tasaCOP, 2);
  }

  const allDiffsUSD = [usdDiff, bsDiffInUSD, copDiffInUSD];
  let shortageUSD = 0;
  let overageUSD = 0;

  for (const diff of allDiffsUSD) {
    if (diff < -0.01) {
      shortageUSD += Math.abs(diff);
    } else if (diff > 0.01) {
      overageUSD += diff;
    }
  }

  shortageUSD = roundTo(shortageUSD, 2);
  overageUSD = roundTo(overageUSD, 2);
  const netDiscrepancyUSD = roundTo(overageUSD - shortageUSD, 2);

  return {
    usd: usdRec,
    bs: bsRec,
    cop: copRec,
    shortageUSD,
    overageUSD,
    netDiscrepancyUSD,
    isClean: shortageUSD === 0 && overageUSD === 0,
  };
};
