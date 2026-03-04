-- ====================================================================
-- TODO EN RUEDAS — RESET COMPLETO DE BASE DE DATOS
-- ====================================================================
-- ⚠️  ADVERTENCIA: Este script ELIMINA TODOS LOS DATOS.
--     Úsalo solo en entornos de desarrollo o cuando quieras
--     empezar completamente desde cero.
--
-- INSTRUCCIONES:
-- 1. Supabase → SQL Editor → New Query
-- 2. Pega este script completo
-- 3. Haz click en "Run"
--
-- NOTA: Los usuarios de Auth (Supabase Authentication) NO se
-- eliminan con este script. Ve a Authentication → Users y
-- bórralos manualmente si necesitas un reset total de login.
-- ====================================================================


-- ============================================================
-- PASO 1: ELIMINAR TODO (orden inverso de dependencias FK)
-- ============================================================
DROP TABLE IF EXISTS public.audit_logs       CASCADE;
DROP TABLE IF EXISTS public.stock_movements  CASCADE;
DROP TABLE IF EXISTS public.returns          CASCADE;
DROP TABLE IF EXISTS public.payments         CASCADE;
DROP TABLE IF EXISTS public.sale_items       CASCADE;
DROP TABLE IF EXISTS public.sales            CASCADE;
DROP TABLE IF EXISTS public.quotes           CASCADE;
DROP TABLE IF EXISTS public.expenses         CASCADE;
DROP TABLE IF EXISTS public.cash_closes      CASCADE;
DROP TABLE IF EXISTS public.invoices         CASCADE;
DROP TABLE IF EXISTS public.suppliers        CASCADE;
DROP TABLE IF EXISTS public.payment_methods  CASCADE;
DROP TABLE IF EXISTS public.clients          CASCADE;
DROP TABLE IF EXISTS public.products         CASCADE;
DROP TABLE IF EXISTS public.settings         CASCADE;
DROP TABLE IF EXISTS public.users            CASCADE;

-- Secuencias
DROP SEQUENCE IF EXISTS public.nc_number_seq CASCADE;


-- ============================================================
-- PASO 2: RECREAR ESQUEMA COMPLETO
-- (Idéntico a schema.sql — mantener ambos sincronizados)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- settings
CREATE TABLE public.settings (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name           TEXT NOT NULL DEFAULT 'Mi Empresa',
    rif                    TEXT NOT NULL DEFAULT 'J-00000000',
    address                TEXT,
    tasa_bcv               NUMERIC(10,4) DEFAULT 0,
    tasa_monitor           NUMERIC(10,4) DEFAULT 0,
    show_monitor_rate      BOOLEAN DEFAULT false,
    last_close_date        TIMESTAMPTZ,
    shift_start            TEXT DEFAULT '08:00',
    default_margin         NUMERIC(5,2) DEFAULT 30,
    default_vat            NUMERIC(5,2) DEFAULT 16,
    printer_currency       TEXT DEFAULT 'BS',
    show_seller_commission BOOLEAN DEFAULT false,
    seller_commission_pct  NUMERIC(5,2) DEFAULT 5,
    margin_mayorista       NUMERIC(5,2) DEFAULT 0,
    margin_especial        NUMERIC(5,2) DEFAULT 0,
    company_logo           TEXT,
    brand_color            TEXT,
    created_at             TIMESTAMPTZ DEFAULT now()
);

-- products
CREATE TABLE public.products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku           TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    category      TEXT DEFAULT 'General',
    stock         NUMERIC DEFAULT 0,
    min_stock     NUMERIC DEFAULT 0,
    cost          NUMERIC DEFAULT 0,
    cost_type     TEXT DEFAULT 'BCV' CHECK (cost_type IN ('BCV','MONITOR','MANUAL')),
    freight       NUMERIC DEFAULT 0,
    supplier      TEXT,
    custom_margin NUMERIC,
    custom_vat    NUMERIC,
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_products_sku      ON public.products(sku);
CREATE INDEX idx_products_category ON public.products(category);

-- clients
CREATE TABLE public.clients (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    rif            TEXT UNIQUE NOT NULL,
    phone          TEXT,
    address        TEXT,
    email          TEXT,
    notes          TEXT,
    price_list     TEXT DEFAULT 'Detal' CHECK (price_list IN ('Detal','Mayorista','Especial')),
    credit_limit   NUMERIC(10,2) DEFAULT 0,
    credit_balance NUMERIC(10,2) DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_clients_rif ON public.clients(rif);

-- sales
CREATE TABLE public.sales (
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
CREATE INDEX idx_sales_client_id ON public.sales(client_id);
CREATE INDEX idx_sales_date      ON public.sales(date);
CREATE INDEX idx_sales_status    ON public.sales(status);

-- sale_items
CREATE TABLE public.sale_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id               UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id            UUID REFERENCES public.products(id) ON DELETE SET NULL,
    sku                   TEXT,
    product_name_snapshot TEXT NOT NULL,
    quantity              NUMERIC NOT NULL,
    unit_price_usd        NUMERIC(10,4) NOT NULL,
    price_final_usd       NUMERIC(10,4),
    discount_pct          NUMERIC(5,2) DEFAULT 0,
    cost_unit_usd         NUMERIC(10,4) NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sale_items_sale_id ON public.sale_items(sale_id);

-- payments
CREATE TABLE public.payments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id    UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    amount_usd NUMERIC(10,2) NOT NULL,
    method     TEXT NOT NULL,
    note       TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_payments_sale_id ON public.payments(sale_id);

-- quotes
CREATE TABLE public.quotes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number      TEXT UNIQUE NOT NULL,
    date        TIMESTAMPTZ DEFAULT now(),
    valid_until TIMESTAMPTZ,
    client_id   UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name TEXT,
    items       JSONB NOT NULL DEFAULT '[]',
    total_usd   NUMERIC(10,2) NOT NULL,
    total_bs    NUMERIC(10,2) NOT NULL,
    notes       TEXT,
    status      TEXT DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','SENT','ACCEPTED','EXPIRED','CANCELLED')),
    user_id     UUID,
    seller_name TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_quotes_status ON public.quotes(status);

-- Secuencia NC para devoluciones
CREATE SEQUENCE public.nc_number_seq START 1;

-- returns
CREATE TABLE public.returns (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id           UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    client_id         UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    nc_number         TEXT,
    option            TEXT DEFAULT 'REEMBOLSO' CHECK (option IN ('CREDIT','REEMBOLSO')),
    reason            TEXT,
    refund_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    type              TEXT DEFAULT 'PARTIAL' CHECK (type IN ('FULL','PARTIAL')),
    items             JSONB NOT NULL DEFAULT '[]',
    created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_returns_sale_id   ON public.returns(sale_id);
CREATE INDEX idx_returns_client_id ON public.returns(client_id);

-- stock_movements
CREATE TABLE public.stock_movements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID REFERENCES public.products(id) ON DELETE SET NULL,
    sku          TEXT NOT NULL,
    product_name TEXT NOT NULL,
    type         TEXT NOT NULL
                     CHECK (type IN ('SALE','RETURN','PURCHASE','ADJUSTMENT','SHRINKAGE','MANUAL')),
    quantity     NUMERIC NOT NULL,
    before_stock NUMERIC NOT NULL,
    after_stock  NUMERIC NOT NULL,
    reference_id TEXT,
    note         TEXT,
    user_id      UUID,
    user_name    TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX idx_stock_movements_type       ON public.stock_movements(type);
CREATE INDEX idx_stock_movements_created_at ON public.stock_movements(created_at);

-- expenses
CREATE TABLE public.expenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date           TEXT NOT NULL,
    description    TEXT NOT NULL,
    amount_usd     NUMERIC(10,2) NOT NULL,
    amount_bs      NUMERIC(10,2),
    currency       TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
    category       TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    user_id        UUID,
    seller_name    TEXT,
    is_recurring   BOOLEAN DEFAULT false,
    recurring_id   TEXT,
    created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_expenses_date     ON public.expenses(date);
CREATE INDEX idx_expenses_category ON public.expenses(category);

-- cash_closes
CREATE TABLE public.cash_closes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_number SERIAL,
    closed_at       TIMESTAMPTZ DEFAULT now(),
    closed_by       UUID,
    seller_name     TEXT,
    total_usd       NUMERIC(10,2) DEFAULT 0,
    total_bs        NUMERIC(10,2) DEFAULT 0,
    tx_count        NUMERIC DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- users
CREATE TABLE public.users (
    id         UUID PRIMARY KEY,
    email      TEXT NOT NULL,
    full_name  TEXT NOT NULL,
    role       TEXT DEFAULT 'VIEWER'
                   CHECK (role IN ('ADMIN','MANAGER','SELLER','VIEWER')),
    is_active  BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- suppliers
CREATE TABLE public.suppliers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    contact_name TEXT,
    phone        TEXT,
    email        TEXT,
    catalog      JSONB DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_suppliers_name ON public.suppliers(name);

-- invoices
CREATE TABLE public.invoices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number            TEXT NOT NULL,
    supplier          UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    date_issue        TEXT NOT NULL,
    date_due          TEXT NOT NULL,
    status            TEXT DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','PARTIAL','PAID','CANCELLED')),
    cost_type         TEXT DEFAULT 'BCV' CHECK (cost_type IN ('BCV','MONITOR','MANUAL')),
    items             JSONB DEFAULT '[]'::jsonb,
    subtotal_usd      NUMERIC(10,2) DEFAULT 0,
    freight_total_usd NUMERIC(10,2) DEFAULT 0,
    tax_total_usd     NUMERIC(10,2) DEFAULT 0,
    total_usd         NUMERIC(10,2) DEFAULT 0,
    paid_amount_usd   NUMERIC(10,2) DEFAULT 0,
    payments          JSONB DEFAULT '[]'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_invoices_status   ON public.invoices(status);
CREATE INDEX idx_invoices_supplier ON public.invoices(supplier);

-- payment_methods
CREATE TABLE public.payment_methods (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    currency   TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
    created_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.payment_methods (name, currency) VALUES
    ('Efectivo USD', 'USD'),
    ('Zelle',        'USD'),
    ('Pago Móvil',   'BS'),
    ('Punto de Venta', 'BS');

-- audit_logs
CREATE TABLE public.audit_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity  ON public.audit_logs(entity);


-- ============================================================
-- PASO 3: ROW LEVEL SECURITY
-- ============================================================
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
ALTER TABLE public.cash_closes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_settings"        ON public.settings        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_settings"        ON public.settings        FOR SELECT TO anon USING (true);
CREATE POLICY "auth_full_products"        ON public.products         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_clients"         ON public.clients          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_sales"           ON public.sales            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_sale_items"      ON public.sale_items       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_payments"        ON public.payments         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_quotes"          ON public.quotes           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_returns"         ON public.returns          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_stock_movements" ON public.stock_movements  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_expenses"        ON public.expenses         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_cash_closes"     ON public.cash_closes      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_users"           ON public.users            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_suppliers"       ON public.suppliers        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_invoices"        ON public.invoices         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_payment_methods" ON public.payment_methods  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_audit_logs"      ON public.audit_logs       FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- 17. FUNCIONES (RPC)
-- ============================================================
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
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_update_user_email(target_user_id UUID, new_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    IF auth.uid() != target_user_id THEN
      RAISE EXCEPTION 'Permiso denegado. Solo administradores pueden cambiar correos electrónicos de otros usuarios.';
    END IF;
  END IF;

  UPDATE auth.users
  SET email = new_email, email_confirmed_at = now()
  WHERE id = target_user_id;
  
  UPDATE public.users
  SET email = new_email
  WHERE id = target_user_id;
END;
$$;


-- ====================================================================
-- FIN DEL RESET — Todo en Ruedas v1.0 (Sprint A.4)
-- ====================================================================
