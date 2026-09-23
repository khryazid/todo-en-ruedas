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
CREATE INDEX IF NOT EXISTS idx_sales_org ON public.sales(organization_id);
DROP INDEX IF EXISTS public.uq_sales_local_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_org_local_id ON public.sales (organization_id, local_id) WHERE local_id IS NOT NULL;

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
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_number_key;
DROP INDEX IF EXISTS public.uq_quotes_number;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_org_number ON public.quotes (organization_id, number);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON public.quotes(organization_id);

-- 4.8 returns
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.returns SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
ALTER TABLE public.returns ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.returns ALTER COLUMN organization_id SET NOT NULL;
DROP INDEX IF EXISTS public.uq_returns_nc_number;
CREATE UNIQUE INDEX IF NOT EXISTS uq_returns_org_nc_number ON public.returns (organization_id, nc_number) WHERE nc_number IS NOT NULL;
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
-- 5.5 RPCS TRANSACCIONALES CON SOPORTE MULTI-TENANT
-- ============================================================
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb, numeric);
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb, numeric, numeric, numeric, uuid);

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
    p_tasa_cop numeric DEFAULT NULL,
    p_organization_id uuid DEFAULT NULL
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
    v_credit_limit   numeric;
    v_credit_balance numeric;
    v_new_debt       numeric;
    v_org_id         uuid := coalesce(p_organization_id, '00000000-0000-0000-0000-000000000001'::uuid);
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito de venta no puede estar vacío';
    END IF;

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
        organization_id,
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
        v_org_id,
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
    FOR r_stock IN (
        SELECT 
            (item->>'product_id')::uuid AS product_id,
            sum((item->>'quantity')::numeric) AS total_quantity
        FROM jsonb_array_elements(p_items) AS item
        WHERE (item->>'product_id') IS NOT NULL
        GROUP BY (item->>'product_id')::uuid
        ORDER BY (item->>'product_id')::uuid ASC
    ) LOOP
        IF r_stock.total_quantity <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida para producto %: % (Debe ser > 0)', r_stock.product_id, r_stock.total_quantity;
        END IF;

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

        UPDATE public.products
        SET stock = stock - r_stock.total_quantity
        WHERE id = r_stock.product_id;

        INSERT INTO public.stock_movements (
            organization_id,
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
            v_org_id,
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

    -- 3. Registrar ítems individuales de venta
    FOR elem IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.sale_items (
            organization_id,
            sale_id,
            product_id,
            sku,
            product_name_snapshot,
            quantity,
            unit_price_usd,
            cost_unit_usd,
            discount_pct
        ) VALUES (
            v_org_id,
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
        SELECT coalesce(currency, 'USD') INTO v_method_currency
        FROM public.payment_methods
        WHERE name = p_payment_method AND organization_id = v_org_id
        LIMIT 1;

        IF v_method_currency IS NULL THEN
            SELECT coalesce(currency, 'USD') INTO v_method_currency
            FROM public.payment_methods
            WHERE name = p_payment_method
            LIMIT 1;
        END IF;

        IF p_tasa_bcv IS NOT NULL AND p_tasa_bcv > 0 THEN
            v_effective_tasa_bcv := p_tasa_bcv;
        ELSIF p_total_usd > 0 AND p_total_ved > 0 THEN
            v_effective_tasa_bcv := p_total_ved / p_total_usd;
        ELSE
            SELECT coalesce(tasa_bcv, 1) INTO v_effective_tasa_bcv FROM public.settings WHERE organization_id = v_org_id LIMIT 1;
        END IF;

        IF p_tasa_cop IS NOT NULL AND p_tasa_cop > 0 THEN
            v_effective_tasa_cop := p_tasa_cop;
        ELSE
            SELECT coalesce(tasa_cop, 1) INTO v_effective_tasa_cop FROM public.settings WHERE organization_id = v_org_id LIMIT 1;
        END IF;

        v_paid_bs := CASE WHEN v_method_currency = 'BS' THEN round(p_paid_amount_usd * coalesce(v_effective_tasa_bcv, 1), 2) ELSE NULL END;
        v_paid_cop := CASE WHEN v_method_currency = 'COP' THEN round(p_paid_amount_usd * coalesce(v_effective_tasa_cop, 1)) ELSE NULL END;

        INSERT INTO public.payments (
            organization_id,
            sale_id,
            amount_usd,
            amount_cop,
            method,
            note
        ) VALUES (
            v_org_id,
            v_sale_id,
            p_paid_amount_usd,
            coalesce(v_paid_cop, 0),
            p_payment_method,
            'Pago Inicial'
        );

        INSERT INTO public.cash_ledger (
            organization_id,
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
            v_org_id,
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
    v_org_id uuid;
BEGIN
    IF p_option NOT IN ('CREDIT', 'REEMBOLSO') THEN
        RAISE EXCEPTION 'Opción de devolución inválida: %', p_option;
    END IF;

    PERFORM 1 FROM public.sales WHERE id = p_sale_id FOR UPDATE;

    SELECT organization_id INTO v_org_id FROM public.sales WHERE id = p_sale_id;
    IF v_org_id IS NULL THEN
        v_org_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    v_next_val := nextval('public.nc_number_seq');
    v_nc_number := 'NC-' || lpad(v_next_val::text, 4, '0');

    INSERT INTO public.returns (
        organization_id,
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
        v_org_id,
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
                        organization_id,
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
                        v_org_id,
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

    IF p_option = 'REEMBOLSO' AND p_refund_amount_usd > 0 THEN
        INSERT INTO public.cash_ledger (
            organization_id,
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
            v_org_id,
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

    IF p_option = 'CREDIT' AND p_client_id IS NOT NULL AND p_refund_amount_usd > 0 THEN
        UPDATE public.clients
        SET credit_balance = coalesce(credit_balance, 0) + p_refund_amount_usd
        WHERE id = p_client_id;
    END IF;

    IF p_type = 'FULL' THEN
        UPDATE public.sales
        SET status = 'CANCELLED'
        WHERE id = p_sale_id;
    END IF;

    RETURN QUERY SELECT v_return_id, v_nc_number, v_return_date;
END;
$$;

DROP FUNCTION IF EXISTS public.execute_safe_daily_close_z(uuid, text, numeric, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.execute_safe_daily_close_z(uuid, text, numeric, numeric, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.execute_safe_daily_close_z(
    p_closed_by uuid,
    p_seller_name text,
    p_declared_usd numeric,
    p_declared_bs numeric,
    p_declared_cop numeric,
    p_notes text DEFAULT NULL,
    p_organization_id uuid DEFAULT NULL
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
    v_org_id uuid := coalesce(p_organization_id, '00000000-0000-0000-0000-000000000001'::uuid);
BEGIN
    SELECT last_close_date INTO v_last_close_date
    FROM public.settings
    WHERE organization_id = v_org_id
    LIMIT 1
    FOR UPDATE;

    IF v_last_close_date IS NULL THEN
        v_last_close_date := '1970-01-01 00:00:00+00'::timestamptz;
    END IF;

    SELECT 
        COUNT(*),
        COALESCE(SUM(paid_amount_usd), 0)
    INTO 
        v_tx_count,
        v_system_total_usd
    FROM public.sales
    WHERE organization_id = v_org_id
      AND date > v_last_close_date
      AND date <= v_now
      AND status <> 'CANCELLED';

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
    WHERE organization_id = v_org_id
      AND created_at > v_last_close_date
      AND created_at <= v_now;

    v_diff_usd := coalesce(p_declared_usd, 0) - v_system_total_usd;
    IF v_diff_usd < -0.01 THEN
        v_shortage := ABS(v_diff_usd);
    ELSIF v_diff_usd > 0.01 THEN
        v_overage := v_diff_usd;
    END IF;

    INSERT INTO public.cash_closes (
        organization_id,
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
        v_org_id,
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

    UPDATE public.settings SET last_close_date = v_now WHERE organization_id = v_org_id;

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
