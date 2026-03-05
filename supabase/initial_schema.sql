-- ====================================================================
-- SCRIPT DE INICIALIZACIÓN DE BASE DE DATOS SUPABASE (Glyph Core)
-- ====================================================================
-- Este script crea todas las tablas requeridas por la aplicación
-- Todo en Ruedas (Glyph Core) en un proyecto de Supabase en blanco.
--
-- INSTRUCCIONES:
-- Vas a tu panel de Supabase -> SQL Editor -> New Query.
-- Pegas todo este texto y le das a "Run".
-- ====================================================================

-- 1. TABLA CONFIGURACIÓN EMPRESARIAL (settings)
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    rif TEXT NOT NULL,
    address TEXT,
    tasa_bcv NUMERIC DEFAULT 0,
    tasa_monitor NUMERIC DEFAULT 0,
    show_monitor_rate BOOLEAN DEFAULT false,
    last_close_date TIMESTAMPTZ,
    shift_start TEXT DEFAULT '08:00',
    default_margin NUMERIC DEFAULT 30,
    default_vat NUMERIC DEFAULT 16,
    printer_currency TEXT DEFAULT 'BS',
    seller_commission_pct NUMERIC DEFAULT 5,
    company_logo TEXT,
    brand_color TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABLA INVENTARIO (products)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    stock NUMERIC DEFAULT 0,
    min_stock NUMERIC DEFAULT 0,
    cost NUMERIC DEFAULT 0,
    cost_type TEXT DEFAULT 'BCV' CHECK (cost_type IN ('BCV','TH')),
    freight NUMERIC DEFAULT 0,
    supplier TEXT,
    custom_margin NUMERIC,
    custom_vat NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLA CLIENTES (clients)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    rif TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    email TEXT,
    notes TEXT,
    credit_limit NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABLA VENTAS (sales)
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_id SERIAL, -- Autoincremental garantizado por Postgres
    date TIMESTAMPTZ DEFAULT now(),
    client_id UUID REFERENCES public.clients(id),
    total_usd NUMERIC NOT NULL,
    total_ved NUMERIC NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    paid_amount_usd NUMERIC NOT NULL DEFAULT 0,
    is_credit BOOLEAN DEFAULT false,
    user_id UUID,
    seller_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TABLA ITEMS DE VENTA (sale_items)
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    sku TEXT,
    product_name_snapshot TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit_price_usd NUMERIC NOT NULL,
    cost_unit_usd NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TABLA ABONOS/PAGOS (payments)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    amount_usd NUMERIC NOT NULL,
    method TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. TABLA COTIZACIONES (quotes)
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number TEXT UNIQUE NOT NULL,
    date TIMESTAMPTZ DEFAULT now(),
    valid_until TIMESTAMPTZ,
    client_id UUID REFERENCES public.clients(id),
    client_name TEXT,
    items JSONB NOT NULL,
    total_usd NUMERIC NOT NULL,
    total_bs NUMERIC NOT NULL,
    notes TEXT,
    status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
    user_id UUID,
    seller_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. TABLA GASTOS Y PLANTILLAS RECURRENTES (expenses)
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_usd NUMERIC NOT NULL,
    amount_bs NUMERIC,
    currency TEXT DEFAULT 'USD',
    category TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    fx_rate_used NUMERIC(12,6),
    fx_source TEXT CHECK (fx_source IN ('BCV','TH','MANUAL')),
    user_id UUID,
    seller_name TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurring_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. TABLA CIERRES DE CAJA GLOBALES (cash_closes)
CREATE TABLE IF NOT EXISTS public.cash_closes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_number SERIAL,
    closed_at TIMESTAMPTZ DEFAULT now(),
    closed_by UUID,
    seller_name TEXT,
    total_usd NUMERIC DEFAULT 0,
    total_bs NUMERIC DEFAULT 0,
    tx_count NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. TABLA USUARIOS CUSTOM DE LA APP (users)
-- (Normalmente es manejado por Auth Supabase, pero proveemos una tabla espejo local)
CREATE TABLE IF NOT EXISTS public.cash_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
    kind TEXT NOT NULL CHECK (kind IN ('VENTA_COBRADA','ABONO_CLIENTE','ABONO_PROVEEDOR','GASTO_OPERATIVO','AJUSTE')),
    amount_usd NUMERIC(10,2) NOT NULL,
    amount_bs NUMERIC(10,2),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
    payment_method TEXT NOT NULL,
    description TEXT NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    user_id UUID,
    seller_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_date ON public.cash_ledger(date);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_direction ON public.cash_ledger(direction);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_kind ON public.cash_ledger(kind);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_reference ON public.cash_ledger(reference_type, reference_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_reference
ON public.cash_ledger(reference_type, reference_id)
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY, -- Mismo ID que auth.users
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'VIEWER',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 11. TABLA PROVEEDORES Y COMPRAS (suppliers, invoices)
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    rif TEXT,
    rif_type TEXT,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    category TEXT,
    notes TEXT,
    catalog JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number TEXT NOT NULL,
    supplier UUID REFERENCES public.suppliers(id),
    date_issue TEXT NOT NULL,
    date_due TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    cost_type TEXT DEFAULT 'BCV' CHECK (cost_type IN ('BCV','TH')),
    items JSONB DEFAULT '[]'::jsonb,
    subtotal_usd NUMERIC DEFAULT 0,
    freight_total_usd NUMERIC DEFAULT 0,
    tax_total_usd NUMERIC DEFAULT 0,
    total_usd NUMERIC DEFAULT 0,
    paid_amount_usd NUMERIC DEFAULT 0,
    payments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. TABLA MÉTODOS DE PAGO (payment_methods)
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    currency TEXT DEFAULT 'USD',
    commission_pct NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- DUMMY INITIAL PAYMENT METHODS
INSERT INTO public.payment_methods (name, currency, commission_pct) VALUES 
('Efectivo USD', 'USD', 0),
('Zelle', 'USD', 0),
('Pago Móvil', 'BS', 0),
('Punto de Venta', 'BS', 0)
ON CONFLICT DO NOTHING;

-- 13. TABLA AUDITORÍA (audit_logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_name TEXT,
    user_email TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID,
    changes JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. SINCRONIZACION auth.users -> public.users
-- Garantiza que cada usuario autenticado tenga perfil en la tabla users.
CREATE OR REPLACE FUNCTION public.sync_public_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role text;
    resolved_name text;
BEGIN
    resolved_role := upper(coalesce(NEW.raw_user_meta_data ->> 'role', 'VIEWER'));
    IF resolved_role NOT IN ('ADMIN', 'MANAGER', 'SELLER', 'VIEWER') THEN
        resolved_role := 'VIEWER';
    END IF;

    resolved_name := coalesce(
        nullif(NEW.raw_user_meta_data ->> 'full_name', ''),
        split_part(coalesce(NEW.email, ''), '@', 1),
        'Usuario'
    );

    INSERT INTO public.users (id, email, full_name, role, is_active, updated_at)
    VALUES (NEW.id, coalesce(NEW.email, ''), resolved_name, resolved_role, true, now())
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        updated_at = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_public_user_from_auth ON auth.users;

CREATE TRIGGER trg_sync_public_user_from_auth
AFTER INSERT OR UPDATE OF email, raw_user_meta_data
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_public_user_from_auth();

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
        nullif(au.raw_user_meta_data ->> 'full_name', ''),
        split_part(coalesce(au.email, ''), '@', 1),
        'Usuario'
    ) AS full_name,
    CASE
        WHEN upper(coalesce(au.raw_user_meta_data ->> 'role', 'VIEWER')) IN ('ADMIN', 'MANAGER', 'SELLER', 'VIEWER')
            THEN upper(coalesce(au.raw_user_meta_data ->> 'role', 'VIEWER'))
        ELSE 'VIEWER'
    END AS role,
    true,
    now(),
    now()
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL;

-- ====================================================================
-- FIN DEL SCRIPT
-- ====================================================================
