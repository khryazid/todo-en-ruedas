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
                    CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
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

CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_client_id ON public.returns(client_id);
CREATE INDEX IF NOT EXISTS idx_returns_date ON public.returns(date);


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
    currency       TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
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
    currency      TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
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


-- ============================================================
-- 15. MÉTODOS DE PAGO (payment_methods)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    currency   TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
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
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs       ENABLE ROW LEVEL SECURITY;

-- Política general: usuario autenticado tiene acceso total
-- (la app controla RBAC a nivel aplicación)
CREATE POLICY "Allow authenticated users full access on settings"
    ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Permitir lectura a usuarios anónimos estructurando el inicio de sesión
-- Necesario para que useSetupCheck sepa si el sistema ya fue configurado
CREATE POLICY "Allow anon read settings"
    ON public.settings FOR SELECT TO anon USING (true);

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

CREATE POLICY "Allow authenticated users full access on recurring_expenses"
    ON public.recurring_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on cash_closes"
    ON public.cash_closes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access on cash_ledger"
    ON public.cash_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);

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


-- ============================================================
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


-- ============================================================
-- 18. FUNCIONES (RPC)
-- ============================================================
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
    p_items jsonb
)
RETURNS TABLE (sale_id uuid, local_id integer, sale_date timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
    item jsonb;
    v_sale_id uuid;
    v_local_id integer;
    v_sale_date timestamptz;
    v_product_id uuid;
    v_quantity numeric;
    v_stock numeric;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito esta vacio';
    END IF;

    INSERT INTO public.sales (
        client_id,
        total_usd,
        total_ved,
        payment_method,
        status,
        paid_amount_usd,
        is_credit,
        user_id,
        seller_name,
        date
    ) VALUES (
        p_client_id,
        p_total_usd,
        p_total_ved,
        p_payment_method,
        p_status,
        p_paid_amount_usd,
        p_is_credit,
        p_user_id,
        p_seller_name,
        now()
    )
    RETURNING id, sales.local_id, sales.date
    INTO v_sale_id, v_local_id, v_sale_date;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (item ->> 'product_id')::uuid;
        v_quantity := (item ->> 'quantity')::numeric;

        SELECT stock INTO v_stock
        FROM public.products
        WHERE id = v_product_id
        FOR UPDATE;

        IF v_stock IS NULL THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_product_id;
        END IF;

        IF v_stock < v_quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%:disponible=%,solicitado=%', v_product_id, v_stock, v_quantity;
        END IF;

        UPDATE public.products
        SET stock = stock - v_quantity
        WHERE id = v_product_id;

        INSERT INTO public.sale_items (
            sale_id,
            product_id,
            sku,
            product_name_snapshot,
            quantity,
            unit_price_usd,
            cost_unit_usd
        ) VALUES (
            v_sale_id,
            v_product_id,
            item ->> 'sku',
            item ->> 'product_name',
            v_quantity,
            (item ->> 'unit_price_usd')::numeric,
            (item ->> 'cost_unit_usd')::numeric
        );
    END LOOP;

    IF p_paid_amount_usd > 0 THEN
        INSERT INTO public.payments (sale_id, amount_usd, method, note)
        VALUES (v_sale_id, p_paid_amount_usd, p_payment_method, 'Pago Inicial');
    END IF;

    RETURN QUERY
    SELECT v_sale_id, v_local_id, v_sale_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
    p_product_id uuid,
    p_delta numeric
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
    v_stock numeric;
    v_new_stock numeric;
BEGIN
    SELECT stock INTO v_stock
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;

    IF v_stock IS NULL THEN
        RAISE EXCEPTION 'Producto no encontrado: %', p_product_id;
    END IF;

    v_new_stock := v_stock + coalesce(p_delta, 0);

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
