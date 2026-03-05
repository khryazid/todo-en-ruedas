-- ====================================================================
-- MIGRACIÓN: TASA USADA POR GASTO (FX TRACKING)
-- Fecha: 2026-03-04
-- ====================================================================

BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS fx_rate_used NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS fx_source TEXT CHECK (fx_source IN ('BCV','TH','MANUAL'));

COMMIT;
