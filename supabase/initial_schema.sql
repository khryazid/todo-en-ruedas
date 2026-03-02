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
    cost_type TEXT DEFAULT 'BCV',
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
    status TEXT DEFAULT 'DRAFT',
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
    contact_name TEXT,
    phone TEXT,
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
    cost_type TEXT DEFAULT 'BCV',
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
    created_at TIMESTAMPTZ DEFAULT now()
);

-- DUMMY INITIAL PAYMENT METHODS
INSERT INTO public.payment_methods (name, currency) VALUES 
('Efectivo USD', 'USD'),
('Zelle', 'USD'),
('Pago Móvil', 'BS'),
('Punto de Venta', 'BS')
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

-- ====================================================================
-- FIN DEL SCRIPT
-- ====================================================================
