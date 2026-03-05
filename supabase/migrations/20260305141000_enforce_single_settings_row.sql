-- Enforce a single row in settings to match app contract.
-- Also removes duplicates if they already exist.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM public.settings
)
DELETE FROM public.settings s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_singleton
ON public.settings ((true));

COMMIT;
