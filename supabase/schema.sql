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
-- 1. CONFIGURACIÓN EMPRESARIAL (settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name          TEXT NOT NULL DEFAULT 'Mi Empresa',
    rif                   TEXT NOT NULL DEFAULT 'J-00000000',
    address               TEXT,
    tasa_bcv              NUMERIC(10,4) DEFAULT 0,
    tasa_monitor          NUMERIC(10,4) DEFAULT 0,
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

-- Fila inicial de configuración (la app espera exactamente 1 fila)
INSERT INTO public.settings (company_name, rif)
VALUES ('Glyph Core', 'J-00000000')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 2. INVENTARIO (products)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
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

CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);


-- ============================================================
-- 3. CLIENTES (clients)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
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


-- ============================================================
-- 5. ITEMS DE VENTA (sale_items)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sale_items (
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

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);


-- ============================================================
-- 6. ABONOS / PAGOS (payments)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id    UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    amount_usd NUMERIC(10,2) NOT NULL,
    method     TEXT NOT NULL,
    note       TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON public.payments(sale_id);


-- ============================================================
-- 7. COTIZACIONES (quotes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quotes (
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

CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);


-- ============================================================
-- 8. DEVOLUCIONES / NOTAS DE CRÉDITO (returns)
-- ============================================================
-- Secuencia para numerar NCs automáticamente: NC-0001, NC-0002...
CREATE SEQUENCE IF NOT EXISTS public.nc_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.returns (
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

CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_client_id ON public.returns(client_id);


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
    quantity     NUMERIC NOT NULL,
    before_stock NUMERIC NOT NULL,
    after_stock  NUMERIC NOT NULL,
    reference_id TEXT,
    note         TEXT,
    user_id      UUID,
    user_name    TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at);


-- ============================================================
-- 10. GASTOS / PLANTILLAS RECURRENTES (expenses)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
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

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);


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
    created_at      TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 12. USUARIOS DE LA APP (users)
-- Espejo de auth.users con rol y estado de la aplicación
-- ============================================================
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
    name         TEXT NOT NULL,
    contact_name TEXT,
    phone        TEXT,
    email        TEXT,
    catalog      JSONB DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);


-- ============================================================
-- 14. FACTURAS DE COMPRA (invoices)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoices (
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

CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON public.invoices(supplier);


-- ============================================================
-- 15. MÉTODOS DE PAGO (payment_methods)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    currency   TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: métodos de pago comunes
INSERT INTO public.payment_methods (name, currency) VALUES
    ('Efectivo USD', 'USD'),
    ('Zelle',        'USD'),
    ('Pago Móvil',   'BS'),
    ('Punto de Venta', 'BS')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 16. AUDITORÍA (audit_logs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Habilitar RLS en todas las tablas
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

-- Política general: usuario autenticado tiene acceso total
-- (la app controla RBAC a nivel aplicación)
CREATE POLICY "Allow authenticated users full access on settings"
    ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on products"
    ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on clients"
    ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on sales"
    ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on sale_items"
    ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on payments"
    ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on quotes"
    ON public.quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on returns"
    ON public.returns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on stock_movements"
    ON public.stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on expenses"
    ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on cash_closes"
    ON public.cash_closes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on users"
    ON public.users FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on suppliers"
    ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on invoices"
    ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on payment_methods"
    ON public.payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on audit_logs"
    ON public.audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ====================================================================
-- FIN DEL SCRIPT — Todo en Ruedas v1.0 (Sprint A.4)
-- ====================================================================
