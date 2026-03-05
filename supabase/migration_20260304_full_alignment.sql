-- ====================================================================
-- MIGRACIÓN ÚNICA: ALINEACIÓN COMPLETA APP <-> DB
-- Fecha: 2026-03-04
-- Incluye:
--   1) Contrato de cost_type y quotes.status
--   2) Campos extendidos de suppliers
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1) products.cost_type / invoices.cost_type => BCV | TH
-- --------------------------------------------------------------------
UPDATE public.products
SET cost_type = 'TH'
WHERE cost_type = 'MONITOR';

UPDATE public.invoices
SET cost_type = 'TH'
WHERE cost_type = 'MONITOR';

UPDATE public.products
SET cost_type = 'BCV'
WHERE cost_type = 'MANUAL' OR cost_type IS NULL;

UPDATE public.invoices
SET cost_type = 'BCV'
WHERE cost_type = 'MANUAL' OR cost_type IS NULL;

-- --------------------------------------------------------------------
-- 2) quotes.status => DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED
-- --------------------------------------------------------------------
UPDATE public.quotes
SET status = 'REJECTED'
WHERE status = 'CANCELLED';

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

-- --------------------------------------------------------------------
-- 3) Extender suppliers para contrato frontend actual
-- --------------------------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS rif TEXT,
  ADD COLUMN IF NOT EXISTS rif_type TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.suppliers
SET category = 'Otro'
WHERE category IS NULL;

COMMIT;

-- --------------------------------------------------------------------
-- Verificación opcional
-- --------------------------------------------------------------------
-- SELECT DISTINCT cost_type FROM public.products;
-- SELECT DISTINCT cost_type FROM public.invoices;
-- SELECT DISTINCT status FROM public.quotes;
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'suppliers'
-- ORDER BY ordinal_position;
