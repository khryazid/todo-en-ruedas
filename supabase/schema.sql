-- ====================================================================
-- TODO EN RUEDAS — SCHEMA COMPLETO DE BASE DE DATOS
-- ====================================================================
-- Incluye todas las tablas, columnas, secuencias, índices y
-- políticas RLS de todos los sprints (hasta Sprint A.4).
--
-- INSTRUCCIONES:
-- 1. Abre tu proyecto de Supabase → SQL Editor → New Query
-- 2. Pega TODO este script y presiona "Run"
-- 3. Asegúrate de que el proyecto esté VACÍO antes de ejecutar.
--    Si ya tiene tablas, usa reset.sql primero.
-- ====================================================================


-- ============================================================
-- EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 0. ORGANIZACIONES / MULTI-TENANCY (organizations & members)
-- ============================================================
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
                      CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'SELLER', 'VIEWER')),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);

-- Semilla de organización por defecto (para compatibilidad mono/multi-tenant)
INSERT INTO public.organizations (id, name, slug, rif)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Mi Empresa', 'mi-empresa', 'J-00000000')
ON CONFLICT (slug) DO NOTHING;

-- Funciones de acceso y contexto multi-tenant
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

    INSERT INTO public.organizations (name, slug, rif)
    VALUES (trim(p_name), v_clean_slug, trim(p_rif))
    RETURNING id INTO v_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org_id, auth.uid(), 'OWNER', true);

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



-- ============================================================
-- 1. CONFIGURACIÓN EMPRESARIAL (settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_name          TEXT NOT NULL DEFAULT 'Mi Empresa',
    rif                   TEXT NOT NULL DEFAULT 'J-00000000',
    address               TEXT,
    tasa_bcv              NUMERIC(10,4) DEFAULT 0,
    tasa_monitor          NUMERIC(10,4) DEFAULT 0,
    tasa_cop              NUMERIC(10,4) DEFAULT 0,
    show_monitor_rate     BOOLEAN DEFAULT false,
    last_close_date       TIMESTAMPTZ,
    shift_start           TEXT DEFAULT '08:00',
    default_margin        NUMERIC(5,2) DEFAULT 30,
    default_vat           NUMERIC(5,2) DEFAULT 16,
    printer_currency      TEXT DEFAULT 'BS',
    show_seller_commission BOOLEAN DEFAULT false,
    seller_commission_pct NUMERIC(5,2) DEFAULT 5,
    margin_mayorista      NUMERIC(5,2) DEFAULT 0,
    margin_especial       NUMERIC(5,2) DEFAULT 0,
    company_logo          TEXT,
    brand_color           TEXT,
    created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_organization
    ON public.settings (organization_id);




-- ============================================================
-- 2. INVENTARIO (products)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    sku           TEXT NOT NULL,
    name          TEXT NOT NULL,
    category      TEXT DEFAULT 'General',
    stock         NUMERIC DEFAULT 0 CHECK (stock >= 0),
    min_stock     NUMERIC DEFAULT 0,
    cost          NUMERIC DEFAULT 0,
    cost_type     TEXT DEFAULT 'BCV' CHECK (cost_type IN ('BCV','TH')),
    freight       NUMERIC DEFAULT 0,
    supplier      TEXT,
    custom_margin NUMERIC,
    custom_vat    NUMERIC,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);


-- ============================================================
-- 3. CLIENTES (clients)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    rif            TEXT NOT NULL,
    phone          TEXT,
    address        TEXT,
    email          TEXT,
    notes          TEXT,
    price_list     TEXT DEFAULT 'Detal' CHECK (price_list IN ('Detal','Mayorista','Especial')),
    credit_limit   NUMERIC(10,2) DEFAULT 0,
    credit_balance NUMERIC(10,2) DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_rif ON public.clients(rif);


-- ============================================================
-- 4. VENTAS — cabecera (sales)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_id        SERIAL,
    date            TIMESTAMPTZ DEFAULT now(),
    client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    total_usd       NUMERIC(10,2) NOT NULL,
    total_ved       NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_method  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'COMPLETED'
                        CHECK (status IN ('COMPLETED','PENDING','PARTIAL','CANCELLED')),
    paid_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_credit       BOOLEAN DEFAULT false,
    discount_pct    NUMERIC(5,2) DEFAULT 0,
    user_id         UUID,
    seller_name     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_client_id ON public.sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_status_date_desc ON public.sales(status, date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_local_id ON public.sales(local_id) WHERE local_id IS NOT NULL;


-- ============================================================
-- 5. ITEMS DE VENTA (sale_items)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sale_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id               UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id            UUID REFERENCES public.products(id) ON DELETE SET NULL,
    sku                   TEXT,
    product_name_snapshot TEXT NOT NULL,
    quantity              NUMERIC NOT NULL CHECK (quantity > 0),
    unit_price_usd        NUMERIC(10,4) NOT NULL,
    price_final_usd       NUMERIC(10,4),
    discount_pct          NUMERIC(5,2) DEFAULT 0,
    cost_unit_usd         NUMERIC(10,4) NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);


-- ============================================================
-- 6. ABONOS / PAGOS (payments)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id    UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    amount_usd NUMERIC(10,2) NOT NULL,
    amount_cop NUMERIC(10,2) DEFAULT 0,
    method     TEXT NOT NULL,
    note       TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON public.payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_method_created ON public.payments(method, created_at DESC);


-- ============================================================
-- 7. COTIZACIONES (quotes)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.quotes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number      TEXT UNIQUE NOT NULL DEFAULT ('COT-' || lpad(nextval('public.quote_number_seq')::text, 4, '0')),
    date        TIMESTAMPTZ DEFAULT now(),
    valid_until TIMESTAMPTZ,
    client_id   UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name TEXT,
    items       JSONB NOT NULL DEFAULT '[]',
    total_usd   NUMERIC(10,2) NOT NULL,
    total_bs    NUMERIC(10,2) NOT NULL,
    notes       TEXT,
    status      TEXT DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
    user_id     UUID,
    seller_name TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON public.quotes(client_id);


-- ============================================================
-- 8. DEVOLUCIONES / NOTAS DE CRÉDITO (returns)
-- ============================================================
-- Secuencia para numerar NCs automáticamente: NC-0001, NC-0002...
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

CREATE TABLE IF NOT EXISTS public.returns (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id           UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    date              TIMESTAMPTZ DEFAULT now(),
    client_id         UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    nc_number         TEXT DEFAULT ('NC-' || lpad(nextval('public.nc_number_seq')::text, 4, '0')),
    option            TEXT DEFAULT 'REEMBOLSO' CHECK (option IN ('CREDIT','REEMBOLSO')),
    reason            TEXT,
    refund_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    type              TEXT DEFAULT 'PARTIAL' CHECK (type IN ('FULL','PARTIAL')),
    items             JSONB NOT NULL DEFAULT '[]',
    user_id           UUID,
    seller_name       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_client_id ON public.returns(client_id);
CREATE INDEX IF NOT EXISTS idx_returns_user_id ON public.returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_date ON public.returns(date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_returns_nc_number ON public.returns(nc_number) WHERE nc_number IS NOT NULL;


-- ============================================================
-- 9. MOVIMIENTOS DE INVENTARIO (stock_movements)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID REFERENCES public.products(id) ON DELETE SET NULL,
    sku          TEXT NOT NULL,
    product_name TEXT NOT NULL,
    type         TEXT NOT NULL
                     CHECK (type IN ('SALE','RETURN','PURCHASE','ADJUSTMENT','SHRINKAGE','MANUAL')),
    qty_before   NUMERIC NOT NULL,
    qty_change   NUMERIC NOT NULL,
    qty_after    NUMERIC NOT NULL,
    reference_id TEXT,
    reason       TEXT,
    created_by   UUID,
    seller_name  TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by ON public.stock_movements(created_by);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON public.stock_movements(product_id, created_at DESC);


-- ============================================================
-- 10. GASTOS / PLANTILLAS RECURRENTES (expenses)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date           TEXT NOT NULL,
    description    TEXT NOT NULL,
    amount_usd     NUMERIC(10,2) NOT NULL,
    amount_bs      NUMERIC(10,2),
    amount_cop     NUMERIC(10,2),
    currency       TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS','COP')),
    category       TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    fx_rate_used   NUMERIC(12,6),
    fx_source      TEXT CHECK (fx_source IN ('BCV','TH','MANUAL')),
    user_id        UUID,
    seller_name    TEXT,
    is_recurring   BOOLEAN DEFAULT false,
    recurring_id   TEXT,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);


-- ============================================================
-- 10.5 PLANTILLAS DE GASTOS RECURRENTES (recurring_expenses)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description    TEXT NOT NULL,
    category       TEXT NOT NULL,
    amount_usd     NUMERIC(10,2) NOT NULL,
    amount_bs      NUMERIC(10,2),
    amount_cop     NUMERIC(10,2),
    currency       TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS','COP')),
    payment_method TEXT NOT NULL,
    day_of_month   INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
    is_active      BOOLEAN DEFAULT true,
    created_by     UUID,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON public.recurring_expenses(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_day_of_month ON public.recurring_expenses(day_of_month);


-- ============================================================
-- 11. CIERRES DE CAJA (cash_closes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cash_closes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_number SERIAL,
    closed_at       TIMESTAMPTZ DEFAULT now(),
    closed_by       UUID,
    seller_name     TEXT,
    total_usd       NUMERIC(10,2) DEFAULT 0,
    total_bs        NUMERIC(10,2) DEFAULT 0,
    tx_count        NUMERIC DEFAULT 0,
    declared_usd    NUMERIC(10,2) DEFAULT 0,
    declared_bs     NUMERIC(10,2) DEFAULT 0,
    declared_cop    NUMERIC(10,2) DEFAULT 0,
    shortage_usd    NUMERIC(10,2) DEFAULT 0,
    overage_usd     NUMERIC(10,2) DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 12. USUARIOS DE LA APP (users)
-- Espejo de auth.users con rol y estado de la aplicación
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cash_ledger (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date          TEXT NOT NULL,
    direction     TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
    kind          TEXT NOT NULL
                     CHECK (kind IN ('VENTA_COBRADA','ABONO_CLIENTE','ABONO_PROVEEDOR','GASTO_OPERATIVO','AJUSTE')),
    amount_usd    NUMERIC(10,2) NOT NULL,
    amount_bs     NUMERIC(10,2),
    amount_cop    NUMERIC(10,2),
    currency      TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','BS','COP')),
    payment_method TEXT NOT NULL,
    description   TEXT NOT NULL,
    reference_type TEXT,
    reference_id   TEXT,
    user_id       UUID,
    seller_name   TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_date ON public.cash_ledger(date);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_direction ON public.cash_ledger(direction);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_kind ON public.cash_ledger(kind);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_reference ON public.cash_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_user_id ON public.cash_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_created_at_desc ON public.cash_ledger(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_reference
    ON public.cash_ledger(reference_type, reference_id)
    WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.users (
    id         UUID PRIMARY KEY, -- Mismo UUID que auth.users
    email      TEXT NOT NULL,
    full_name  TEXT NOT NULL,
    role       TEXT DEFAULT 'VIEWER'
                   CHECK (role IN ('ADMIN','MANAGER','SELLER','VIEWER')),
    is_active  BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 13. PROVEEDORES (suppliers)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    rif          TEXT,
    rif_type     TEXT,
    contact_name TEXT,
    phone        TEXT,
    email        TEXT,
    address      TEXT,
    category     TEXT,
    notes        TEXT,
    catalog      JSONB DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);


-- ============================================================
-- 14. FACTURAS DE COMPRA (invoices)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    number            TEXT NOT NULL,
    supplier          UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    date_issue        TEXT NOT NULL,
    date_due          TEXT NOT NULL,
    status            TEXT DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','PARTIAL','PAID','CANCELLED')),
    cost_type         TEXT DEFAULT 'BCV' CHECK (cost_type IN ('BCV','TH')),
    items             JSONB DEFAULT '[]'::jsonb,
    subtotal_usd      NUMERIC(10,2) DEFAULT 0,
    freight_total_usd NUMERIC(10,2) DEFAULT 0,
    tax_total_usd     NUMERIC(10,2) DEFAULT 0,
    total_usd         NUMERIC(10,2) DEFAULT 0,
    paid_amount_usd   NUMERIC(10,2) DEFAULT 0,
    payments          JSONB DEFAULT '[]'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON public.invoices(supplier);
CREATE INDEX IF NOT EXISTS idx_invoices_date_issue ON public.invoices(date_issue);
CREATE INDEX IF NOT EXISTS idx_invoices_date_due ON public.invoices(date_due);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_org_supplier_number
    ON public.invoices (organization_id, coalesce(supplier::text, '__NO_SUPPLIER__'), lower(btrim(number)));


-- ============================================================
-- 15. MÉTODOS DE PAGO (payment_methods)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    currency   TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS','COP')),
    commission_pct NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: métodos de pago comunes
INSERT INTO public.payment_methods (name, currency, commission_pct) VALUES
    ('Efectivo USD', 'USD', 0),
    ('Zelle',        'USD', 0),
    ('Pago Móvil',   'BS', 0),
    ('Punto de Venta', 'BS', 0)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 16. AUDITORÍA (audit_logs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id    UUID,
    user_name  TEXT,
    user_email TEXT,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  UUID,
    changes    JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Habilitar RLS en todas las tablas
ALTER TABLE public.organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs       ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCIÓN AUXILIAR DE ROL (necesaria para todas las políticas)
-- ============================================================
-- Retorna el rol del usuario autenticado actual desde public.users.
-- Si el usuario no existe o está desactivado, retorna 'DEACTIVATED'.
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
  RETURN COALESCE(v_role, 'DEACTIVATED');
END;
$$;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(id));

DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
CREATE POLICY "organizations_insert" ON public.organizations
    FOR INSERT TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
CREATE POLICY "organizations_update" ON public.organizations
    FOR UPDATE TO authenticated
    USING (public.user_has_org_access(id, ARRAY['OWNER', 'ADMIN']))
    WITH CHECK (public.user_has_org_access(id, ARRAY['OWNER', 'ADMIN']));

DROP POLICY IF EXISTS "organizations_delete" ON public.organizations;
CREATE POLICY "organizations_delete" ON public.organizations
    FOR DELETE TO authenticated
    USING (public.user_has_org_access(id, ARRAY['OWNER']));

-- ============================================================
-- ORGANIZATION_MEMBERS
-- ============================================================
DROP POLICY IF EXISTS "org_members_select" ON public.organization_members;
CREATE POLICY "org_members_select" ON public.organization_members
    FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "org_members_manage" ON public.organization_members;
CREATE POLICY "org_members_manage" ON public.organization_members
    FOR ALL TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- ============================================================
-- SETTINGS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow anon read settings"                           ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated to read settings"              ON public.settings;
DROP POLICY IF EXISTS "Allow admin to manage settings"                    ON public.settings;
DROP POLICY IF EXISTS "settings_org_select"                               ON public.settings;
DROP POLICY IF EXISTS "settings_org_update"                               ON public.settings;
DROP POLICY IF EXISTS "settings_org_insert"                               ON public.settings;

CREATE POLICY "Allow anon read settings"
    ON public.settings FOR SELECT TO anon USING (true);
CREATE POLICY "settings_org_select"
    ON public.settings FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "settings_org_manage"
    ON public.settings FOR ALL TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- ============================================================
-- PRODUCTS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on products"  ON public.products;
DROP POLICY IF EXISTS "Allow authenticated to read products"              ON public.products;
DROP POLICY IF EXISTS "Allow admin and manager to modify products"        ON public.products;
DROP POLICY IF EXISTS "products_org_select"                               ON public.products;
DROP POLICY IF EXISTS "products_org_manage"                               ON public.products;

CREATE POLICY "products_org_select"
    ON public.products FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "products_org_manage"
    ON public.products FOR ALL TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- ============================================================
-- CLIENTS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on clients"   ON public.clients;
DROP POLICY IF EXISTS "Allow authenticated to read clients"               ON public.clients;
DROP POLICY IF EXISTS "Allow staff to insert clients"                     ON public.clients;
DROP POLICY IF EXISTS "Allow admin and manager to manage clients"         ON public.clients;
DROP POLICY IF EXISTS "Allow admin and manager to delete clients"         ON public.clients;
DROP POLICY IF EXISTS "clients_org_select"                                ON public.clients;
DROP POLICY IF EXISTS "clients_org_insert"                                ON public.clients;
DROP POLICY IF EXISTS "clients_org_update"                                ON public.clients;
DROP POLICY IF EXISTS "clients_org_delete"                                ON public.clients;

CREATE POLICY "clients_org_select"
    ON public.clients FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "clients_org_insert"
    ON public.clients FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));
CREATE POLICY "clients_org_update"
    ON public.clients FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));
CREATE POLICY "clients_org_delete"
    ON public.clients FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- ============================================================
-- SALES
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on sales"     ON public.sales;
DROP POLICY IF EXISTS "Allow read sales by role"                          ON public.sales;
DROP POLICY IF EXISTS "Allow insert sales"                                ON public.sales;
DROP POLICY IF EXISTS "Allow admin and manager to update sales"           ON public.sales;
DROP POLICY IF EXISTS "sales_org_select"                                  ON public.sales;
DROP POLICY IF EXISTS "sales_org_insert"                                  ON public.sales;
DROP POLICY IF EXISTS "sales_org_update"                                  ON public.sales;
DROP POLICY IF EXISTS "sales_org_delete"                                  ON public.sales;

CREATE POLICY "sales_org_select"
    ON public.sales FOR SELECT TO authenticated
    USING (
        public.user_has_org_access(organization_id)
        AND (
            public.get_user_org_role(organization_id) IN ('OWNER', 'ADMIN', 'MANAGER', 'VIEWER')
            OR (public.get_user_org_role(organization_id) = 'SELLER' AND user_id = auth.uid())
        )
    );
CREATE POLICY "sales_org_insert"
    ON public.sales FOR INSERT TO authenticated
    WITH CHECK (
        public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER'])
        AND user_id = auth.uid()
    );
CREATE POLICY "sales_org_update"
    ON public.sales FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));
CREATE POLICY "sales_org_delete"
    ON public.sales FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- ============================================================
-- SALE_ITEMS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Allow read sale items by role"                       ON public.sale_items;
DROP POLICY IF EXISTS "Allow insert sale items"                             ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_org_select"                               ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_org_insert"                               ON public.sale_items;

CREATE POLICY "sale_items_org_select"
    ON public.sale_items FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "sale_items_org_insert"
    ON public.sale_items FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));

-- ============================================================
-- PAYMENTS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on payments"   ON public.payments;
DROP POLICY IF EXISTS "Allow read payments by role"                        ON public.payments;
DROP POLICY IF EXISTS "Allow insert payments by role"                      ON public.payments;
DROP POLICY IF EXISTS "payments_org_select"                                ON public.payments;
DROP POLICY IF EXISTS "payments_org_insert"                                ON public.payments;

CREATE POLICY "payments_org_select"
    ON public.payments FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "payments_org_insert"
    ON public.payments FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));

-- ============================================================
-- QUOTES
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on quotes"    ON public.quotes;
DROP POLICY IF EXISTS "Allow read quotes by role"                         ON public.quotes;
DROP POLICY IF EXISTS "Allow insert quotes by role"                       ON public.quotes;
DROP POLICY IF EXISTS "Allow update quotes by role"                       ON public.quotes;
DROP POLICY IF EXISTS "Allow delete quotes by role"                       ON public.quotes;
DROP POLICY IF EXISTS "quotes_org_select"                                 ON public.quotes;
DROP POLICY IF EXISTS "quotes_org_insert"                                 ON public.quotes;
DROP POLICY IF EXISTS "quotes_org_update"                                 ON public.quotes;
DROP POLICY IF EXISTS "quotes_org_delete"                                 ON public.quotes;

CREATE POLICY "quotes_org_select"
    ON public.quotes FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "quotes_org_insert"
    ON public.quotes FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));
CREATE POLICY "quotes_org_update"
    ON public.quotes FOR UPDATE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER', 'SELLER']));
CREATE POLICY "quotes_org_delete"
    ON public.quotes FOR DELETE TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- ============================================================
-- RETURNS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on returns"   ON public.returns;
DROP POLICY IF EXISTS "Allow read returns by role"                        ON public.returns;
DROP POLICY IF EXISTS "Allow insert returns by role"                      ON public.returns;
DROP POLICY IF EXISTS "returns_org_select"                                ON public.returns;
DROP POLICY IF EXISTS "returns_org_insert"                                ON public.returns;

CREATE POLICY "returns_org_select"
    ON public.returns FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "returns_org_insert"
    ON public.returns FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- ============================================================
-- STOCK_MOVEMENTS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Allow read stock_movements by role"                       ON public.stock_movements;
DROP POLICY IF EXISTS "Allow insert stock_movements by role"                     ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_org_select"                               ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_org_insert"                               ON public.stock_movements;

CREATE POLICY "stock_movements_org_select"
    ON public.stock_movements FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "stock_movements_org_insert"
    ON public.stock_movements FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- ============================================================
-- EXPENSES
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on expenses"  ON public.expenses;
DROP POLICY IF EXISTS "Allow read expenses by role"                       ON public.expenses;
DROP POLICY IF EXISTS "Allow insert expenses by role"                     ON public.expenses;
DROP POLICY IF EXISTS "Allow update expenses by role"                     ON public.expenses;
DROP POLICY IF EXISTS "Allow delete expenses by role"                     ON public.expenses;
DROP POLICY IF EXISTS "expenses_org_select"                               ON public.expenses;
DROP POLICY IF EXISTS "expenses_org_manage"                               ON public.expenses;

CREATE POLICY "expenses_org_select"
    ON public.expenses FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "expenses_org_manage"
    ON public.expenses FOR ALL TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- ============================================================
-- RECURRING_EXPENSES
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on recurring_expenses" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Allow read recurring_expenses by role"                       ON public.recurring_expenses;
DROP POLICY IF EXISTS "Allow insert recurring_expenses by role"                     ON public.recurring_expenses;
DROP POLICY IF EXISTS "Allow update recurring_expenses by role"                     ON public.recurring_expenses;
DROP POLICY IF EXISTS "Allow delete recurring_expenses by role"                     ON public.recurring_expenses;
DROP POLICY IF EXISTS "recurring_expenses_org_select"                               ON public.recurring_expenses;
DROP POLICY IF EXISTS "recurring_expenses_org_manage"                               ON public.recurring_expenses;

CREATE POLICY "recurring_expenses_org_select"
    ON public.recurring_expenses FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "recurring_expenses_org_manage"
    ON public.recurring_expenses FOR ALL TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- ============================================================
-- CASH_CLOSES
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on cash_closes" ON public.cash_closes;
DROP POLICY IF EXISTS "Allow read cash_closes by role"                       ON public.cash_closes;
DROP POLICY IF EXISTS "Allow insert cash_closes by role"                     ON public.cash_closes;
DROP POLICY IF EXISTS "cash_closes_org_select"                               ON public.cash_closes;
DROP POLICY IF EXISTS "cash_closes_org_insert"                               ON public.cash_closes;

CREATE POLICY "cash_closes_org_select"
    ON public.cash_closes FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "cash_closes_org_insert"
    ON public.cash_closes FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- ============================================================
-- CASH_LEDGER
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on cash_ledger" ON public.cash_ledger;
DROP POLICY IF EXISTS "Allow read cash_ledger by role"                       ON public.cash_ledger;
DROP POLICY IF EXISTS "Allow insert cash_ledger by role"                     ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_org_select"                               ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_org_insert"                               ON public.cash_ledger;

CREATE POLICY "cash_ledger_org_select"
    ON public.cash_ledger FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "cash_ledger_org_insert"
    ON public.cash_ledger FOR INSERT TO authenticated
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- ============================================================
-- USERS (Perfil de usuario)
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on users"      ON public.users;
DROP POLICY IF EXISTS "Allow read users by role"                           ON public.users;
DROP POLICY IF EXISTS "Allow update own user or admin"                     ON public.users;

CREATE POLICY "Allow read users by role"
    ON public.users FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "Allow update own user or admin"
    ON public.users FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.current_user_role() = 'ADMIN')
    WITH CHECK (id = auth.uid() OR public.current_user_role() = 'ADMIN');

-- ============================================================
-- SUPPLIERS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow read suppliers by role"                       ON public.suppliers;
DROP POLICY IF EXISTS "Allow insert suppliers by role"                     ON public.suppliers;
DROP POLICY IF EXISTS "Allow update suppliers by role"                     ON public.suppliers;
DROP POLICY IF EXISTS "Allow delete suppliers by role"                     ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_org_select"                               ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_org_manage"                               ON public.suppliers;

CREATE POLICY "suppliers_org_select"
    ON public.suppliers FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "suppliers_org_manage"
    ON public.suppliers FOR ALL TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- ============================================================
-- INVOICES
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on invoices"  ON public.invoices;
DROP POLICY IF EXISTS "Allow read invoices by role"                       ON public.invoices;
DROP POLICY IF EXISTS "Allow insert invoices by role"                     ON public.invoices;
DROP POLICY IF EXISTS "Allow update invoices by role"                     ON public.invoices;
DROP POLICY IF EXISTS "Allow delete invoices by role"                     ON public.invoices;
DROP POLICY IF EXISTS "invoices_org_select"                               ON public.invoices;
DROP POLICY IF EXISTS "invoices_org_manage"                               ON public.invoices;

CREATE POLICY "invoices_org_select"
    ON public.invoices FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "invoices_org_manage"
    ON public.invoices FOR ALL TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'MANAGER']));

-- ============================================================
-- PAYMENT_METHODS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Allow read payment_methods by role"                       ON public.payment_methods;
DROP POLICY IF EXISTS "Allow insert payment_methods by role"                     ON public.payment_methods;
DROP POLICY IF EXISTS "Allow update payment_methods by role"                     ON public.payment_methods;
DROP POLICY IF EXISTS "Allow delete payment_methods by role"                     ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_org_select"                               ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_org_manage"                               ON public.payment_methods;

CREATE POLICY "payment_methods_org_select"
    ON public.payment_methods FOR SELECT TO authenticated
    USING (public.user_has_org_access(organization_id));
CREATE POLICY "payment_methods_org_manage"
    ON public.payment_methods FOR ALL TO authenticated
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']))
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated users full access on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow read audit_logs by role"                       ON public.audit_logs;
DROP POLICY IF EXISTS "Allow insert audit_logs by role"                     ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_org_select"                               ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_org_insert"                               ON public.audit_logs;

CREATE POLICY "audit_logs_org_select"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (organization_id IS NULL OR public.user_has_org_access(organization_id));
CREATE POLICY "audit_logs_org_insert"
    ON public.audit_logs FOR INSERT TO authenticated
    WITH CHECK (organization_id IS NULL OR public.user_has_org_access(organization_id));


-- 17. PUBLICACION REALTIME (sincronizacion multiusuario)
-- ============================================================
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'products',
        'clients',
        'sales',
        'sale_items',
        'payments',
        'suppliers',
        'invoices',
        'payment_methods',
        'quotes',
        'returns',
        'stock_movements',
        'expenses',
        'recurring_expenses',
        'cash_ledger',
        'settings',
        'users'
    ];
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH tbl IN ARRAY tables LOOP
            IF NOT EXISTS (
                SELECT 1
                FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime'
                  AND schemaname = 'public'
                  AND tablename = tbl
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
            END IF;
        END LOOP;
    END IF;
END;
$$;


-- ============================================================
-- 18. SINCRONIZACION auth.users -> public.users
-- Evita sesiones validas sin perfil en la tabla users de la app
-- ============================================================
-- ⚠️ SECURITY (H1): NUNCA leer 'role' de raw_user_meta_data.
-- Un atacante puede llamar signUp({ options: { data: { role: 'ADMIN' } } })
-- y escalar privilegios si confiamos en esa metadata.
-- El rol siempre es VIEWER al registrarse. Solo un ADMIN autenticado
-- puede cambiar el rol desde el panel de gestión de usuarios.
CREATE OR REPLACE FUNCTION public.sync_public_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name text;
BEGIN
    v_full_name := coalesce(
        nullif(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
        split_part(coalesce(NEW.email, 'usuario'), '@', 1),
        'Usuario'
    );

    INSERT INTO public.users (id, email, full_name, role, is_active, updated_at)
    VALUES (
        NEW.id,
        coalesce(NEW.email, ''),
        v_full_name,
        'VIEWER',   -- SIEMPRE VIEWER. Nunca leer role de raw_user_meta_data.
        true,
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email      = EXCLUDED.email,
        full_name  = EXCLUDED.full_name,
        -- NO actualizar 'role' en el ON CONFLICT: preservar el rol asignado por ADMIN.
        updated_at = now();

    RETURN NEW;
END;
$$;

-- Eliminar ambas variantes de nombre que puedan existir en instancias previas
DROP TRIGGER IF EXISTS trg_sync_public_user_from_auth ON auth.users;
DROP TRIGGER IF EXISTS tr_sync_public_user_from_auth  ON auth.users;

-- Solo en INSERT: evita sobrescribir rol cuando alguien cambia su email/metadata
CREATE TRIGGER trg_sync_public_user_from_auth
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_public_user_from_auth();

-- Backfill: sincronizar usuarios de auth que no tengan perfil en public.users.
-- Asigna VIEWER por defecto (no leer role de metadata).
INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    is_active,
    created_at,
    updated_at
)
SELECT
    au.id,
    coalesce(au.email, ''),
    coalesce(
        nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
        split_part(coalesce(au.email, ''), '@', 1),
        'Usuario'
    ) AS full_name,
    'VIEWER' AS role,  -- Siempre VIEWER en backfill también
    true,
    now(),
    now()
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL;


-- ============================================================
-- 18. FUNCIONES (RPC)
-- ============================================================
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb, numeric);
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.process_sale_atomic(
    p_client_id uuid,
    p_payment_method text,
    p_paid_amount_usd numeric,
    p_status text,
    p_total_usd numeric,
    p_total_ved numeric,
    p_is_credit boolean,
    p_user_id uuid,
    p_seller_name text,
    p_items jsonb,
    p_discount_pct numeric DEFAULT 0,
    p_tasa_bcv numeric DEFAULT NULL,
    p_tasa_cop numeric DEFAULT NULL
)
RETURNS TABLE (sale_id uuid, local_id integer, sale_date timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale_id uuid;
    v_local_id integer;
    v_sale_date timestamptz := now();
    v_stock numeric;
    v_sku text;
    v_pname text;
    r_stock RECORD;
    elem jsonb;
    v_method_currency text := 'USD';
    v_effective_tasa_bcv numeric;
    v_effective_tasa_cop numeric;
    v_paid_bs numeric;
    v_paid_cop numeric;
    -- H5: Variables para validación de límite de crédito
    v_credit_limit   numeric;
    v_credit_balance numeric;
    v_new_debt       numeric;
BEGIN
    -- Validación de precondiciones
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito de venta no puede estar vacío';
    END IF;

    -- H5: Validación de límite de crédito (backend enforcement)
    -- REGLA DE NEGOCIO: credit_limit = 0 significa $0.00 de límite (no puede fiar).
    -- Toda venta a crédito requiere un cliente asignado y no puede superar credit_limit.
    IF coalesce(p_is_credit, false) = true THEN
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'VENTA_CREDITO_SIN_CLIENTE:Venta a crédito requiere un cliente registrado';
        END IF;

        SELECT
            coalesce(credit_limit, 0),
            coalesce(credit_balance, 0)
        INTO v_credit_limit, v_credit_balance
        FROM public.clients
        WHERE id = p_client_id
        FOR SHARE;

        v_new_debt := GREATEST(coalesce(p_total_usd, 0) - coalesce(p_paid_amount_usd, 0), 0);
        IF (v_credit_balance + v_new_debt) > v_credit_limit THEN
            RAISE EXCEPTION 'CREDITO_INSUFICIENTE:%:limite=%,deuda_actual=%,nueva_deuda=%',
                p_client_id,
                v_credit_limit,
                v_credit_balance,
                v_new_debt;
        END IF;
    END IF;

    -- 1. Insertar Cabecera de Venta
    INSERT INTO public.sales (
        client_id,
        total_usd,
        total_ved,
        payment_method,
        status,
        paid_amount_usd,
        is_credit,
        discount_pct,
        user_id,
        seller_name,
        date
    ) VALUES (
        p_client_id,
        p_total_usd,
        coalesce(p_total_ved, 0),
        p_payment_method,
        p_status,
        coalesce(p_paid_amount_usd, 0),
        coalesce(p_is_credit, false),
        coalesce(p_discount_pct, 0),
        p_user_id,
        p_seller_name,
        v_sale_date
    )
    RETURNING id, sales.local_id, sales.date
    INTO v_sale_id, v_local_id, v_sale_date;

    -- 2. Procesamiento y Bloqueo de Stock
    -- NOTA DBA: Consolidar y ordenar estrictamente por product_id ASC para eliminar Deadlocks (40P01)
    FOR r_stock IN (
        SELECT 
            (item->>'product_id')::uuid AS product_id,
            sum((item->>'quantity')::numeric) AS total_quantity
        FROM jsonb_array_elements(p_items) AS item
        WHERE (item->>'product_id') IS NOT NULL
        GROUP BY (item->>'product_id')::uuid
        ORDER BY (item->>'product_id')::uuid ASC
    ) LOOP
        -- Validar cantidad estrictamente positiva
        IF r_stock.total_quantity <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida para producto %: % (Debe ser > 0)', r_stock.product_id, r_stock.total_quantity;
        END IF;

        -- Bloqueo pesimista determinista
        SELECT stock, sku, name INTO v_stock, v_sku, v_pname
        FROM public.products
        WHERE id = r_stock.product_id
        FOR UPDATE;

        IF v_stock IS NULL THEN
            RAISE EXCEPTION 'Producto no encontrado en catálogo: %', r_stock.product_id;
        END IF;

        IF v_stock < r_stock.total_quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%:disponible=%,solicitado=%', r_stock.product_id, v_stock, r_stock.total_quantity;
        END IF;

        -- Actualizar stock
        UPDATE public.products
        SET stock = stock - r_stock.total_quantity
        WHERE id = r_stock.product_id;

        -- Registrar movimiento de Kardex (stock_movements) DENTRO de la transacción
        INSERT INTO public.stock_movements (
            product_id,
            sku,
            product_name,
            type,
            qty_before,
            qty_change,
            qty_after,
            reference_id,
            reason,
            created_by,
            seller_name,
            created_at
        ) VALUES (
            r_stock.product_id,
            v_sku,
            v_pname,
            'SALE',
            v_stock,
            -r_stock.total_quantity,
            v_stock - r_stock.total_quantity,
            v_sale_id::text,
            'Venta registrada #' || coalesce(v_local_id::text, substring(v_sale_id::text from 1 for 8)),
            p_user_id,
            p_seller_name,
            v_sale_date
        );
    END LOOP;

    -- 3. Registrar ítems individuales de venta (preservando snapshots y descuentos individuales)
    FOR elem IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.sale_items (
            sale_id,
            product_id,
            sku,
            product_name_snapshot,
            quantity,
            unit_price_usd,
            cost_unit_usd,
            discount_pct
        ) VALUES (
            v_sale_id,
            (elem->>'product_id')::uuid,
            coalesce(elem->>'sku', ''),
            coalesce(elem->>'product_name', elem->>'name', 'Producto'),
            (elem->>'quantity')::numeric,
            (elem->>'unit_price_usd')::numeric,
            coalesce((elem->>'cost_unit_usd')::numeric, 0),
            coalesce((elem->>'discount_pct')::numeric, p_discount_pct, 0)
        );
    END LOOP;

    -- 4. Registrar Pago y Asiento de Caja si hubo cobro
    IF p_paid_amount_usd > 0 THEN
        -- Resolver moneda del método de pago
        SELECT coalesce(currency, 'USD') INTO v_method_currency
        FROM public.payment_methods
        WHERE name = p_payment_method
        LIMIT 1;

        -- Resolver tasas efectivas para el cálculo del cobro real
        IF p_tasa_bcv IS NOT NULL AND p_tasa_bcv > 0 THEN
            v_effective_tasa_bcv := p_tasa_bcv;
        ELSIF p_total_usd > 0 AND p_total_ved > 0 THEN
            v_effective_tasa_bcv := p_total_ved / p_total_usd;
        ELSE
            SELECT coalesce(tasa_bcv, 1) INTO v_effective_tasa_bcv FROM public.settings LIMIT 1;
        END IF;

        IF p_tasa_cop IS NOT NULL AND p_tasa_cop > 0 THEN
            v_effective_tasa_cop := p_tasa_cop;
        ELSE
            SELECT coalesce(tasa_cop, 1) INTO v_effective_tasa_cop FROM public.settings LIMIT 1;
        END IF;

        -- Cálculos contables exactos según moneda de cobro
        v_paid_bs := CASE WHEN v_method_currency = 'BS' THEN round(p_paid_amount_usd * coalesce(v_effective_tasa_bcv, 1), 2) ELSE NULL END;
        v_paid_cop := CASE WHEN v_method_currency = 'COP' THEN round(p_paid_amount_usd * coalesce(v_effective_tasa_cop, 1)) ELSE NULL END;

        INSERT INTO public.payments (
            sale_id,
            amount_usd,
            amount_cop,
            method,
            note
        ) VALUES (
            v_sale_id,
            p_paid_amount_usd,
            coalesce(v_paid_cop, 0),
            p_payment_method,
            'Pago Inicial'
        );

        -- Asiento atómico en cash_ledger
        INSERT INTO public.cash_ledger (
            date,
            direction,
            kind,
            amount_usd,
            amount_bs,
            amount_cop,
            currency,
            payment_method,
            description,
            reference_type,
            reference_id,
            user_id,
            seller_name,
            created_at
        ) VALUES (
            v_sale_date::text,
            'IN',
            'VENTA_COBRADA',
            p_paid_amount_usd,
            v_paid_bs,
            v_paid_cop,
            coalesce(v_method_currency, 'USD'),
            p_payment_method,
            'Cobro inicial de venta #' || coalesce(v_local_id::text, substring(v_sale_id::text from 1 for 8)),
            'sale-payment',
            v_sale_id::text || ':initial',
            p_user_id,
            p_seller_name,
            v_sale_date
        )
        ON CONFLICT (reference_type, reference_id) DO NOTHING;
    END IF;

    RETURN QUERY SELECT v_sale_id, v_local_id, v_sale_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_return_atomic(
    p_sale_id uuid,
    p_client_id uuid,
    p_option text,             -- 'CREDIT' o 'REEMBOLSO'
    p_reason text,
    p_refund_amount_usd numeric,
    p_type text,               -- 'FULL' o 'PARTIAL'
    p_items jsonb,
    p_user_id uuid,
    p_seller_name text
)
RETURNS TABLE (return_id uuid, nc_number text, return_date timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return_id uuid;
    v_nc_number text;
    v_return_date timestamptz := now();
    v_next_val bigint;
    v_stock numeric;
    v_sku text;
    v_pname text;
    r_stock RECORD;
BEGIN
    -- Validaciones de entrada
    IF p_option NOT IN ('CREDIT', 'REEMBOLSO') THEN
        RAISE EXCEPTION 'Opción de devolución inválida: %', p_option;
    END IF;

    -- 1. Adquisición estricta de bloqueos en orden jerárquico:
    --    Paso A: Bloquear la venta asociada para evitar anulación/devolución simultánea
    PERFORM 1 FROM public.sales WHERE id = p_sale_id FOR UPDATE;

    --    Paso B: Asignar número correlativo de Nota de Crédito en la misma transacción DML
    v_next_val := nextval('public.nc_number_seq');
    v_nc_number := 'NC-' || lpad(v_next_val::text, 4, '0');

    -- 2. Insertar Cabecera de Devolución
    INSERT INTO public.returns (
        sale_id,
        client_id,
        nc_number,
        option,
        reason,
        refund_amount_usd,
        type,
        items,
        user_id,
        seller_name,
        date
    ) VALUES (
        p_sale_id,
        p_client_id,
        v_nc_number,
        p_option,
        p_reason,
        coalesce(p_refund_amount_usd, 0),
        p_type,
        p_items,
        p_user_id,
        p_seller_name,
        v_return_date
    )
    RETURNING id INTO v_return_id;

    -- 3. Restaurar stock en orden canónico (evita Deadlocks) y registrar Kardex
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR r_stock IN (
            SELECT 
                coalesce(elem->>'productId', elem->>'product_id')::uuid AS product_id,
                sum(coalesce(elem->>'quantity', elem->>'qty')::numeric) AS total_quantity
            FROM jsonb_array_elements(p_items) AS elem
            WHERE coalesce(elem->>'productId', elem->>'product_id') IS NOT NULL
            GROUP BY coalesce(elem->>'productId', elem->>'product_id')::uuid
            ORDER BY coalesce(elem->>'productId', elem->>'product_id')::uuid ASC
        ) LOOP
            IF r_stock.total_quantity > 0 THEN
                SELECT stock, sku, name INTO v_stock, v_sku, v_pname
                FROM public.products
                WHERE id = r_stock.product_id
                FOR UPDATE;

                IF v_stock IS NOT NULL THEN
                    UPDATE public.products
                    SET stock = stock + r_stock.total_quantity
                    WHERE id = r_stock.product_id;

                    INSERT INTO public.stock_movements (
                        product_id,
                        sku,
                        product_name,
                        type,
                        qty_before,
                        qty_change,
                        qty_after,
                        reference_id,
                        reason,
                        created_by,
                        seller_name,
                        created_at
                    ) VALUES (
                        r_stock.product_id,
                        v_sku,
                        v_pname,
                        'RETURN',
                        v_stock,
                        r_stock.total_quantity,
                        v_stock + r_stock.total_quantity,
                        v_return_id::text,
                        coalesce(p_reason, 'Devolución asociada a ' || v_nc_number),
                        p_user_id,
                        p_seller_name,
                        v_return_date
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 4. Asiento en Caja si fue REEMBOLSO en efectivo
    IF p_option = 'REEMBOLSO' AND p_refund_amount_usd > 0 THEN
        INSERT INTO public.cash_ledger (
            date,
            direction,
            kind,
            amount_usd,
            currency,
            payment_method,
            description,
            reference_type,
            reference_id,
            user_id,
            seller_name,
            created_at
        ) VALUES (
            v_return_date::text,
            'OUT',
            'AJUSTE',
            p_refund_amount_usd,
            'USD',
            'Efectivo USD',
            'Reembolso devolución ' || v_nc_number || coalesce(' — ' || p_reason, ''),
            'return',
            v_return_id::text,
            p_user_id,
            p_seller_name,
            v_return_date
        );
    END IF;

    -- 5. Si es saldo a favor (CREDIT), actualizar crédito del cliente
    IF p_option = 'CREDIT' AND p_client_id IS NOT NULL AND p_refund_amount_usd > 0 THEN
        UPDATE public.clients
        SET credit_balance = coalesce(credit_balance, 0) + p_refund_amount_usd
        WHERE id = p_client_id;
    END IF;

    -- 6. Si es devolución total, marcar venta como cancelada
    IF p_type = 'FULL' THEN
        UPDATE public.sales
        SET status = 'CANCELLED'
        WHERE id = p_sale_id;
    END IF;

    RETURN QUERY SELECT v_return_id, v_nc_number, v_return_date;
END;
$$;

DROP FUNCTION IF EXISTS public.execute_safe_daily_close_z(uuid, text, numeric, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.execute_safe_daily_close_z(
    p_closed_by uuid,
    p_seller_name text,
    p_declared_usd numeric,
    p_declared_bs numeric,
    p_declared_cop numeric,
    p_notes text DEFAULT NULL
)
RETURNS TABLE (
    close_id uuid,
    sequence_number integer,
    closed_at timestamptz,
    tx_count integer,
    system_total_usd numeric,
    system_total_bs numeric,
    shortage_usd numeric,
    overage_usd numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_last_close_date timestamptz;
    v_now timestamptz := clock_timestamp();
    v_tx_count integer := 0;
    v_system_total_usd numeric(12,2) := 0;
    v_system_total_bs numeric(12,2) := 0;
    v_system_total_cop numeric(14,2) := 0;
    v_seq integer;
    v_new_close_id uuid;
    v_diff_usd numeric(12,2);
    v_shortage numeric(12,2) := 0;
    v_overage numeric(12,2) := 0;
BEGIN
    -- 1. Bloqueo pesimista de settings para serializar cierres y evitar ventanas de tiempo desincronizadas
    SELECT last_close_date INTO v_last_close_date
    FROM public.settings
    LIMIT 1
    FOR UPDATE;

    IF v_last_close_date IS NULL THEN
        v_last_close_date := '1970-01-01 00:00:00+00'::timestamptz;
    END IF;

    -- 2. Consolidar conteo de transacciones y cobros netos en el intervalo (last_close_date, v_now]
    SELECT 
        COUNT(*),
        COALESCE(SUM(paid_amount_usd), 0)
    INTO 
        v_tx_count,
        v_system_total_usd
    FROM public.sales
    WHERE date > v_last_close_date
      AND date <= v_now
      AND status <> 'CANCELLED';

    -- 3. Calcular ingresos netos reales en gaveta por moneda desde cash_ledger durante el turno
    -- Suma IN y resta OUT (gastos operativos / reembolsos) para reflejar saldo real
    SELECT
        COALESCE(SUM(CASE 
            WHEN currency = 'BS' THEN 
                CASE WHEN direction = 'IN' THEN coalesce(amount_bs, 0) ELSE -coalesce(amount_bs, 0) END 
            ELSE 0 
        END), 0),
        COALESCE(SUM(CASE 
            WHEN currency = 'COP' THEN 
                CASE WHEN direction = 'IN' THEN coalesce(amount_cop, 0) ELSE -coalesce(amount_cop, 0) END 
            ELSE 0 
        END), 0)
    INTO
        v_system_total_bs,
        v_system_total_cop
    FROM public.cash_ledger
    WHERE created_at > v_last_close_date
      AND created_at <= v_now;

    -- 4. Computar faltantes o sobrantes contra arqueo declarado en USD
    v_diff_usd := coalesce(p_declared_usd, 0) - v_system_total_usd;
    IF v_diff_usd < -0.01 THEN
        v_shortage := ABS(v_diff_usd);
    ELSIF v_diff_usd > 0.01 THEN
        v_overage := v_diff_usd;
    END IF;

    -- 5. Registrar Cierre Oficial
    INSERT INTO public.cash_closes (
        closed_at,
        closed_by,
        seller_name,
        total_usd,
        total_bs,
        tx_count,
        declared_usd,
        declared_bs,
        declared_cop,
        shortage_usd,
        overage_usd,
        notes
    ) VALUES (
        v_now,
        p_closed_by,
        p_seller_name,
        v_system_total_usd,
        v_system_total_bs,
        v_tx_count,
        p_declared_usd,
        p_declared_bs,
        p_declared_cop,
        v_shortage,
        v_overage,
        p_notes
    )
    RETURNING id, cash_closes.sequence_number INTO v_new_close_id, v_seq;

    -- 6. Avanzar la marca temporal exactamente a v_now
    UPDATE public.settings SET last_close_date = v_now;

    RETURN QUERY
    SELECT 
        v_new_close_id,
        v_seq,
        v_now,
        v_tx_count,
        v_system_total_usd,
        v_system_total_bs,
        v_shortage,
        v_overage;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
    p_product_id uuid,
    p_delta numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stock numeric;
    v_new_stock numeric;
BEGIN
    IF p_product_id IS NULL THEN
        RAISE EXCEPTION 'ID de producto no puede ser nulo';
    END IF;

    SELECT stock INTO v_stock
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;

    IF v_stock IS NULL THEN
        RAISE EXCEPTION 'Producto no encontrado: %', p_product_id;
    END IF;

    IF coalesce(p_delta, 0) = 0 THEN
        RETURN v_stock;
    END IF;

    v_new_stock := v_stock + p_delta;

    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'STOCK_NEGATIVO:%:actual=%,delta=%', p_product_id, v_stock, p_delta;
    END IF;

    UPDATE public.products
    SET stock = v_new_stock
    WHERE id = p_product_id;

    RETURN v_new_stock;
END;
$$;

-- Habilitar pgcrypto para encriptar contraseñas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.admin_update_user_password(target_user_id UUID, new_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar que quien llama tiene rol ADMIN o es el propio dueño
  IF auth.uid() != target_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'ADMIN'
    ) THEN
      RAISE EXCEPTION 'Permiso denegado. Solo administradores pueden cambiar contraseñas de otros usuarios.';
    END IF;
  END IF;

  -- Actualizar en la tabla auth.users
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$;

-- 2. Función para cambiar email directamente (Solo Admin)
CREATE OR REPLACE FUNCTION public.admin_update_user_email(target_user_id UUID, new_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar que quien llama tiene rol ADMIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    -- Permitimos el auto-cambio si fuese necesario, o estrictamente ADMIN
    IF auth.uid() != target_user_id THEN
      RAISE EXCEPTION 'Permiso denegado. Solo administradores pueden cambiar correos electrónicos de otros usuarios.';
    END IF;
  END IF;

  -- Actualiza el correo y lo auto-confirma para que el usuario pueda entrar de inmediato
  UPDATE auth.users
  SET email = new_email, email_confirmed_at = now()
  WHERE id = target_user_id;
  
  -- Actualiza también en public.users
  UPDATE public.users
  SET email = new_email
  WHERE id = target_user_id;
END;
$$;


-- ====================================================================
-- FIN DEL SCRIPT — Todo en Ruedas v1.0 (Sprint A.4)
-- ====================================================================
