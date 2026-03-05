-- ====================================================================
-- MIGRACIÓN: COMISIÓN POR MÉTODO DE PAGO
-- Fecha: 2026-03-04
-- ====================================================================

BEGIN;

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) DEFAULT 0;

UPDATE public.payment_methods
SET commission_pct = 0
WHERE commission_pct IS NULL;

COMMIT;
