export const toEditableNumberValue = (value: number | null | undefined) => {
  const numeric = value ?? 0;
  return numeric === 0 ? '' : numeric;
};

export const fromEditableNumberValue = (raw: string) => {
  if (raw.trim() === '') return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const fromEditableIntegerValue = (raw: string, fallback = 0) => {
  if (raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
