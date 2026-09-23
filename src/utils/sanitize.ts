/**
 * @file utils/sanitize.ts
 * @description Utilidades de escape y sanitización HTML para prevención de XSS (Finding 3).
 */

/**
 * Escapa caracteres peligrosos en cadenas de texto para prevenir inyección HTML / Stored XSS.
 * Seguro con null, undefined y valores numéricos.
 */
export const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
