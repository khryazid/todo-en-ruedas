-- ====================================================================
-- MIGRACIÓN APPSEC: Endurecimiento Integral de RLS y RBAC
-- Referencia: SEC-APP-001, SEC-APP-004, SEC-APP-006 (Auditoría CTO)
-- Fecha: 2026-09-22
-- ====================================================================

-- 1. Actualizar la función auxiliar de rol para validar el estado activo del usuario
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
  SELECT role INTO v_role 
  FROM public.users 
  WHERE id = auth.uid() AND is_active = true;
  
  -- Seguridad: si el usuario no existe o está desactivado (is_active = false),
  -- no debe recibir permisos de 'VIEWER'. Retorna 'DEACTIVATED'.
  RETURN COALESCE(v_role, 'DEACTIVATED');
END;
$$;

-- 2. TABLA SETTINGS (SEC-APP-004: Revocar acceso anónimo)
DROP POLICY IF EXISTS "Allow anon read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated users full access on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated to read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admins to manage settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admin to manage settings" ON public.settings;

CREATE POLICY "Allow authenticated to read settings" ON public.settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin to manage settings" ON public.settings
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- 3. TABLA SUPPLIERS (SEC-APP-001: Bloquear manipulación a cajeros)
DROP POLICY IF EXISTS "Allow authenticated users full access on suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow staff to read suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow admin and manager to manage suppliers" ON public.suppliers;

CREATE POLICY "Allow staff to read suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER'));

CREATE POLICY "Allow admin and manager to manage suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- 4. TABLA PRODUCTS (SEC-APP-001: Proteger catálogo y costos contra manipulación de cajeros)
DROP POLICY IF EXISTS "Allow authenticated users full access on products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated to read products" ON public.products;
DROP POLICY IF EXISTS "Allow admin and manager to modify products" ON public.products;

CREATE POLICY "Allow authenticated to read products" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin and manager to modify products" ON public.products
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- 5. TABLA SALES Y SALE_ITEMS (SEC-APP-001: Aislamiento de ventas por vendedor)
DROP POLICY IF EXISTS "Allow authenticated users full access on sales" ON public.sales;
DROP POLICY IF EXISTS "Allow read sales by role" ON public.sales;
DROP POLICY IF EXISTS "Allow insert sales" ON public.sales;
DROP POLICY IF EXISTS "Allow admin and manager to update sales" ON public.sales;

CREATE POLICY "Allow read sales by role" ON public.sales
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER') 
    OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
  );

CREATE POLICY "Allow insert sales" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER')
    AND user_id = auth.uid()
  );

CREATE POLICY "Allow admin and manager to update sales" ON public.sales
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

DROP POLICY IF EXISTS "Allow authenticated users full access on sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Allow read sale items by role" ON public.sale_items;
DROP POLICY IF EXISTS "Allow insert sale items" ON public.sale_items;

CREATE POLICY "Allow read sale items by role" ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER')
    OR EXISTS (
      SELECT 1 FROM public.sales s 
      WHERE s.id = sale_items.sale_id 
        AND public.current_user_role() = 'SELLER'
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow insert sale items" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'MANAGER')
    OR EXISTS (
      SELECT 1 FROM public.sales s 
      WHERE s.id = sale_items.sale_id 
        AND public.current_user_role() = 'SELLER'
        AND s.user_id = auth.uid()
    )
  );

-- 6. TABLA CLIENTS (Proteger saldos y límites de crédito; cajeros solo leen e insertan)
DROP POLICY IF EXISTS "Allow authenticated users full access on clients" ON public.clients;
DROP POLICY IF EXISTS "Allow authenticated to read clients" ON public.clients;
DROP POLICY IF EXISTS "Allow staff to insert clients" ON public.clients;
DROP POLICY IF EXISTS "Allow admin and manager to manage clients" ON public.clients;

CREATE POLICY "Allow authenticated to read clients" ON public.clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow staff to insert clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER'));

CREATE POLICY "Allow admin and manager to manage clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow admin and manager to delete clients" ON public.clients
  FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- 7. TABLAS INVOICES Y EXPENSES (Restringir acceso financiero a roles elevados)
DROP POLICY IF EXISTS "Allow authenticated users full access on invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow invoice access to authorized roles" ON public.invoices;

CREATE POLICY "Allow invoice access to authorized roles" ON public.invoices
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

DROP POLICY IF EXISTS "Allow authenticated users full access on expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow expenses access to authorized roles" ON public.expenses;

CREATE POLICY "Allow expenses access to authorized roles" ON public.expenses
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

DROP POLICY IF EXISTS "Allow authenticated users full access on recurring_expenses" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Allow recurring expenses to authorized roles" ON public.recurring_expenses;

CREATE POLICY "Allow recurring expenses to authorized roles" ON public.recurring_expenses
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- 8. TABLA CASH_LEDGER (Proteger libro de caja contra manipulación arbitraria)
DROP POLICY IF EXISTS "Allow authenticated users full access on cash_ledger" ON public.cash_ledger;
DROP POLICY IF EXISTS "Allow read cash ledger by role" ON public.cash_ledger;
DROP POLICY IF EXISTS "Allow insert cash ledger by role" ON public.cash_ledger;
DROP POLICY IF EXISTS "Allow admin and manager to update cash ledger" ON public.cash_ledger;

CREATE POLICY "Allow read cash ledger by role" ON public.cash_ledger
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER'));

CREATE POLICY "Allow insert cash ledger by role" ON public.cash_ledger
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'MANAGER')
    OR (
      public.current_user_role() = 'SELLER'
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Allow admin and manager to update cash ledger" ON public.cash_ledger
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- 9. TABLA AUDIT_LOGS (SEC-APP-006: Prevenir falsificación de identidad en logs)
DROP POLICY IF EXISTS "Allow authenticated users full access on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow authenticated to insert audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow verified insertion of audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow admin and manager to read audit_logs" ON public.audit_logs;

CREATE POLICY "Allow admin and manager to read audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow verified insertion of audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 10. TABLA USERS (VULN-07: Sincronizar permisos de Manager para gestionar SELLER y VIEWER)
DROP POLICY IF EXISTS "Allow admins to manage users" ON public.users;
DROP POLICY IF EXISTS "Allow admin and manager to update users" ON public.users;
DROP POLICY IF EXISTS "Allow admin to insert or delete users" ON public.users;

CREATE POLICY "Allow admin and manager to update users" ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    OR (
      public.current_user_role() = 'MANAGER' 
      AND role IN ('SELLER', 'VIEWER')
    )
  )
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    OR (
      public.current_user_role() = 'MANAGER' 
      AND role IN ('SELLER', 'VIEWER')
    )
  );

CREATE POLICY "Allow admin to insert or delete users" ON public.users
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');
