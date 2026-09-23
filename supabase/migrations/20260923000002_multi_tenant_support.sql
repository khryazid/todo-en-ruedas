-- ====================================================================
-- MIGRACIÓN: ARQUITECTURA MULTI-NEGOCIO (MULTI-TENANCY)
-- Archivo: supabase/migrations/20260923000002_multi_tenant_support.sql
-- Fecha: 2026-09-23
--
-- OBJETIVO:
-- 1. Crear tablas organizations y organization_members.
-- 2. Añadir organization_id con FK CASCADE a todas las tablas del sistema.
-- 3. Actualizar índices únicos para aislamiento por organización (sku, rif, etc.).
-- 4. Funciones de seguridad STABLE/SECURITY DEFINER (user_has_org_access).
-- 5. RPC create_organization para onboarding atómico de nuevos negocios.
-- 6. Actualizar process_sale_atomic y process_return_atomic con p_org_id.
-- 7. Políticas RLS multi-tenant basadas en pertenencia a la organización.
-- ====================================================================

BEGIN;

-- ====================================================================
-- 1. TABLAS PRINCIPALES MULTI-TENANT
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    rif         TEXT,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    logo_url    TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'SELLER'
                      CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'SELLER')),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);

-- ====================================================================
-- 2. FUNCIONES DE SEGURIDAD MULTI-TENANT (SECURITY DEFINER)
-- ====================================================================

CREATE OR REPLACE FUNCTION public.user_has_org_access(target_org_id UUID, allowed_roles TEXT[] DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = target_org_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND (allowed_roles IS NULL OR om.role = ANY(allowed_roles))
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_role(target_org_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.organization_members
  WHERE organization_id = target_org_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- ====================================================================
-- 3. ORGANIZACIÓN POR DEFECTO PARA MIGRACIÓN DE DATOS EXISTENTES
-- ====================================================================

INSERT INTO public.organizations (id, name, slug, rif)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Mi Empresa', 'mi-empresa', 'J-00000000')
ON CONFLICT (slug) DO NOTHING;

-- Si existen usuarios previos, asignarlos como ADMIN/OWNER a la organización por defecto
INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
SELECT 
    '00000000-0000-0000-0000-000000000001'::uuid,
    u.id,
    CASE WHEN u.role = 'ADMIN' THEN 'OWNER' ELSE coalesce(u.role, 'SELLER') END,
    coalesce(u.is_active, true)
FROM public.users u
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- ====================================================================
-- 4. AÑADIR organization_id A TODAS LAS TABLAS DE NEGOCIO
-- ====================================================================

-- 4.1 settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.settings SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.settings ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.settings ALTER COLUMN organization_id SET NOT NULL;
DROP INDEX IF EXISTS public.uq_settings_singleton;
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS uq_settings_organization;
ALTER TABLE public.settings ADD CONSTRAINT uq_settings_organization UNIQUE (organization_id);

-- 4.2 products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.products SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.products ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.products ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS uq_products_org_sku;
ALTER TABLE public.products ADD CONSTRAINT uq_products_org_sku UNIQUE (organization_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_org ON public.products(organization_id);

-- 4.3 clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.clients SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.clients ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.clients ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_rif_key;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS uq_clients_org_rif;
ALTER TABLE public.clients ADD CONSTRAINT uq_clients_org_rif UNIQUE (organization_id, rif);
CREATE INDEX IF NOT EXISTS idx_clients_org ON public.clients(organization_id);

-- 4.4 sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.sales SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.sales ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.sales ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_invoice_number_key;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS uq_sales_org_invoice;
ALTER TABLE public.sales ADD CONSTRAINT uq_sales_org_invoice UNIQUE (organization_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_org ON public.sales(organization_id);

-- 4.5 sale_items
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.sale_items SET organization_id = (SELECT s.organization_id FROM public.sales s WHERE s.id = sale_items.sale_id) WHERE organization_id IS NULL;
UPDATE public.sale_items SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.sale_items ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.sale_items ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sale_items_org ON public.sale_items(organization_id);

-- 4.6 payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.payments SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.payments ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.payments ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_org ON public.payments(organization_id);

-- 4.7 quotes
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.quotes SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.quotes ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.quotes ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_org ON public.quotes(organization_id);

-- 4.8 returns
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.returns SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.returns ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.returns ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_returns_org ON public.returns(organization_id);

-- 4.9 stock_movements
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.stock_movements SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.stock_movements ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.stock_movements ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_org ON public.stock_movements(organization_id);

-- 4.10 expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.expenses SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.expenses ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.expenses ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_org ON public.expenses(organization_id);

-- 4.11 recurring_expenses
ALTER TABLE public.recurring_expenses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.recurring_expenses SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.recurring_expenses ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.recurring_expenses ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_org ON public.recurring_expenses(organization_id);

-- 4.12 cash_closes
ALTER TABLE public.cash_closes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.cash_closes SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.cash_closes ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.cash_closes ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_closes_org ON public.cash_closes(organization_id);

-- 4.13 cash_ledger
ALTER TABLE public.cash_ledger ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.cash_ledger SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.cash_ledger ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.cash_ledger ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_ledger_org ON public.cash_ledger(organization_id);

-- 4.14 suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.suppliers SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.suppliers ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.suppliers ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON public.suppliers(organization_id);

-- 4.15 invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.invoices SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.invoices ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.invoices ALTER COLUMN organization_id SET NOT NULL;
DROP INDEX IF EXISTS public.uq_invoices_supplier_number_normalized;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_org_supplier_number
    ON public.invoices (organization_id, coalesce(supplier::text, '__NO_SUPPLIER__'), lower(btrim(number)));
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id);

-- 4.16 payment_methods
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.payment_methods SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.payment_methods ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.payment_methods ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON public.payment_methods(organization_id);

-- 4.17 audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.audit_logs SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(organization_id);

-- ====================================================================
-- 5. RPC create_organization PARA CREAR NEGOCIOS ATÓMICAMENTE
-- ====================================================================

CREATE OR REPLACE FUNCTION public.create_organization(
    p_name TEXT,
    p_slug TEXT,
    p_rif TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'USD'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_clean_slug TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    v_clean_slug := lower(regexp_replace(trim(p_slug), '[^a-z0-9_-]', '', 'g'));
    IF v_clean_slug = '' THEN
        RAISE EXCEPTION 'Slug inválido';
    END IF;

    -- 1. Crear organización
    INSERT INTO public.organizations (name, slug, rif)
    VALUES (trim(p_name), v_clean_slug, trim(p_rif))
    RETURNING id INTO v_org_id;

    -- 2. Asignar al creador como OWNER
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org_id, auth.uid(), 'OWNER', true);

    -- 3. Crear configuración inicial
    INSERT INTO public.settings (
        organization_id,
        company_name,
        rif,
        printer_currency,
        tasa_bcv,
        tasa_monitor,
        tasa_cop,
        default_margin,
        default_vat
    )
    VALUES (
        v_org_id,
        trim(p_name),
        coalesce(trim(p_rif), 'J-00000000'),
        coalesce(p_currency, 'USD'),
        0, 0, 0, 30, 16
    );

    -- 4. Métodos de pago por defecto para este negocio
    INSERT INTO public.payment_methods (organization_id, name, type, currency, is_active)
    VALUES
        (v_org_id, 'Efectivo USD', 'CASH_USD', 'USD', true),
        (v_org_id, 'Efectivo Bs', 'CASH_BS', 'BS', true),
        (v_org_id, 'Transferencia Bs', 'TRANSFER_BS', 'BS', true),
        (v_org_id, 'Pago Móvil', 'PAGO_MOVIL', 'BS', true),
        (v_org_id, 'Punto de Venta', 'POS', 'BS', true),
        (v_org_id, 'Zelle', 'ZELLE', 'USD', true);

    RETURN v_org_id;
END;
$$;

-- ====================================================================
-- 6. POLÍTICAS RLS MULTI-TENANT (AISLAMIENTO TOTAL ENTRE NEGOCIOS)
-- ====================================================================

-- Activar RLS en nuevas tablas
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 6.1 organizations
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(id));

DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
CREATE POLICY "organizations_insert" ON public.organizations
    FOR INSERT TO authenticated
    WITH CHECK (true); -- Cualquier usuario autenticado puede fundar un negocio

DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
CREATE POLICY "organizations_update" ON public.organizations
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(id, ARRAY['OWNER', 'ADMIN']))
    WITH CHECK (public.user_has_org_access(id, ARRAY['OWNER', 'ADMIN']));

DROP POLICY IF EXISTS "organizations_delete" ON public.organizations;
CREATE POLICY "organizations_delete" ON public.organizations
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(id, ARRAY['OWNER']));

-- 6.2 organization_members
DROP POLICY IF EXISTS "org_members_select" ON public.organization_members;
CREATE POLICY "org_members_select" ON public.organization_members
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "org_members_insert" ON public.organization_members;
CREATE POLICY "org_members_insert" ON public.organization_members
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

DROP POLICY IF EXISTS "org_members_update" ON public.organization_members;
CREATE POLICY "org_members_update" ON public.organization_members
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

DROP POLICY IF EXISTS "org_members_delete" ON public.organization_members;
CREATE POLICY "org_members_delete" ON public.organization_members
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.3 settings
DROP POLICY IF EXISTS "settings_select" ON public.settings;
DROP POLICY IF EXISTS "settings_org_select" ON public.settings;
CREATE POLICY "settings_org_select" ON public.settings
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "settings_update" ON public.settings;
DROP POLICY IF EXISTS "settings_org_update" ON public.settings;
CREATE POLICY "settings_org_update" ON public.settings
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

DROP POLICY IF EXISTS "settings_insert" ON public.settings;
DROP POLICY IF EXISTS "settings_org_insert" ON public.settings;
CREATE POLICY "settings_org_insert" ON public.settings
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.4 products
DROP POLICY IF EXISTS "Allow read products by role" ON public.products;
DROP POLICY IF EXISTS "products_org_select" ON public.products;
CREATE POLICY "products_org_select" ON public.products
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert products by role" ON public.products;
DROP POLICY IF EXISTS "products_org_insert" ON public.products;
CREATE POLICY "products_org_insert" ON public.products
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

DROP POLICY IF EXISTS "Allow update products by role" ON public.products;
DROP POLICY IF EXISTS "products_org_update" ON public.products;
CREATE POLICY "products_org_update" ON public.products
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

DROP POLICY IF EXISTS "Allow delete products by role" ON public.products;
DROP POLICY IF EXISTS "products_org_delete" ON public.products;
CREATE POLICY "products_org_delete" ON public.products
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.5 clients
DROP POLICY IF EXISTS "Allow read clients by role" ON public.clients;
DROP POLICY IF EXISTS "clients_org_select" ON public.clients;
CREATE POLICY "clients_org_select" ON public.clients
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert clients by role" ON public.clients;
DROP POLICY IF EXISTS "clients_org_insert" ON public.clients;
CREATE POLICY "clients_org_insert" ON public.clients
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));

DROP POLICY IF EXISTS "Allow update clients by role" ON public.clients;
DROP POLICY IF EXISTS "clients_org_update" ON public.clients;
CREATE POLICY "clients_org_update" ON public.clients
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));

DROP POLICY IF EXISTS "Allow delete clients by role" ON public.clients;
DROP POLICY IF EXISTS "clients_org_delete" ON public.clients;
CREATE POLICY "clients_org_delete" ON public.clients
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.6 sales
DROP POLICY IF EXISTS "Allow read sales by role" ON public.sales;
DROP POLICY IF EXISTS "sales_org_select" ON public.sales;
CREATE POLICY "sales_org_select" ON public.sales
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert sales by role" ON public.sales;
DROP POLICY IF EXISTS "sales_org_insert" ON public.sales;
CREATE POLICY "sales_org_insert" ON public.sales
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));

DROP POLICY IF EXISTS "Allow update sales by role" ON public.sales;
DROP POLICY IF EXISTS "sales_org_update" ON public.sales;
CREATE POLICY "sales_org_update" ON public.sales
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

DROP POLICY IF EXISTS "Allow delete sales by role" ON public.sales;
DROP POLICY IF EXISTS "sales_org_delete" ON public.sales;
CREATE POLICY "sales_org_delete" ON public.sales
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.7 sale_items
DROP POLICY IF EXISTS "Allow read sale_items by role" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_org_select" ON public.sale_items;
CREATE POLICY "sale_items_org_select" ON public.sale_items
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert sale_items by role" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_org_insert" ON public.sale_items;
CREATE POLICY "sale_items_org_insert" ON public.sale_items
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));

-- 6.8 payments
DROP POLICY IF EXISTS "Allow read payments by role" ON public.payments;
DROP POLICY IF EXISTS "payments_org_select" ON public.payments;
CREATE POLICY "payments_org_select" ON public.payments
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert payments by role" ON public.payments;
DROP POLICY IF EXISTS "payments_org_insert" ON public.payments;
CREATE POLICY "payments_org_insert" ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));

-- 6.9 quotes
DROP POLICY IF EXISTS "Allow read quotes by role" ON public.quotes;
DROP POLICY IF EXISTS "quotes_org_select" ON public.quotes;
CREATE POLICY "quotes_org_select" ON public.quotes
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert quotes by role" ON public.quotes;
DROP POLICY IF EXISTS "quotes_org_insert" ON public.quotes;
CREATE POLICY "quotes_org_insert" ON public.quotes
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));

DROP POLICY IF EXISTS "Allow update quotes by role" ON public.quotes;
DROP POLICY IF EXISTS "quotes_org_update" ON public.quotes;
CREATE POLICY "quotes_org_update" ON public.quotes
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));

DROP POLICY IF EXISTS "Allow delete quotes by role" ON public.quotes;
DROP POLICY IF EXISTS "quotes_org_delete" ON public.quotes;
CREATE POLICY "quotes_org_delete" ON public.quotes
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.10 returns
DROP POLICY IF EXISTS "Allow read returns by role" ON public.returns;
DROP POLICY IF EXISTS "returns_org_select" ON public.returns;
CREATE POLICY "returns_org_select" ON public.returns
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert returns by role" ON public.returns;
DROP POLICY IF EXISTS "returns_org_insert" ON public.returns;
CREATE POLICY "returns_org_insert" ON public.returns
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- 6.11 stock_movements
DROP POLICY IF EXISTS "Allow read stock_movements by role" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_org_select" ON public.stock_movements;
CREATE POLICY "stock_movements_org_select" ON public.stock_movements
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert stock_movements by role" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_org_insert" ON public.stock_movements;
CREATE POLICY "stock_movements_org_insert" ON public.stock_movements
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- 6.12 expenses
DROP POLICY IF EXISTS "Allow read expenses by role" ON public.expenses;
DROP POLICY IF EXISTS "expenses_org_select" ON public.expenses;
CREATE POLICY "expenses_org_select" ON public.expenses
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert expenses by role" ON public.expenses;
DROP POLICY IF EXISTS "expenses_org_insert" ON public.expenses;
CREATE POLICY "expenses_org_insert" ON public.expenses
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

DROP POLICY IF EXISTS "Allow update expenses by role" ON public.expenses;
DROP POLICY IF EXISTS "expenses_org_update" ON public.expenses;
CREATE POLICY "expenses_org_update" ON public.expenses
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

DROP POLICY IF EXISTS "Allow delete expenses by role" ON public.expenses;
DROP POLICY IF EXISTS "expenses_org_delete" ON public.expenses;
CREATE POLICY "expenses_org_delete" ON public.expenses
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.13 cash_closes
DROP POLICY IF EXISTS "Allow read cash_closes by role" ON public.cash_closes;
DROP POLICY IF EXISTS "cash_closes_org_select" ON public.cash_closes;
CREATE POLICY "cash_closes_org_select" ON public.cash_closes
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert cash_closes by role" ON public.cash_closes;
DROP POLICY IF EXISTS "cash_closes_org_insert" ON public.cash_closes;
CREATE POLICY "cash_closes_org_insert" ON public.cash_closes
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- 6.14 cash_ledger
DROP POLICY IF EXISTS "Allow read cash_ledger by role" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_org_select" ON public.cash_ledger;
CREATE POLICY "cash_ledger_org_select" ON public.cash_ledger
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert cash_ledger by role" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_org_insert" ON public.cash_ledger;
CREATE POLICY "cash_ledger_org_insert" ON public.cash_ledger
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- 6.15 suppliers
DROP POLICY IF EXISTS "Allow read suppliers by role" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_org_select" ON public.suppliers;
CREATE POLICY "suppliers_org_select" ON public.suppliers
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert suppliers by role" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_org_insert" ON public.suppliers;
CREATE POLICY "suppliers_org_insert" ON public.suppliers
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

DROP POLICY IF EXISTS "Allow update suppliers by role" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_org_update" ON public.suppliers;
CREATE POLICY "suppliers_org_update" ON public.suppliers
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

DROP POLICY IF EXISTS "Allow delete suppliers by role" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_org_delete" ON public.suppliers;
CREATE POLICY "suppliers_org_delete" ON public.suppliers
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.16 invoices
DROP POLICY IF EXISTS "Allow read invoices by role" ON public.invoices;
DROP POLICY IF EXISTS "invoices_org_select" ON public.invoices;
CREATE POLICY "invoices_org_select" ON public.invoices
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert invoices by role" ON public.invoices;
DROP POLICY IF EXISTS "invoices_org_insert" ON public.invoices;
CREATE POLICY "invoices_org_insert" ON public.invoices
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

DROP POLICY IF EXISTS "Allow update invoices by role" ON public.invoices;
DROP POLICY IF EXISTS "invoices_org_update" ON public.invoices;
CREATE POLICY "invoices_org_update" ON public.invoices
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

DROP POLICY IF EXISTS "Allow delete invoices by role" ON public.invoices;
DROP POLICY IF EXISTS "invoices_org_delete" ON public.invoices;
CREATE POLICY "invoices_org_delete" ON public.invoices
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.17 payment_methods
DROP POLICY IF EXISTS "Allow read payment_methods by role" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_org_select" ON public.payment_methods;
CREATE POLICY "payment_methods_org_select" ON public.payment_methods
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert payment_methods by role" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_org_insert" ON public.payment_methods;
CREATE POLICY "payment_methods_org_insert" ON public.payment_methods
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

DROP POLICY IF EXISTS "Allow update payment_methods by role" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_org_update" ON public.payment_methods;
CREATE POLICY "payment_methods_org_update" ON public.payment_methods
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

DROP POLICY IF EXISTS "Allow delete payment_methods by role" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_org_delete" ON public.payment_methods;
CREATE POLICY "payment_methods_org_delete" ON public.payment_methods
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- 6.18 audit_logs
DROP POLICY IF EXISTS "Allow read audit_logs by role" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_org_select" ON public.audit_logs;
CREATE POLICY "audit_logs_org_select" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (organization_id IS NULL OR public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Allow insert audit_logs by role" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_org_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_org_insert" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IS NULL OR public.user_has_org_access(organization_id));

COMMIT;
