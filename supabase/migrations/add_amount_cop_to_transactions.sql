-- ============================================================
-- Migración: Agregar columna amount_cop a tablas transaccionales
-- Ejecutar en Supabase SQL Editor ANTES de desplegar frontend
-- ============================================================

ALTER TABLE cash_ledger ADD COLUMN IF NOT EXISTS amount_cop NUMERIC DEFAULT 0;
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS amount_cop NUMERIC DEFAULT 0;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS amount_cop NUMERIC DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount_cop NUMERIC DEFAULT 0;
