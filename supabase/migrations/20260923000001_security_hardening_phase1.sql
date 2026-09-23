-- ====================================================================
-- MIGRACIÓN SEGURIDAD FASE 1: Trigger Endurecido + RLS Completa + Credit Limit Backend
-- Archivo: supabase/migrations/20260923000001_security_hardening_phase1.sql
-- Hallazgos: H1 (escalación privilegios), H2 (RLS abierta), H5 (crédito solo cliente)
-- Fecha: 2026-09-23
--
-- INSTRUCCIONES DE APLICACIÓN:
-- Este archivo se aplica sobre una base de datos que ya tiene las migraciones
-- 20260922_appsec_rbac_rls_hardening.sql y 20260922_dba_atomic_sales_and_constraints.sql
-- aplicadas. Si se usa schema.sql limpio, estas correcciones ya estarán incluidas.
-- ====================================================================

BEGIN;

-- ====================================================================
-- SECCIÓN A: TRIGGER ENDURECIDO auth.users -> public.users
-- H1: Escalación de privilegios vía raw_user_meta_data
-- La función anterior leía role de la metadata del JWT, lo que permitía
-- que cualquier usuario anónimo se registrara como ADMIN.
-- La versión corregida SIEMPRE asigna 'VIEWER' al registrarse,
-- sin excepción. El rol debe ser asignado explícitamente por un ADMIN
-- desde el panel de gestión de usuarios (vía UPDATE en public.users).
-- ====================================================================

CREATE OR REPLACE FUNCTION public.sync_public_user_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name text;
BEGIN
    -- ⚠️ SECURITY: NUNCA leer 'role' de raw_user_meta_data.
    -- Un atacante puede llamar signUp({ options: { data: { role: 'ADMIN' } } })
    -- y escalar privilegios si confiamos en esa metadata.
    -- El rol siempre es VIEWER al crear la cuenta.
    -- Solo un ADMIN autenticado puede cambiar el rol desde public.users.
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
        'VIEWER',   -- ← SIEMPRE VIEWER. Nunca leer de raw_user_meta_data.
        true,
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email      = EXCLUDED.email,
        full_name  = EXCLUDED.full_name,
        -- NOTA: NO actualizar 'role' en el ON CONFLICT.
        -- Si el trigger se dispara en UPDATE de email/metadata,
        -- el rol asignado por el ADMIN debe preservarse.
        updated_at = now();

    RETURN NEW;
END;
$$;

-- Eliminar ambas variantes de nombre de trigger que pudieran existir
-- (el agente anterior usó 'tr_sync_public_user_from_auth' sin 'g';
--  el schema.sql usa 'trg_sync_public_user_from_auth' con 'g')
DROP TRIGGER IF EXISTS trg_sync_public_user_from_auth ON auth.users;
DROP TRIGGER IF EXISTS tr_sync_public_user_from_auth  ON auth.users;

-- Crear trigger canónico: solo en INSERT (no en UPDATE de metadata,
-- para no sobrescribir el rol asignado por ADMIN cuando alguien cambia su email)
CREATE TRIGGER trg_sync_public_user_from_auth
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_public_user_from_auth();


-- ====================================================================
-- SECCIÓN B: RLS RESTRICTIVA EN 6 TABLAS PENDIENTES
-- H2: Las tablas payments, quotes, returns, stock_movements,
--     payment_methods y cash_closes seguían con USING(true) / WITH CHECK(true).
--     La migración 20260922_appsec_rbac_rls_hardening.sql cubrió las otras 12.
-- ====================================================================

-- --------------------------------------------------------------------
-- B.1 TABLA PAYMENTS
-- SELLER puede INSERT pagos de sus propias ventas (abonos a crédito).
-- ADMIN/MANAGER acceso total.
-- VIEWER solo lectura.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users full access on payments" ON public.payments;
DROP POLICY IF EXISTS "Allow read payments by role"                        ON public.payments;
DROP POLICY IF EXISTS "Allow insert payments by role"                      ON public.payments;
DROP POLICY IF EXISTS "Allow admin and manager to manage payments"          ON public.payments;

-- Lectura: ADMIN/MANAGER/VIEWER ven todo; SELLER solo pagos de sus ventas
CREATE POLICY "Allow read payments by role" ON public.payments
    FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER')
        OR EXISTS (
            SELECT 1 FROM public.sales s
            WHERE s.id = payments.sale_id
              AND public.current_user_role() = 'SELLER'
              AND s.user_id = auth.uid()
        )
    );

-- INSERT: ADMIN/MANAGER libre; SELLER solo en sus propias ventas
CREATE POLICY "Allow insert payments by role" ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR EXISTS (
            SELECT 1 FROM public.sales s
            WHERE s.id = payments.sale_id
              AND public.current_user_role() = 'SELLER'
              AND s.user_id = auth.uid()
        )
    );

-- UPDATE/DELETE: solo ADMIN/MANAGER (correcciones contables)
CREATE POLICY "Allow admin and manager to manage payments" ON public.payments
    FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));


-- --------------------------------------------------------------------
-- B.2 TABLA QUOTES (cotizaciones)
-- SELLER puede leer e insertar las suyas.
-- ADMIN/MANAGER acceso total.
-- VIEWER solo lectura.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users full access on quotes" ON public.quotes;
DROP POLICY IF EXISTS "Allow read quotes by role"                        ON public.quotes;
DROP POLICY IF EXISTS "Allow insert quotes by role"                      ON public.quotes;
DROP POLICY IF EXISTS "Allow admin and manager to manage quotes"          ON public.quotes;

-- Lectura
CREATE POLICY "Allow read quotes by role" ON public.quotes
    FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );

-- INSERT: ADMIN/MANAGER/SELLER (cotizaciones propias)
CREATE POLICY "Allow insert quotes by role" ON public.quotes
    FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );

-- UPDATE/DELETE: ADMIN/MANAGER total; SELLER solo las suyas (ej. cambiar estado a ACCEPTED)
CREATE POLICY "Allow update quotes by role" ON public.quotes
    FOR UPDATE TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    )
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );

CREATE POLICY "Allow admin and manager to delete quotes" ON public.quotes
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER'));


-- --------------------------------------------------------------------
-- B.3 TABLA RETURNS (devoluciones / notas de crédito)
-- SELLER puede leer e insertar las suyas.
-- ADMIN/MANAGER acceso total.
-- VIEWER solo lectura.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users full access on returns" ON public.returns;
DROP POLICY IF EXISTS "Allow read returns by role"                        ON public.returns;
DROP POLICY IF EXISTS "Allow insert returns by role"                      ON public.returns;
DROP POLICY IF EXISTS "Allow admin and manager to manage returns"          ON public.returns;

-- Lectura
CREATE POLICY "Allow read returns by role" ON public.returns
    FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );

-- INSERT: ADMIN/MANAGER/SELLER (devoluciones de sus propias ventas)
-- NOTA: process_return_atomic es SECURITY DEFINER, así que el INSERT
-- real viene del RPC, no de la app directamente. Esta política protege
-- el acceso directo a la tabla por si alguien intenta bypasear el RPC.
CREATE POLICY "Allow insert returns by role" ON public.returns
    FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('ADMIN', 'MANAGER')
        OR (public.current_user_role() = 'SELLER' AND user_id = auth.uid())
    );

-- UPDATE/DELETE: solo ADMIN/MANAGER
CREATE POLICY "Allow admin and manager to manage returns" ON public.returns
    FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));


-- --------------------------------------------------------------------
-- B.4 TABLA STOCK_MOVEMENTS (kardex)
-- Todos los roles autenticados pueden LEER (kardex es auditoría visible).
-- NADIE puede INSERT/UPDATE/DELETE directamente: todos los movimientos
-- vienen de RPCs SECURITY DEFINER (process_sale_atomic, process_return_atomic,
-- adjust_product_stock). Esta política cierra el acceso directo a la tabla.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users full access on stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Allow read stock movements by role"                        ON public.stock_movements;
DROP POLICY IF EXISTS "Allow admin and manager to manage stock movements"          ON public.stock_movements;

-- Lectura: todos los roles autenticados (el kardex es un registro de auditoría)
CREATE POLICY "Allow read stock movements by role" ON public.stock_movements
    FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER', 'VIEWER'));

-- INSERT solo para ADMIN/MANAGER (ajustes manuales de inventario si fuera necesario)
-- Los RPCs SECURITY DEFINER bypass RLS, así que no necesitan esta política.
CREATE POLICY "Allow admin and manager to insert stock movements" ON public.stock_movements
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- UPDATE/DELETE: solo ADMIN (corrección de errores de kardex)
CREATE POLICY "Allow admin to manage stock movements" ON public.stock_movements
    FOR ALL TO authenticated
    USING    (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');


-- --------------------------------------------------------------------
-- B.5 TABLA PAYMENT_METHODS (métodos de pago)
-- Todos los roles autenticados pueden leer (necesario para el POS).
-- Solo ADMIN/MANAGER pueden crear/modificar/eliminar métodos de pago.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users full access on payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Allow authenticated to read payment methods"              ON public.payment_methods;
DROP POLICY IF EXISTS "Allow admin and manager to manage payment methods"         ON public.payment_methods;

-- Lectura: todos (el POS necesita la lista de métodos para cobrar)
CREATE POLICY "Allow authenticated to read payment methods" ON public.payment_methods
    FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE: solo ADMIN/MANAGER
CREATE POLICY "Allow admin and manager to manage payment methods" ON public.payment_methods
    FOR ALL TO authenticated
    USING    (public.current_user_role() IN ('ADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));


-- --------------------------------------------------------------------
-- B.6 TABLA CASH_CLOSES (cierres de caja)
-- ADMIN/MANAGER/VIEWER pueden leer.
-- ADMIN/MANAGER/SELLER pueden registrar cierres.
-- UPDATE/DELETE solo ADMIN/MANAGER (corrección de errores).
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users full access on cash_closes" ON public.cash_closes;
DROP POLICY IF EXISTS "Allow read cash closes by role"                        ON public.cash_closes;
DROP POLICY IF EXISTS "Allow insert cash closes by role"                      ON public.cash_closes;
DROP POLICY IF EXISTS "Allow admin and manager to manage cash closes"          ON public.cash_closes;

-- Lectura: ADMIN/MANAGER/VIEWER (SELLER no necesita ver histórico de cierres)
CREATE POLICY "Allow read cash closes by role" ON public.cash_closes
    FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER'));

-- INSERT: ADMIN/MANAGER pueden cerrar caja en cualquier momento;
-- execute_safe_daily_close_z es SECURITY DEFINER, así que el RPC bypasea RLS.
-- Esta política protege el INSERT directo a la tabla.
CREATE POLICY "Allow insert cash closes by role" ON public.cash_closes
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- UPDATE/DELETE: solo ADMIN (corrección de cierres erróneos)
CREATE POLICY "Allow admin to manage cash closes" ON public.cash_closes
    FOR ALL TO authenticated
    USING    (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');


-- ====================================================================
-- SECCIÓN C: VALIDACIÓN DE LÍMITE DE CRÉDITO EN process_sale_atomic
-- H5: El límite de crédito solo se validaba en el cliente (POS.tsx).
-- Ahora el backend también lo valida dentro de la transacción ACID.
-- CONVENCIÓN: credit_limit = 0 significa límite de $0 (no se permite crédito).
-- La suma (deuda_actual + nueva_deuda) no puede superar credit_limit.
-- Error lanzado: 'CREDITO_INSUFICIENTE:<client_id>:limite=X,deuda_actual=Y,nueva_deuda=Z'
-- (Mismo patrón que STOCK_INSUFICIENTE para que saleSlice.ts lo parsee consistentemente)
-- ====================================================================

-- Reemplazar process_sale_atomic con versión que incluye validación de crédito
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
    -- Variables para validación de límite de crédito
    v_credit_limit       numeric;
    v_credit_balance     numeric;
    v_new_debt           numeric;
BEGIN
    -- ----------------------------------------------------------------
    -- 0. Validaciones de precondiciones
    -- ----------------------------------------------------------------
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito de venta no puede estar vacío';
    END IF;

    -- ----------------------------------------------------------------
    -- 0B. Validación de límite de crédito (H5)
    -- Solo aplica si la venta es a crédito (p_is_credit = true)
    -- REGLA DE NEGOCIO: credit_limit = 0 significa $0.00 de límite (no puede fiar).
    -- Toda venta a crédito requiere un cliente asignado y no puede superar credit_limit.
    -- ----------------------------------------------------------------
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
        FOR SHARE;  -- Bloqueo compartido: evita race conditions en el límite

        -- Nueva deuda = total de la venta menos lo que se paga ahora
        v_new_debt := GREATEST(coalesce(p_total_usd, 0) - coalesce(p_paid_amount_usd, 0), 0);

        IF (v_credit_balance + v_new_debt) > v_credit_limit THEN
            RAISE EXCEPTION 'CREDITO_INSUFICIENTE:%:limite=%,deuda_actual=%,nueva_deuda=%',
                p_client_id,
                v_credit_limit,
                v_credit_balance,
                v_new_debt;
        END IF;
    END IF;

    -- ----------------------------------------------------------------
    -- 1. Insertar Cabecera de Venta
    -- ----------------------------------------------------------------
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

    -- ----------------------------------------------------------------
    -- 2. Procesamiento y Bloqueo de Stock (ordenado por UUID para evitar deadlocks)
    -- ----------------------------------------------------------------
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
            RAISE EXCEPTION 'Cantidad inválida para producto %: % (Debe ser > 0)',
                r_stock.product_id, r_stock.total_quantity;
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
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%:disponible=%,solicitado=%',
                r_stock.product_id, v_stock, r_stock.total_quantity;
        END IF;

        -- Actualizar stock
        UPDATE public.products
        SET stock = stock - r_stock.total_quantity
        WHERE id = r_stock.product_id;

        -- Registrar Kardex DENTRO de la transacción
        INSERT INTO public.stock_movements (
            product_id, sku, product_name, type,
            qty_before, qty_change, qty_after,
            reference_id, reason, created_by, seller_name, created_at
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

    -- ----------------------------------------------------------------
    -- 3. Registrar ítems individuales de venta (preservando snapshots)
    -- ----------------------------------------------------------------
    FOR elem IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.sale_items (
            sale_id, product_id, sku, product_name_snapshot,
            quantity, unit_price_usd, cost_unit_usd, discount_pct
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

    -- ----------------------------------------------------------------
    -- 4. Registrar Pago y Asiento de Caja si hubo cobro
    -- ----------------------------------------------------------------
    IF p_paid_amount_usd > 0 THEN
        -- Resolver moneda del método de pago
        SELECT coalesce(currency, 'USD') INTO v_method_currency
        FROM public.payment_methods
        WHERE name = p_payment_method
        LIMIT 1;

        -- Resolver tasas efectivas
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

        -- Cálculos contables exactos
        v_paid_bs  := CASE WHEN v_method_currency = 'BS'
                           THEN round(p_paid_amount_usd * coalesce(v_effective_tasa_bcv, 1), 2)
                           ELSE NULL END;
        v_paid_cop := CASE WHEN v_method_currency = 'COP'
                           THEN round(p_paid_amount_usd * coalesce(v_effective_tasa_cop, 1))
                           ELSE NULL END;

        INSERT INTO public.payments (sale_id, amount_usd, amount_cop, method, note)
        VALUES (v_sale_id, p_paid_amount_usd, coalesce(v_paid_cop, 0), p_payment_method, 'Pago Inicial');

        -- Asiento atómico en cash_ledger
        INSERT INTO public.cash_ledger (
            date, direction, kind, amount_usd, amount_bs, amount_cop,
            currency, payment_method, description,
            reference_type, reference_id, user_id, seller_name, created_at
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

COMMIT;

-- ====================================================================
-- FIN DE MIGRACIÓN: 20260923000001_security_hardening_phase1.sql
-- ====================================================================
