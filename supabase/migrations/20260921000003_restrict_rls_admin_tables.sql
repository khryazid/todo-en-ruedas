-- ====================================================================
-- MIGRACIÓN: Endurecimiento de Row Level Security (RLS) en tablas maestras
-- Fecha: 2026-09-21
-- ====================================================================

-- Función auxiliar para obtener el rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  RETURN COALESCE(v_role, 'VIEWER');
END;
$$;

-- 1. SETTINGS: Solo ADMIN puede modificar/insertar/eliminar; autenticados pueden leer
DROP POLICY IF EXISTS "Allow authenticated users full access on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admins to manage settings" ON public.settings;

CREATE POLICY "Allow authenticated users to read settings" ON public.settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage settings" ON public.settings
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- 2. USERS: Solo ADMIN puede insertar/modificar/eliminar; autenticados pueden leer
DROP POLICY IF EXISTS "Allow authenticated users full access on users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to read users" ON public.users;
DROP POLICY IF EXISTS "Allow admins to manage users" ON public.users;

CREATE POLICY "Allow authenticated users to read users" ON public.users
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage users" ON public.users
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- 3. CASH_CLOSES: Solo ADMIN y MANAGER pueden insertar cierres de caja; autenticados pueden leer
DROP POLICY IF EXISTS "Allow authenticated users full access on cash_closes" ON public.cash_closes;
DROP POLICY IF EXISTS "Allow authenticated users to read cash_closes" ON public.cash_closes;
DROP POLICY IF EXISTS "Allow admin and manager to insert cash_closes" ON public.cash_closes;

CREATE POLICY "Allow authenticated users to read cash_closes" ON public.cash_closes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin and manager to insert cash_closes" ON public.cash_closes
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- 4. AUDIT_LOGS: Solo ADMIN y MANAGER pueden ver logs; autenticados pueden insertar
DROP POLICY IF EXISTS "Allow authenticated users full access on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow admin and manager to read audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow authenticated to insert audit_logs" ON public.audit_logs;

CREATE POLICY "Allow admin and manager to read audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow authenticated to insert audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);
