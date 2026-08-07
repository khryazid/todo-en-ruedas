-- ============================================================
-- Migración: Agregar columna tasa_cop a settings
-- Ejecutar en Supabase SQL Editor ANTES de desplegar frontend
-- ============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS tasa_cop NUMERIC DEFAULT 0;
