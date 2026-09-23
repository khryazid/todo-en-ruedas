-- ====================================================================
-- MIGRACIÓN DBA: INTEGRIDAD TRANSACCIONAL, CONCURRENCIA, KARDEX E ÍNDICES
-- Archivo: supabase/migrations/20260922_dba_atomic_sales_and_constraints.sql
-- Dominio: Lead Database Administrator & PostgreSQL Architect
-- Hallazgos abordados: SEC-DBA-001, SEC-DBA-002, SEC-DBA-003, SEC-DBA-004, SEC-DBA-005, SEC-DBA-006
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1. BLINDAJE DE INTEGRIDAD FÍSICA Y CONSTRAINTS (SEC-DBA-001, SEC-DBA-003)
-- --------------------------------------------------------------------

-- 1.1 Impedir stock negativo a nivel de motor relacional
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_non_negative'
    ) THEN
        -- Sanitizar inconsistencias previas antes de aplicar la restricción si existiesen
        UPDATE public.products SET stock = 0 WHERE stock < 0;
        ALTER TABLE public.products
            ADD CONSTRAINT chk_products_stock_non_negative CHECK (stock >= 0);
    END IF;
END $$;

-- 1.2 Impedir cantidades menores o iguales a cero en ítems de venta
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_quantity_positive'
    ) THEN
        ALTER TABLE public.sale_items
            ADD CONSTRAINT chk_sale_items_quantity_positive CHECK (quantity > 0);
    END IF;
END $$;

-- 1.3 Unicidad estricta para números de Nota de Crédito y Local ID
CREATE UNIQUE INDEX IF NOT EXISTS uq_returns_nc_number
    ON public.returns(nc_number)
    WHERE nc_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_local_id
    ON public.sales(local_id)
    WHERE local_id IS NOT NULL;

-- 1.4 Secuencias y valores por defecto canónicos para correlativos
CREATE SEQUENCE IF NOT EXISTS public.nc_number_seq START 1;
ALTER TABLE public.returns 
    ALTER COLUMN nc_number SET DEFAULT ('NC-' || lpad(nextval('public.nc_number_seq')::text, 4, '0'));

CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START 1;
ALTER TABLE public.quotes 
    ALTER COLUMN number SET DEFAULT ('COT-' || lpad(nextval('public.quote_number_seq')::text, 4, '0'));

-- 1.5 Columnas de Arqueo y Cierre Físico en cash_closes (Consistencia con FIN-CLS-002 / Arqueo)
ALTER TABLE public.cash_closes
    ADD COLUMN IF NOT EXISTS declared_usd NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS declared_bs NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS declared_cop NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shortage_usd NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS overage_usd NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notes TEXT;


-- --------------------------------------------------------------------
-- 2. ESTRATEGIA DE ÍNDICES: CLAVES FORÁNEAS Y CONSULTAS CRÍTICAS (SEC-DBA-005, SEC-DBA-006)
-- --------------------------------------------------------------------

-- 2.1 Claves Foráneas Huérfanas (Evita Sequential Scans y bloqueos de tabla ShareRowExclusiveLock)
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id 
    ON public.sale_items(product_id);

CREATE INDEX IF NOT EXISTS idx_quotes_client_id 
    ON public.quotes(client_id);

CREATE INDEX IF NOT EXISTS idx_sales_user_id 
    ON public.sales(user_id);

CREATE INDEX IF NOT EXISTS idx_returns_user_id 
    ON public.returns(user_id);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_user_id 
    ON public.cash_ledger(user_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by 
    ON public.stock_movements(created_by);

-- 2.2 Índices Compuestos para Reportes, Kardex, Filtros y Caja
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created 
    ON public.stock_movements(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_created_at_desc 
    ON public.cash_ledger(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_status_date_desc 
    ON public.sales(status, date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_method_created 
    ON public.payments(method, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_date_issue 
    ON public.invoices(date_issue);

CREATE INDEX IF NOT EXISTS idx_invoices_date_due 
    ON public.invoices(date_due);


-- --------------------------------------------------------------------
-- 3. REFACTORIZACIÓN ATÓMICA DE VENTAS (SEC-DBA-001, SEC-DBA-002)
-- Erradica Deadlocks (40P01) mediante ordenamiento determinista por UUID
-- Integra Kardex (stock_movements) y Caja (cash_ledger) dentro de la transacción ACID
-- Resuelve cálculo contable de Bolívares y Pesos Colombianos (COP) en cobros parciales/crédito
-- --------------------------------------------------------------------

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
BEGIN
    -- Validación de precondiciones
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito de venta no puede estar vacío';
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


-- --------------------------------------------------------------------
-- 4. FUNCIÓN ATÓMICA DE DEVOLUCIONES (SEC-DBA-003, SEC-DBA-004)
-- Erradica Deadlocks cruzados entre ventas y devoluciones mediante jerarquía de bloqueos
-- Garantiza consecutivo de Nota de Crédito en la misma transacción DML
-- --------------------------------------------------------------------

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


-- --------------------------------------------------------------------
-- 5. CIERRE DIARIO Z TRANSACCIONAL SEGURO (FIN-CLS-002)
-- Integra bloqueo pesimista en settings para eliminar ventas huérfanas de turno
-- --------------------------------------------------------------------

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


-- --------------------------------------------------------------------
-- 6. RPC DE AJUSTE ATÓMICO DE STOCK (Blindaje de argumentos y estado)
-- --------------------------------------------------------------------

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

COMMIT;
