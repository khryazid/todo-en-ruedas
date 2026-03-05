-- Align returns + stock_movements schema with current frontend contract.
-- Idempotent migration for existing environments.

BEGIN;

-- ------------------------------------------------------------------
-- returns: app expects date, user_id, seller_name
-- ------------------------------------------------------------------
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS seller_name TEXT;

UPDATE public.returns
SET date = COALESCE(date, created_at, now())
WHERE date IS NULL;

ALTER TABLE public.returns
  ALTER COLUMN date SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_returns_date ON public.returns(date);

-- ------------------------------------------------------------------
-- stock_movements: normalize legacy column names to app contract
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'before_stock'
  ) THEN
    EXECUTE 'ALTER TABLE public.stock_movements RENAME COLUMN before_stock TO qty_before';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'after_stock'
  ) THEN
    EXECUTE 'ALTER TABLE public.stock_movements RENAME COLUMN after_stock TO qty_after';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'quantity'
  ) THEN
    EXECUTE 'ALTER TABLE public.stock_movements RENAME COLUMN quantity TO qty_change';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'note'
  ) THEN
    EXECUTE 'ALTER TABLE public.stock_movements RENAME COLUMN note TO reason';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.stock_movements RENAME COLUMN user_id TO created_by';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'user_name'
  ) THEN
    EXECUTE 'ALTER TABLE public.stock_movements RENAME COLUMN user_name TO seller_name';
  END IF;
END;
$$;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS qty_before NUMERIC,
  ADD COLUMN IF NOT EXISTS qty_change NUMERIC,
  ADD COLUMN IF NOT EXISTS qty_after NUMERIC,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS seller_name TEXT;

COMMIT;
