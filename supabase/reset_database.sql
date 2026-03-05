-- ====================================================================
-- SCRIPT DE RESETEO DE BASE DE DATOS SUPABASE (Glyph Core QC)
-- ====================================================================
-- Este script ELIMINA de forma intencional y destructiva 
-- todas las tablas, vistas y políticas atadas al entorno público
-- para luego ejecutar una recreación limpia.
--
-- INSTRUCCIONES:
-- 1. Ve a tu panel de Supabase -> SQL Editor -> New Query.
-- 2. Pega todo este texto.
-- 3. Haz click en "Run" (o presiona CMD/CTRL + Enter).
-- ====================================================================

-- 1. ELIMINACIÓN MASIVA (OJO: Orden inverso de dependencias para evitar bloqueos por llaves foráneas)
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.sale_items CASCADE;
DROP TABLE IF EXISTS public.sales CASCADE;
DROP TABLE IF EXISTS public.quotes CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.cash_closes CASCADE;
DROP TABLE IF EXISTS public.cash_ledger CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- (Opcional) Limpia la caché si estabas usando storage
-- DELETE FROM storage.objects WHERE bucket_id = 'tu_bucket_aqui';

-- 2. AVISO DE ÉXITO
-- Si el log no da errores de color rojo abajo en la consola, la base de datos está vacía.

-- ====================================================================
-- 3. RE - INICIALIZACIÓN (Pegado del schema por defecto)
-- A partir de aquí, las tablas se levantan en blanco.
-- ====================================================================

CREATE TABLE public.settings (
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

CREATE TABLE public.products (
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

CREATE TABLE public.clients (
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

CREATE TABLE public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_id SERIAL, 
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

CREATE TABLE public.sale_items (
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

CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    amount_usd NUMERIC NOT NULL,
    method TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.quotes (
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

CREATE TABLE public.expenses (
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

CREATE TABLE public.cash_closes (
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

CREATE TABLE public.cash_ledger (
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

CREATE INDEX idx_cash_ledger_date ON public.cash_ledger(date);
CREATE INDEX idx_cash_ledger_direction ON public.cash_ledger(direction);
CREATE INDEX idx_cash_ledger_kind ON public.cash_ledger(kind);
CREATE INDEX idx_cash_ledger_reference ON public.cash_ledger(reference_type, reference_id);
CREATE UNIQUE INDEX uq_cash_ledger_reference
ON public.cash_ledger(reference_type, reference_id)
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE TABLE public.users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'VIEWER',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.suppliers (
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

CREATE TABLE public.invoices (
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

CREATE TABLE public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    currency TEXT DEFAULT 'USD',
    commission_pct NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.payment_methods (name, currency, commission_pct) VALUES 
('Efectivo USD', 'USD', 0),
('Zelle', 'USD', 0),
('Pago Móvil', 'BS', 0),
('Punto de Venta', 'BS', 0)
ON CONFLICT DO NOTHING;

CREATE TABLE public.audit_logs (
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

-- Nota final: Los usuarios CREADOS de Supabase Auth no se borran con DROP en public.
-- Deberás ir a Authentication -> Users en tu panel de Supabase y darles "Delete User" manualmente
-- si deseas que tu login en el frontend vuelva a arrancar totalmente de cero.
