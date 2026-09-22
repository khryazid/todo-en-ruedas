-- ====================================================================
-- MIGRACIÓN: Función RPC para correlativo atómico de Notas de Crédito
-- Fecha: 2026-09-21
-- Objetivo: Generar correlativos NC-XXXX sin colisiones bajo concurrencia
-- ====================================================================

CREATE SEQUENCE IF NOT EXISTS public.nc_number_seq START 1;

CREATE OR REPLACE FUNCTION public.get_next_nc_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_val BIGINT;
BEGIN
  v_next_val := nextval('public.nc_number_seq');
  RETURN 'NC-' || lpad(v_next_val::TEXT, 4, '0');
END;
$$;
