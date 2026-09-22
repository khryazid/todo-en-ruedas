-- ====================================================================
-- MIGRACIÓN: Expandir restricciones CHECK para soporte de Pesos Colombianos (COP)
-- Fecha: 2026-09-21
-- ====================================================================

-- 1. payment_methods: permitir 'COP'
ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_currency_check;
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_currency_check CHECK (currency IN ('USD', 'BS', 'COP'));

-- 2. cash_ledger: permitir 'COP'
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_currency_check;
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_currency_check CHECK (currency IN ('USD', 'BS', 'COP'));

-- 3. expenses: permitir 'COP'
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_currency_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_currency_check CHECK (currency IN ('USD', 'BS', 'COP'));

-- 4. recurring_expenses: permitir 'COP'
ALTER TABLE public.recurring_expenses DROP CONSTRAINT IF EXISTS recurring_expenses_currency_check;
ALTER TABLE public.recurring_expenses ADD CONSTRAINT recurring_expenses_currency_check CHECK (currency IN ('USD', 'BS', 'COP'));

-- 5. payments: asegurar columna amount_cop
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount_cop NUMERIC DEFAULT 0;
