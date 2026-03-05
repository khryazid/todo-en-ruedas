-- ====================================================================
-- MIGRACIÓN: EXTENDER CAMPOS DE PROVEEDORES
-- Fecha: 2026-03-04
-- Motivo: el frontend usa rif/rif_type/email/address/category/notes
-- y algunos esquemas antiguos de suppliers no tienen esas columnas.
-- ====================================================================

BEGIN;

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
