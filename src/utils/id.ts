export const generateId = (): string => {
  const hasCrypto = typeof globalThis !== 'undefined' && typeof globalThis.crypto !== 'undefined';
  if (hasCrypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  const timePart = Date.now().toString(36);
  return `${timePart}-${randomPart}`;
};
