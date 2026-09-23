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
DROP TABLE IF EXISTS public.recurring_expenses CASCADE;
DROP TABLE IF EXISTS public.expenses         CASCADE;
DROP TABLE IF EXISTS public.cash_closes      CASCADE;
DROP TABLE IF EXISTS public.cash_ledger      CASCADE;
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
    tasa_cop               NUMERIC(10,4) DEFAULT 0,
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

CREATE UNIQUE INDEX uq_settings_singleton
    ON public.settings ((true));

-- products
CREATE TABLE public.products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku           TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    category      TEXT DEFAULT 'General',
    stock         NUMERIC DEFAULT 0,
    min_stock     NUMERIC DEFAULT 0,
    cost          NUMERIC DEFAULT 0,
    cost_type     TEXT DEFAULT 'BCV' CHECK (cost_type IN ('BCV','TH')),
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
                    CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
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
    date              TIMESTAMPTZ DEFAULT now(),
    client_id         UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    nc_number         TEXT,
    option            TEXT DEFAULT 'REEMBOLSO' CHECK (option IN ('CREDIT','REEMBOLSO')),
    reason            TEXT,
    refund_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    type              TEXT DEFAULT 'PARTIAL' CHECK (type IN ('FULL','PARTIAL')),
    items             JSONB NOT NULL DEFAULT '[]',
    user_id           UUID,
    seller_name       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_returns_sale_id   ON public.returns(sale_id);
CREATE INDEX idx_returns_client_id ON public.returns(client_id);
CREATE INDEX idx_returns_date      ON public.returns(date);

-- stock_movements
CREATE TABLE public.stock_movements (
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
    amount_cop     NUMERIC(10,2),
    currency       TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
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
CREATE INDEX idx_expenses_date     ON public.expenses(date);
CREATE INDEX idx_expenses_category ON public.expenses(category);

-- recurring_expenses
CREATE TABLE public.recurring_expenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description    TEXT NOT NULL,
    category       TEXT NOT NULL,
    amount_usd     NUMERIC(10,2) NOT NULL,
    amount_bs      NUMERIC(10,2),
    amount_cop     NUMERIC(10,2),
    currency       TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
    payment_method TEXT NOT NULL,
    day_of_month   INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
    is_active      BOOLEAN DEFAULT true,
    created_by     UUID,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_recurring_expenses_active ON public.recurring_expenses(is_active);
CREATE INDEX idx_recurring_expenses_day_of_month ON public.recurring_expenses(day_of_month);

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

-- cash_ledger
CREATE TABLE public.cash_ledger (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date           TEXT NOT NULL,
    direction      TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
    kind           TEXT NOT NULL
                       CHECK (kind IN ('VENTA_COBRADA','ABONO_CLIENTE','ABONO_PROVEEDOR','GASTO_OPERATIVO','AJUSTE')),
    amount_usd     NUMERIC(10,2) NOT NULL,
    amount_bs      NUMERIC(10,2),
    amount_cop     NUMERIC(10,2),
    currency       TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
    payment_method TEXT NOT NULL,
    description    TEXT NOT NULL,
    reference_type TEXT,
    reference_id   TEXT,
    user_id        UUID,
    seller_name    TEXT,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_cash_ledger_date      ON public.cash_ledger(date);
CREATE INDEX idx_cash_ledger_direction ON public.cash_ledger(direction);
CREATE INDEX idx_cash_ledger_kind      ON public.cash_ledger(kind);
CREATE INDEX idx_cash_ledger_reference ON public.cash_ledger(reference_type, reference_id);
CREATE UNIQUE INDEX uq_cash_ledger_reference
    ON public.cash_ledger(reference_type, reference_id)
    WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

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
CREATE INDEX idx_invoices_status   ON public.invoices(status);
CREATE INDEX idx_invoices_supplier ON public.invoices(supplier);
CREATE UNIQUE INDEX uq_invoices_supplier_number_normalized
    ON public.invoices (coalesce(supplier::text, '__NO_SUPPLIER__'), lower(btrim(number)));

-- payment_methods
CREATE TABLE public.payment_methods (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    currency   TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
    commission_pct NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.payment_methods (name, currency, commission_pct) VALUES
    ('Efectivo USD', 'USD', 0),
    ('Zelle',        'USD', 0),
    ('Pago Móvil',   'BS', 0),
    ('Punto de Venta', 'BS', 0);

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
-- POLÍTICAS RLS RESTRICTIVAS POR ROL
-- ============================================================

-- SETTINGS
DROP POLICY IF EXISTS "Allow authenticated users full access on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow anon read settings"                           ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated to read settings"              ON public.settings;
DROP POLICY IF EXISTS "Allow admin to manage settings"                    ON public.settings;

CREATE POLICY "Allow anon read settings"
    ON public.settings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated to read settings"
    ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin to manage settings"
    ON public.settings FOR ALL TO authenticated
    USING    (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');

-- PRODUCTS
DROP POLICY IF EXISTS "Allow authenticated users full access on products"  ON public.products;
DROP POLICY IF EXISTS "Allow authenticated to read products"              ON public.products;
DROP POLICY IF EXISTS "Allow admin and manager to modify products"        ON public.products;

CREATE POLICY "Allow authenticated to read products"
    ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin and manager to modify products"
    ON public.products FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- CLIENTS
DROP POLICY IF EXISTS "Allow authenticated users full access on clients"   ON public.clients;
DROP POLICY IF EXISTS "Allow authenticated to read clients"               ON public.clients;
DROP POLICY IF EXISTS "Allow staff to insert clients"                     ON public.clients;
DROP POLICY IF EXISTS "Allow admin and manager to manage clients"         ON public.clients;
DROP POLICY IF EXISTS "Allow admin and manager to delete clients"         ON public.clients;

CREATE POLICY "Allow authenticated to read clients"
    ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow staff to insert clients"
    ON public.clients FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER'));
CREATE POLICY "Allow admin and manager to manage clients"
    ON public.clients FOR UPDATE TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));
CREATE POLICY "Allow admin and manager to delete clients"
    ON public.clients FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- SALES
DROP POLICY IF EXISTS "Allow authenticated users full access on sales"     ON public.sales;
DROP POLICY IF EXISTS "Allow read sales by role"                          ON public.sales;
DROP POLICY IF EXISTS "Allow insert sales"                                ON public.sales;
DROP POLICY IF EXISTS "Allow admin and manager to update sales"           ON public.sales;

CREATE POLICY "Allow read sales by role"
    ON public.sales FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );
CREATE POLICY "Allow insert sales"
    ON public.sales FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER')
        AND user_id = auth.uid()
    );
CREATE POLICY "Allow admin and manager to update sales"
    ON public.sales FOR UPDATE TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- SALE_ITEMS
DROP POLICY IF EXISTS "Allow authenticated users full access on sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Allow read sale items by role"                       ON public.sale_items;
DROP POLICY IF EXISTS "Allow insert sale items"                             ON public.sale_items;

CREATE POLICY "Allow read sale items by role"
    ON public.sale_items FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER')
        OR EXISTS (
            SELECT 1 FROM public.sales s
            WHERE s.id = sale_items.sale_id
              AND public.current_user_role() = 'SELLER'
              AND s.user_id = auth.uid()
        )
    );
CREATE POLICY "Allow insert sale items"
    ON public.sale_items FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR EXISTS (
            SELECT 1 FROM public.sales s
            WHERE s.id = sale_items.sale_id
              AND public.current_user_role() = 'SELLER'
              AND s.user_id = auth.uid()
        )
    );

-- PAYMENTS
DROP POLICY IF EXISTS "Allow authenticated users full access on payments"  ON public.payments;
DROP POLICY IF EXISTS "Allow read payments by role"                        ON public.payments;
DROP POLICY IF EXISTS "Allow insert payments by role"                      ON public.payments;
DROP POLICY IF EXISTS "Allow admin and manager to manage payments"          ON public.payments;

CREATE POLICY "Allow read payments by role"
    ON public.payments FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER')
        OR EXISTS (
            SELECT 1 FROM public.sales s
            WHERE s.id = payments.sale_id
              AND public.current_user_role() = 'SELLER'
              AND s.user_id = auth.uid()
        )
    );
CREATE POLICY "Allow insert payments by role"
    ON public.payments FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR EXISTS (
            SELECT 1 FROM public.sales s
            WHERE s.id = payments.sale_id
              AND public.current_user_role() = 'SELLER'
              AND s.user_id = auth.uid()
        )
    );
CREATE POLICY "Allow admin and manager to manage payments"
    ON public.payments FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- QUOTES
DROP POLICY IF EXISTS "Allow authenticated users full access on quotes"    ON public.quotes;
DROP POLICY IF EXISTS "Allow read quotes by role"                          ON public.quotes;
DROP POLICY IF EXISTS "Allow insert quotes by role"                        ON public.quotes;
DROP POLICY IF EXISTS "Allow update quotes by role"                        ON public.quotes;
DROP POLICY IF EXISTS "Allow admin and manager to delete quotes"           ON public.quotes;

CREATE POLICY "Allow read quotes by role"
    ON public.quotes FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );
CREATE POLICY "Allow insert quotes by role"
    ON public.quotes FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );
CREATE POLICY "Allow update quotes by role"
    ON public.quotes FOR UPDATE TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    )
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );
CREATE POLICY "Allow admin and manager to delete quotes"
    ON public.quotes FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- RETURNS
DROP POLICY IF EXISTS "Allow authenticated users full access on returns"   ON public.returns;
DROP POLICY IF EXISTS "Allow read returns by role"                         ON public.returns;
DROP POLICY IF EXISTS "Allow insert returns by role"                       ON public.returns;
DROP POLICY IF EXISTS "Allow admin and manager to manage returns"           ON public.returns;

CREATE POLICY "Allow read returns by role"
    ON public.returns FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );
CREATE POLICY "Allow insert returns by role"
    ON public.returns FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );
CREATE POLICY "Allow admin and manager to manage returns"
    ON public.returns FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- STOCK_MOVEMENTS
DROP POLICY IF EXISTS "Allow authenticated users full access on stock_movements"  ON public.stock_movements;
DROP POLICY IF EXISTS "Allow read stock movements by role"                        ON public.stock_movements;
DROP POLICY IF EXISTS "Allow admin and manager to insert stock movements"         ON public.stock_movements;
DROP POLICY IF EXISTS "Allow admin to manage stock movements"                     ON public.stock_movements;

CREATE POLICY "Allow read stock movements by role"
    ON public.stock_movements FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER', 'VIEWER'));
CREATE POLICY "Allow admin and manager to insert stock movements"
    ON public.stock_movements FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));
CREATE POLICY "Allow admin to manage stock movements"
    ON public.stock_movements FOR ALL TO authenticated
    USING    (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');

-- EXPENSES
DROP POLICY IF EXISTS "Allow authenticated users full access on expenses"         ON public.expenses;
DROP POLICY IF EXISTS "Allow expenses access to authorized roles"                 ON public.expenses;

CREATE POLICY "Allow expenses access to authorized roles"
    ON public.expenses FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- RECURRING_EXPENSES
DROP POLICY IF EXISTS "Allow authenticated users full access on recurring_expenses" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Allow recurring expenses to authorized roles"                ON public.recurring_expenses;

CREATE POLICY "Allow recurring expenses to authorized roles"
    ON public.recurring_expenses FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- CASH_CLOSES
DROP POLICY IF EXISTS "Allow authenticated users full access on cash_closes"      ON public.cash_closes;
DROP POLICY IF EXISTS "Allow read cash closes by role"                           ON public.cash_closes;
DROP POLICY IF EXISTS "Allow insert cash closes by role"                         ON public.cash_closes;
DROP POLICY IF EXISTS "Allow admin to manage cash closes"                         ON public.cash_closes;

CREATE POLICY "Allow read cash closes by role"
    ON public.cash_closes FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER'));
CREATE POLICY "Allow insert cash closes by role"
    ON public.cash_closes FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));
CREATE POLICY "Allow admin to manage cash closes"
    ON public.cash_closes FOR ALL TO authenticated
    USING    (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');

-- CASH_LEDGER
DROP POLICY IF EXISTS "Allow authenticated users full access on cash_ledger"      ON public.cash_ledger;
DROP POLICY IF EXISTS "Allow read cash ledger by role"                           ON public.cash_ledger;
DROP POLICY IF EXISTS "Allow insert cash ledger by role"                         ON public.cash_ledger;
DROP POLICY IF EXISTS "Allow admin and manager to update cash ledger"            ON public.cash_ledger;

CREATE POLICY "Allow read cash ledger by role"
    ON public.cash_ledger FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER'));
CREATE POLICY "Allow insert cash ledger by role"
    ON public.cash_ledger FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );
CREATE POLICY "Allow admin and manager to update cash ledger"
    ON public.cash_ledger FOR UPDATE TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- USERS
DROP POLICY IF EXISTS "Allow authenticated users full access on users"            ON public.users;
DROP POLICY IF EXISTS "Allow authenticated to read users"                        ON public.users;
DROP POLICY IF EXISTS "Allow admin and manager to update users"                  ON public.users;
DROP POLICY IF EXISTS "Allow admin to insert or delete users"                    ON public.users;

CREATE POLICY "Allow authenticated to read users"
    ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin and manager to update users"
    ON public.users FOR UPDATE TO authenticated
    USING (
        public.current_user_role() = 'ADMIN'
        OR (public.current_user_role() = 'MANAGER' AND role IN ('SELLER', 'VIEWER'))
    )
    WITH CHECK (
        public.current_user_role() = 'ADMIN'
        OR (public.current_user_role() = 'MANAGER' AND role IN ('SELLER', 'VIEWER'))
    );
CREATE POLICY "Allow admin to insert or delete users"
    ON public.users FOR ALL TO authenticated
    USING    (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');

-- SUPPLIERS
DROP POLICY IF EXISTS "Allow authenticated users full access on suppliers"        ON public.suppliers;
DROP POLICY IF EXISTS "Allow staff to read suppliers"                             ON public.suppliers;
DROP POLICY IF EXISTS "Allow admin and manager to manage suppliers"               ON public.suppliers;

CREATE POLICY "Allow staff to read suppliers"
    ON public.suppliers FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER'));
CREATE POLICY "Allow admin and manager to manage suppliers"
    ON public.suppliers FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- INVOICES
DROP POLICY IF EXISTS "Allow authenticated users full access on invoices"         ON public.invoices;
DROP POLICY IF EXISTS "Allow invoice access to authorized roles"                 ON public.invoices;

CREATE POLICY "Allow invoice access to authorized roles"
    ON public.invoices FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- PAYMENT_METHODS
DROP POLICY IF EXISTS "Allow authenticated users full access on payment_methods"  ON public.payment_methods;
DROP POLICY IF EXISTS "Allow authenticated to read payment methods"              ON public.payment_methods;
DROP POLICY IF EXISTS "Allow admin and manager to manage payment methods"         ON public.payment_methods;

CREATE POLICY "Allow authenticated to read payment methods"
    ON public.payment_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin and manager to manage payment methods"
    ON public.payment_methods FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- AUDIT_LOGS
DROP POLICY IF EXISTS "Allow authenticated users full access on audit_logs"       ON public.audit_logs;
DROP POLICY IF EXISTS "Allow admin and manager to read audit_logs"                ON public.audit_logs;
DROP POLICY IF EXISTS "Allow verified insertion of audit_logs"                    ON public.audit_logs;

CREATE POLICY "Allow admin and manager to read audit_logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER'));
CREATE POLICY "Allow verified insertion of audit_logs"
    ON public.audit_logs FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());


-- ============================================================
-- PUBLICACION REALTIME (sincronizacion multiusuario)
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
-- SINCRONIZACION auth.users -> public.users
-- Evita sesiones validas sin perfil en la tabla users de la app
-- ============================================================
-- ⚠️ SECURITY (H1): NUNCA leer 'role' de raw_user_meta_data.
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
        -- NO actualizar 'role': preservar el rol asignado por ADMIN.
        updated_at = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_public_user_from_auth ON auth.users;
DROP TRIGGER IF EXISTS tr_sync_public_user_from_auth  ON auth.users;

CREATE TRIGGER trg_sync_public_user_from_auth
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_public_user_from_auth();

-- Backfill con VIEWER por defecto (no leer role de metadata)
INSERT INTO public.users (id, email, full_name, role, is_active, created_at, updated_at)
SELECT
    au.id,
    coalesce(au.email, ''),
    coalesce(
        nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
        split_part(coalesce(au.email, ''), '@', 1),
        'Usuario'
    ) AS full_name,
    'VIEWER' AS role,
    true,
    now(),
    now()
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL;


-- ============================================================
-- FUNCIONES (RPC)
-- ============================================================

-- Eliminar versiones antiguas con firmas distintas
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb, numeric);
DROP FUNCTION IF EXISTS public.process_sale_atomic(uuid, text, numeric, text, numeric, numeric, boolean, uuid, text, jsonb, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.process_sale_atomic(
    p_client_id        uuid,
    p_payment_method   text,
    p_paid_amount_usd  numeric,
    p_status           text,
    p_total_usd        numeric,
    p_total_ved        numeric,
    p_is_credit        boolean,
    p_user_id          uuid,
    p_seller_name      text,
    p_items            jsonb,
    p_discount_pct     numeric DEFAULT 0,
    p_tasa_bcv         numeric DEFAULT NULL,
    p_tasa_cop         numeric DEFAULT NULL
)
RETURNS TABLE (sale_id uuid, local_id integer, sale_date timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale_id            uuid;
    v_local_id           integer;
    v_sale_date          timestamptz := now();
    v_stock              numeric;
    v_sku                text;
    v_pname              text;
    r_stock              RECORD;
    elem                 jsonb;
    v_method_currency    text := 'USD';
    v_effective_tasa_bcv numeric;
    v_effective_tasa_cop numeric;
    v_paid_bs            numeric;
    v_paid_cop           numeric;
    v_credit_limit       numeric;
    v_credit_balance     numeric;
    v_new_debt           numeric;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito de venta no puede estar vacío';
    END IF;

    -- H5: Validación de límite de crédito
    -- REGLA DE NEGOCIO: credit_limit = 0 significa $0.00 de límite (no puede fiar).
    -- Toda venta a crédito requiere un cliente asignado y no puede superar credit_limit.
    IF coalesce(p_is_credit, false) = true THEN
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'VENTA_CREDITO_SIN_CLIENTE:Venta a crédito requiere un cliente registrado';
        END IF;

        SELECT coalesce(credit_limit, 0), coalesce(credit_balance, 0)
        INTO v_credit_limit, v_credit_balance
        FROM public.clients WHERE id = p_client_id FOR SHARE;

        v_new_debt := GREATEST(coalesce(p_total_usd, 0) - coalesce(p_paid_amount_usd, 0), 0);
        IF (v_credit_balance + v_new_debt) > v_credit_limit THEN
            RAISE EXCEPTION 'CREDITO_INSUFICIENTE:%:limite=%,deuda_actual=%,nueva_deuda=%',
                p_client_id, v_credit_limit, v_credit_balance, v_new_debt;
        END IF;
    END IF;

    INSERT INTO public.sales (
        client_id, total_usd, total_ved, payment_method, status,
        paid_amount_usd, is_credit, discount_pct, user_id, seller_name, date
    ) VALUES (
        p_client_id, p_total_usd, coalesce(p_total_ved, 0),
        p_payment_method, p_status, coalesce(p_paid_amount_usd, 0),
        coalesce(p_is_credit, false), coalesce(p_discount_pct, 0),
        p_user_id, p_seller_name, v_sale_date
    )
    RETURNING id, sales.local_id, sales.date INTO v_sale_id, v_local_id, v_sale_date;

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
            RAISE EXCEPTION 'Cantidad inválida para producto %: %', r_stock.product_id, r_stock.total_quantity;
        END IF;

        SELECT stock, sku, name INTO v_stock, v_sku, v_pname
        FROM public.products WHERE id = r_stock.product_id FOR UPDATE;

        IF v_stock IS NULL THEN
            RAISE EXCEPTION 'Producto no encontrado: %', r_stock.product_id;
        END IF;
        IF v_stock < r_stock.total_quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%:disponible=%,solicitado=%',
                r_stock.product_id, v_stock, r_stock.total_quantity;
        END IF;

        UPDATE public.products SET stock = stock - r_stock.total_quantity WHERE id = r_stock.product_id;

        INSERT INTO public.stock_movements (
            product_id, sku, product_name, type, qty_before, qty_change, qty_after,
            reference_id, reason, created_by, seller_name, created_at
        ) VALUES (
            r_stock.product_id, v_sku, v_pname, 'SALE', v_stock, -r_stock.total_quantity,
            v_stock - r_stock.total_quantity, v_sale_id::text,
            'Venta registrada #' || coalesce(v_local_id::text, substring(v_sale_id::text from 1 for 8)),
            p_user_id, p_seller_name, v_sale_date
        );
    END LOOP;

    FOR elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.sale_items (
            sale_id, product_id, sku, product_name_snapshot,
            quantity, unit_price_usd, cost_unit_usd, discount_pct
        ) VALUES (
            v_sale_id, (elem->>'product_id')::uuid,
            coalesce(elem->>'sku', ''),
            coalesce(elem->>'product_name', elem->>'name', 'Producto'),
            (elem->>'quantity')::numeric,
            (elem->>'unit_price_usd')::numeric,
            coalesce((elem->>'cost_unit_usd')::numeric, 0),
            coalesce((elem->>'discount_pct')::numeric, p_discount_pct, 0)
        );
    END LOOP;

    IF p_paid_amount_usd > 0 THEN
        SELECT coalesce(currency, 'USD') INTO v_method_currency
        FROM public.payment_methods WHERE name = p_payment_method LIMIT 1;

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

        v_paid_bs  := CASE WHEN v_method_currency = 'BS'
                           THEN round(p_paid_amount_usd * coalesce(v_effective_tasa_bcv, 1), 2) ELSE NULL END;
        v_paid_cop := CASE WHEN v_method_currency = 'COP'
                           THEN round(p_paid_amount_usd * coalesce(v_effective_tasa_cop, 1)) ELSE NULL END;

        INSERT INTO public.payments (sale_id, amount_usd, amount_cop, method, note)
        VALUES (v_sale_id, p_paid_amount_usd, coalesce(v_paid_cop, 0), p_payment_method, 'Pago Inicial');

        INSERT INTO public.cash_ledger (
            date, direction, kind, amount_usd, amount_bs, amount_cop,
            currency, payment_method, description, reference_type, reference_id,
            user_id, seller_name, created_at
        ) VALUES (
            v_sale_date::text, 'IN', 'VENTA_COBRADA', p_paid_amount_usd, v_paid_bs, v_paid_cop,
            coalesce(v_method_currency, 'USD'), p_payment_method,
            'Cobro inicial de venta #' || coalesce(v_local_id::text, substring(v_sale_id::text from 1 for 8)),
            'sale-payment', v_sale_id::text || ':initial', p_user_id, p_seller_name, v_sale_date
        )
        ON CONFLICT (reference_type, reference_id) DO NOTHING;
    END IF;

    RETURN QUERY SELECT v_sale_id, v_local_id, v_sale_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(p_product_id uuid, p_delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stock    numeric;
    v_new_stock numeric;
BEGIN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'ID de producto no puede ser nulo'; END IF;
    SELECT stock INTO v_stock FROM public.products WHERE id = p_product_id FOR UPDATE;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'Producto no encontrado: %', p_product_id; END IF;
    IF coalesce(p_delta, 0) = 0 THEN RETURN v_stock; END IF;
    v_new_stock := v_stock + p_delta;
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'STOCK_NEGATIVO:%:actual=%,delta=%', p_product_id, v_stock, p_delta;
    END IF;
    UPDATE public.products SET stock = v_new_stock WHERE id = p_product_id;
    RETURN v_new_stock;
END;
$$;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.admin_update_user_password(target_user_id UUID, new_password TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF auth.uid() != target_user_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN') THEN
      RAISE EXCEPTION 'Permiso denegado. Solo administradores pueden cambiar contraseñas de otros usuarios.';
    END IF;
  END IF;
  UPDATE auth.users SET encrypted_password = crypt(new_password, gen_salt('bf')) WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_email(target_user_id UUID, new_email TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN') THEN
    IF auth.uid() != target_user_id THEN
      RAISE EXCEPTION 'Permiso denegado. Solo administradores pueden cambiar correos electrónicos de otros usuarios.';
    END IF;
  END IF;
  UPDATE auth.users SET email = new_email, email_confirmed_at = now() WHERE id = target_user_id;
  UPDATE public.users SET email = new_email WHERE id = target_user_id;
END;
$$;


-- ====================================================================
-- FIN DEL RESET — Todo en Ruedas v1.0 (Sprint A.4)
-- ====================================================================
