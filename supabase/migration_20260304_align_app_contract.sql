-- ====================================================================
-- MIGRACIÓN: ALINEAR CONTRATO APP <-> DB
-- Fecha: 2026-03-04
-- Objetivo:
--   1) products.cost_type / invoices.cost_type: usar BCV | TH (app actual)
--   2) quotes.status: usar DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1) Normalizar valores existentes para cost_type
-- --------------------------------------------------------------------
-- MONITOR -> TH
UPDATE public.products
SET cost_type = 'TH'
WHERE cost_type = 'MONITOR';

UPDATE public.invoices
SET cost_type = 'TH'
WHERE cost_type = 'MONITOR';

-- MANUAL -> BCV (fallback conservador para mantener compatibilidad de cálculo)
UPDATE public.products
SET cost_type = 'BCV'
WHERE cost_type = 'MANUAL' OR cost_type IS NULL;

UPDATE public.invoices
SET cost_type = 'BCV'
WHERE cost_type = 'MANUAL' OR cost_type IS NULL;

-- --------------------------------------------------------------------
-- 2) Normalizar valores existentes para quotes.status
-- --------------------------------------------------------------------
-- CANCELLED -> REJECTED para coincidir con tipos/frontend
UPDATE public.quotes
SET status = 'REJECTED'
WHERE status = 'CANCELLED';

-- --------------------------------------------------------------------
-- 3) Reemplazar CHECK constraints dinámicamente (idempotente)
-- --------------------------------------------------------------------
DO $$
DECLARE c RECORD;
BEGIN
  -- products.cost_type
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%cost_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.products
    ADD CONSTRAINT products_cost_type_check
    CHECK (cost_type IN ('BCV','TH'));

  -- invoices.cost_type
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.invoices'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%cost_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_cost_type_check
    CHECK (cost_type IN ('BCV','TH'));

  -- quotes.status
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.quotes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.quotes DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.quotes
    ADD CONSTRAINT quotes_status_check
    CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED'));
END $$;

COMMIT;

-- --------------------------------------------------------------------
-- Verificación opcional
-- --------------------------------------------------------------------
-- SELECT DISTINCT cost_type FROM public.products;
-- SELECT DISTINCT cost_type FROM public.invoices;
-- SELECT DISTINCT status FROM public.quotes;
