-- Prevent duplicate purchase invoices caused by double-submit.
-- Strategy:
--   1) Deduplicate existing rows keeping the oldest by created_at.
--   2) Enforce uniqueness per supplier+number (case/space-insensitive).

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY coalesce(supplier::text, '__NO_SUPPLIER__'), lower(btrim(number))
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.invoices
)
DELETE FROM public.invoices i
USING ranked r
WHERE i.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_supplier_number_normalized
ON public.invoices (
  coalesce(supplier::text, '__NO_SUPPLIER__'),
  lower(btrim(number))
);

COMMIT;
