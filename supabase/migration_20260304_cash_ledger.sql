-- ====================================================================
-- MIGRACIÓN: LEDGER DE CAJA SEPARADO
-- Fecha: 2026-03-04
-- Objetivo: registrar entradas/salidas de caja sin mezclar con gastos
-- ====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  kind TEXT NOT NULL CHECK (kind IN ('VENTA_COBRADA','ABONO_CLIENTE','ABONO_PROVEEDOR','GASTO_OPERATIVO','AJUSTE')),
  amount_usd NUMERIC(10,2) NOT NULL,
  amount_bs NUMERIC(10,2),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
  payment_method TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  user_id UUID,
  seller_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_date ON public.cash_ledger(date);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_direction ON public.cash_ledger(direction);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_kind ON public.cash_ledger(kind);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_reference ON public.cash_ledger(reference_type, reference_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_reference
ON public.cash_ledger(reference_type, reference_id)
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

ALTER TABLE public.cash_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cash_ledger'
      AND policyname = 'auth_full_cash_ledger'
  ) THEN
    CREATE POLICY auth_full_cash_ledger
      ON public.cash_ledger
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMIT;
