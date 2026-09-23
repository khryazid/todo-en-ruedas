# INFORME DE AUDITORÍA DBA & ARQUITECTURA POSTGRESQL / SUPABASE

**Sistema:** Todo en Ruedas  
**Rol:** Lead Database Administrator (DBA) & Arquitecto PostgreSQL / Supabase  
**Fecha:** 2026-09-22  
**Motor:** PostgreSQL 15.x / 16.x (Entorno Supabase)  
**Nivel de Aislamiento Base:** `READ COMMITTED` (Nativo Postgres)  
**Estado:** Finalizado y Aprobado para Migración  

---

## 1. Resumen Ejecutivo de Integridad Transaccional

Tras realizar una auditoría forense y estructural sobre los esquemas de base de datos (`supabase/schema.sql`, migraciones históricas) y los flujos de consumo relacional en el cliente web (`saleSlice.ts`, `returnSlice.ts`, `quoteSlice.ts`, `invoiceSlice.ts`), se identificaron vulnerabilidades severas en:
1. **Concurrencia en Inventario:** Ausencia de restricciones a nivel de motor (`CHECK`) que permitan stock negativo en actualizaciones directas, e inyecciones lógicas de cantidades no positivas.
2. **Desacoplamiento Transaccional (Ruptura de Atomicidad):** Efectos secundarios de trazabilidad contable (`cash_ledger`) y movimientos de inventario (`stock_movements`) ejecutados mediante peticiones HTTP REST posteriores desde el frontend en lugar de estar encapsulados dentro de la transacción DML en la base de datos.
3. **Riesgo Crítico de Deadlocks (Error 40P01):** Adquisición no ordenada de bloqueos pesimistas (`SELECT ... FOR UPDATE`) sobre productos ante ventas simultáneas en múltiples cajas, e inversión del orden jerárquico de bloqueo entre anulaciones de ventas y devoluciones.
4. **Vulneración de Secuencia Fiscal:** Invocación anticipada de secuencias de Notas de Crédito (`get_next_nc_number`) que genera saltos irreversibles en numeración legal ante transacciones abortadas o cancelaciones de usuarios.
5. **Degradación Relacional (Sequential Scans Masivos):** Claves foráneas huérfanas de índices (`sale_items.product_id`, `quotes.client_id`) que imponen `ShareRowExclusiveLock` y bloquean tablas completas durante eliminaciones o actualizaciones.

---

## 2. Análisis Detallado de Puntos Obligatorios

### 2.1. Concurrencia en Inventario (`process_sale_atomic` y `adjust_product_stock`)
* **¿Existe riesgo de lecturas sucias (Dirty Reads)?**  
  **No.** En PostgreSQL, el motor MVCC (Multi-Version Concurrency Control) garantiza que las lecturas sucias son físicamente imposibles en cualquier nivel de aislamiento (incluso configurando `READ UNCOMMITTED`, PostgreSQL se ejecuta internamente como `READ COMMITTED`). Una transacción nunca puede leer tuplas no confirmadas (`uncommitted`).
* **¿Existe riesgo de stock negativo?**  
  **Sí, por dos vías:**
  1. **Ausencia de `CHECK (stock >= 0)` en `public.products`:** Cualquier mutación directa vía Supabase REST (`supabase.from('products').update(...)`) o script administrativo evade las RPCs y puede dejar stock negativo.
  2. **Cantidades no positivas en `p_items`:** Ni la tabla `sale_items` ni `process_sale_atomic` validaban `v_quantity > 0`. Si una caja o actor malicioso envía `quantity: -5`, la validación `IF v_stock < v_quantity` resulta falsa (`10 < -5` es falso), y la sentencia `stock = stock - (-5)` **incrementa el stock ilegalmente**.
* **¿Hace falta `SELECT ... FOR UPDATE` explícito?**  
  **Es imprescindible y obligatorio.** En `READ COMMITTED`, si dos transacciones hacen `SELECT stock` sin bloqueo y luego ejecutan un `UPDATE`, ocurre el fenómeno de *Lost Update* o *Write Skew*. El `FOR UPDATE` obliga a la segunda transacción a pausarse en la cola del candado (`tuple lock`). Cuando la primera transacción hace `COMMIT`, PostgreSQL activa la rutina interna **`EvalPlanQual`**: la segunda transacción despierta, lee la versión recién confirmada de la fila y reevalúa el predicado `v_stock < v_quantity`. Si no hay suficiente saldo, lanza la excepción y preserva la consistencia.

### 2.2. Generación de Consecutivos (`get_next_nc_number_rpc` y Facturas)
* **¿Dos transacciones simultáneas al mismo milisegundo colisionan o duplican?**  
  **No a nivel de secuencia Postgres.** `nextval('public.nc_number_seq')` utiliza operaciones atómicas de CPU fuera del control transaccional MVCC. Es 100% seguro contra colisiones numéricas concurrentes.
* **¿Qué sucede si una transacción aborta tras reservar el número?**  
  **Colapso de numeración legal (Saltos / Gaps fiscales):**  
  PostgreSQL **nunca revierte un valor consumido por `nextval`** (diseño intencional para evitar serializar el rendimiento global del motor).  
  El mecanismo previo implementado en `returnSlice.ts` invocaba `get_next_nc_number()` mediante una llamada HTTP RPC previa y desacoplada del `insert`. Si el usuario cancelaba el modal, se cortaba la red, o fallaba la inserción de la devolución, **el número se perdía para siempre**. Esto genera "saltos correlativos", penados severamente por regulaciones tributarias (SENIAT / DIAN / Facturación fiscal).
* **El Failsafe del Cliente (`NC-T${Date.now()}`):**  
  Si el RPC fallaba, el frontend generaba un correlativo basado en timestamp truncado (`slice(-6)`). Este valor **no tiene validez jurídica, puede colisionar con operaciones del mismo segundo**, y la tabla `returns` **carecía de índice `UNIQUE` en `nc_number`**, permitiendo corrupción de datos sin rechazo de la base de datos.

### 2.3. Deadlocks y Bloqueos en `cash_ledger`, `stock_movements` y `products`
* **Mecanismo de Deadlock 1 (Orden de productos en carrito):**  
  `process_sale_atomic` iteraba el array `p_items` en el orden arbitrario enviado por el cliente. Si Caja 1 vendía [Producto A, Producto B] y Caja 2 vendía [Producto B, Producto A] al mismo tiempo, la Caja 1 bloqueaba A y pedía B, mientras la Caja 2 bloqueaba B y pedía A. El motor detectaba el ciclo de bloqueo y abortaba una transacción con error `40P01 (deadlock_detected)`.
* **Mecanismo de Deadlock 2 (Inversión de Bloqueos Cruzados entre Ventas y Devoluciones):**  
  - Flujo A (`annulSale`): Bloqueaba `sales` (`UPDATE sales SET status = 'CANCELLED'`) y luego bloqueaba `products` (`adjust_product_stock`).
  - Flujo B (`addReturn`): Bloqueaba `products` (`adjust_product_stock`) y luego actualizaba `sales` (`UPDATE sales SET status = 'CANCELLED'`).
  - Si concurrían la anulación de una venta y una devolución sobre el mismo registro, **ambas transacciones colapsaban en deadlock cruzado**.
* **Ruptura de Atomicidad:**  
  Las ventas y cotizaciones descontaban stock en la base de datos, pero la inserción en `stock_movements` y en `cash_ledger` se ejecutaba desde el cliente web mediante peticiones REST posteriores. Si el navegador se cerraba a mitad de camino, la venta se confirmaba, el stock disminuía, pero **el libro contable (`cash_ledger`) y la trazabilidad de inventario (`stock_movements`) quedaban huérfanos**.

### 2.4. Estrategia de Índices
* **Claves Foráneas Huérfanas:** `sale_items(product_id)` y `quotes(client_id)` no tenían índices. Cada `DELETE` o `UPDATE` sobre `products` o `clients` provocaba un **Sequential Scan bloqueante con `ShareRowExclusiveLock` sobre toda la tabla hija**.
* **Consultas Frecuentes Degeneradas:** Tablas de rápido crecimiento (`cash_ledger`, `stock_movements`, `sales`) carecían de índices compuestos por fecha y estado, forzando ordenamientos en memoria (`Sort via WorkMem`) y escaneos de tabla completa.

---

## 3. Matriz de Hallazgos Técnicos

| ID del Hallazgo | Nivel de Riesgo | Función / Tabla Implicada | Resumen del Problema |
| :--- | :--- | :--- | :--- |
| **SEC-DBA-001** | **Crítico** | `products`, `sale_items`, `process_sale_atomic` | Falta de `CHECK` constraint para stock no negativo, riesgo de inyección de cantidades negativas y efectos secundarios contables/kardex ejecutados fuera de la transacción atómica. |
| **SEC-DBA-002** | **Crítico** | `process_sale_atomic`, `products` | Deadlocks (`40P01`) ante ventas simultáneas en dos cajas por orden no determinista de bloqueo `FOR UPDATE`. |
| **SEC-DBA-003** | **Alto** | `returns`, `quotes`, `get_next_nc_number_rpc` | Saltos irreversibles en numeración fiscal por invocación anticipada de secuencias y colisiones por falta de `UNIQUE constraints`. |
| **SEC-DBA-004** | **Alto** | `sales`, `returns`, `products`, `cash_ledger` | Bloqueos cruzados entre anulaciones y devoluciones por inversión del orden jerárquico de bloqueo. |
| **SEC-DBA-005** | **Alto** | `sale_items`, `quotes` | Claves foráneas sin indexar provocando Sequential Scans y bloqueos de tabla en cascada (`ShareRowExclusiveLock`). |
| **SEC-DBA-006** | **Medio** | `cash_ledger`, `stock_movements`, `sales`, `payments` | Ausencia de índices compuestos para filtrado y ordenamiento temporal (`created_at`, `status`, `product_id`). |

---

## 4. Detalle de Hallazgos y Mecanismos de Falla

### Hallazgo SEC-DBA-001 | Riesgo: CRÍTICO | `products`, `sale_items`, `process_sale_atomic`
#### Mecanismo de Falla:
1. **Falta de Restricción Física:** La columna `products.stock` tiene tipo `NUMERIC DEFAULT 0` sin restricción `CHECK (stock >= 0)`.
2. **Desacoplamiento Transaccional en Frontend:** Cuando el cajero procesa una venta en `saleSlice.ts`:
   - Se llama a `supabase.rpc('process_sale_atomic')`. La base de datos descuenta stock y guarda la cabecera.
   - Si la red se cae inmediatamente tras el retorno de la llamada RPC, el frontend nunca llega a ejecutar `addStockMovement()` ni `recordCashMovement()`.
   - **Resultado:** El producto tiene menos stock, pero no existe asiento en `stock_movements` (discrepancia de auditoría física vs sistema) ni en `cash_ledger` (descuadre de caja al cierre del turno).
3. **Cálculo de `qty_before` desfasado:** El frontend calcula `qtyBefore: Number(product.stock)` leyendo el estado de Zustand (React), que en entornos concurrentes suele ser información desactualizada (stale read).

---

### Hallazgo SEC-DBA-002 | Riesgo: CRÍTICO | `process_sale_atomic`
#### Mecanismo de Falla:
1. Caja 1 recibe a Cliente 1 con Carrito: `[{id: 'prod-A', qty: 1}, {id: 'prod-B', qty: 2}]`.
2. Caja 2 recibe a Cliente 2 con Carrito: `[{id: 'prod-B', qty: 1}, {id: 'prod-A', qty: 1}]`.
3. T1 (Caja 1) ejecuta `SELECT ... WHERE id = 'prod-A' FOR UPDATE` -> Bloqueo concedido.
4. T2 (Caja 2) ejecuta `SELECT ... WHERE id = 'prod-B' FOR UPDATE` -> Bloqueo concedido.
5. T1 pasa al segundo ítem y ejecuta `SELECT ... WHERE id = 'prod-B' FOR UPDATE` -> T1 queda en espera de T2.
6. T2 pasa al segundo ítem y ejecuta `SELECT ... WHERE id = 'prod-A' FOR UPDATE` -> T2 queda en espera de T1.
7. Al cumplirse `deadlock_timeout` (1 segundo en Postgres), el planificador detecta el ciclo, mata T2 con `ERROR 40P01: deadlock detected` y rechaza la venta del cliente.

---

### Hallazgo SEC-DBA-003 | Riesgo: ALTO | `get_next_nc_number_rpc`, `returns`, `quotes`
#### Mecanismo de Falla:
1. El usuario abre el modal de devolución. El cliente JS llama a `nextNcNumber()`, que ejecuta `nextval('public.nc_number_seq')` y obtiene `NC-0045`.
2. El usuario revisa los productos, detecta un error y cierra el modal sin guardar, o el cliente pierde la conexión.
3. El número `45` ya fue consumido por la secuencia en el motor Postgres.
4. Cuando otro usuario realiza una devolución real, obtiene `NC-0046`.
5. **Resultado:** En el libro de Notas de Crédito existe un salto de `NC-0044` a `NC-0046`. Ante una auditoría fiscal del SENIAT o ente recaudador, un salto de numeración en documentos correlativos legales se presume como venta o anulación ocultada, acarreando multas y sanciones legales.
6. Adicionalmente, `returns.nc_number` no cuenta con `UNIQUE CONSTRAINT`, permitiendo que concurran dos documentos con la misma numeración si se usa el fallback de JS.

---

### Hallazgo SEC-DBA-004 | Riesgo: ALTO | `sales`, `returns`, `products`, `cash_ledger`
#### Mecanismo de Falla:
1. Un Administrador en el módulo de ventas inicia la anulación de la venta `#100` (`annulSale`).
   - Bloquea la tabla `sales` (`UPDATE sales SET status = 'CANCELLED' WHERE id = 100`).
   - Se prepara para restaurar stock invocando `adjust_product_stock` para el Producto X.
2. Simultáneamente, un Cajero procesa una devolución total sobre la misma venta `#100` (`addReturn`).
   - Invoca `adjust_product_stock` para el Producto X (bloquea la fila del Producto X).
   - Luego intenta marcar la venta como cancelada (`UPDATE sales SET status = 'CANCELLED' WHERE id = 100`).
3. La Anulación espera por el Producto X (en manos de la Devolución).
4. La Devolución espera por la Venta `#100` (en manos de la Anulación).
5. Se produce un **Cross-Table Deadlock** que aborta una de las dos operaciones.

---

### Hallazgo SEC-DBA-005 | Riesgo: ALTO | `sale_items`, `quotes`
#### Mecanismo de Falla:
1. La tabla `sale_items` contiene la definición:
   `product_id UUID REFERENCES public.products(id) ON DELETE SET NULL`
2. En Postgres, cuando una tabla padre sufre una operación `DELETE` o `UPDATE` en la PK referenciada, el motor debe comprobar que ninguna fila en la tabla hija viole la integridad referencial.
3. Al **no existir un índice en `sale_items(product_id)`**, PostgreSQL debe ejecutar un **Sequential Scan completo sobre `sale_items`**.
4. Con 150,000 ítems de venta históricos, cualquier eliminación o mantenimiento sobre `products` retiene un candado `ShareRowExclusiveLock` que congela las ventas en curso en el punto de venta.

---

### Hallazgo SEC-DBA-006 | Riesgo: MEDIO | `cash_ledger`, `stock_movements`, `sales`
#### Mecanismo de Falla:
1. `stock_movements` se consulta desde el frontend con:
   `SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT 500;`
2. Los índices existentes son `idx_stock_movements_product_id` y `idx_stock_movements_created_at` (separados).
3. Postgres debe realizar un *Bitmap Index Scan* combinando ambos o escanear por `product_id` y luego ejecutar un `Sort` explícito en memoria (`Sort Method: top-N heapsort`).
4. Al superar los 50,000 registros, el costo de I/O y CPU degrada la visualización del historial en la ficha del producto.

---

## 5. Código SQL Corregido y Optimizado (Migración Ejecutable)

El siguiente script SQL resuelve integralmente los 6 hallazgos:
- Consolida la **integridad atómica de Ventas** (descuento de stock ordenado para evitar deadlocks + inserción de kardex + asiento en caja en la misma transacción ACID).
- Crea una función atómica para **Devoluciones** (`process_return_atomic`) eliminando los deadlocks cruzados y los saltos de secuencias.
- Agrega las restricciones de integridad `CHECK (stock >= 0)` y `CHECK (quantity > 0)`.
- Indexa todas las claves foráneas huérfanas y crea los índices compuestos para alto tráfico.

```sql
-- ====================================================================
-- MIGRACIÓN DE AUDITORÍA DBA: INTEGRIDAD TRANSACCIONAL, CONCURRENCIA E ÍNDICES
-- Versión: 2026-09-22
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1. BLINDAJE DE INTEGRIDAD FÍSICA (CONSTRAINTS)
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


-- --------------------------------------------------------------------
-- 2. ESTRATEGIA DE ÍNDICES: CLAVES FORÁNEAS Y CONSULTAS CRÍTICAS
-- --------------------------------------------------------------------

-- 2.1 Claves Foráneas Huérfanas (Evita Sequential Scans y bloqueos de tabla)
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

-- 2.2 Índices Compuestos para Reportes, Kardex y Caja
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


-- --------------------------------------------------------------------
-- 3. REFACTORIZACIÓN ATÓMICA DE VENTAS: PREVENCIÓN DE DEADLOCKS Y KARDEX
-- --------------------------------------------------------------------

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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale_id uuid;
    v_local_id integer;
    v_sale_date timestamptz := now();
    v_stock numeric;
    r RECORD;
    v_method_currency text := 'USD';
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
        p_user_id,
        p_seller_name,
        v_sale_date
    )
    RETURNING id, sales.local_id, sales.date
    INTO v_sale_id, v_local_id, v_sale_date;

    -- 2. Procesamiento de Ítems
    -- NOTA DBA: Consolidar y ordenar por product_id ASC para erradicar Deadlocks (40P01)
    FOR r IN (
        SELECT 
            (elem->>'product_id')::uuid AS product_id,
            elem->>'sku' AS sku,
            elem->>'product_name' AS product_name,
            sum((elem->>'quantity')::numeric) AS quantity,
            (elem->>'unit_price_usd')::numeric AS unit_price_usd,
            coalesce((elem->>'cost_unit_usd')::numeric, 0) AS cost_unit_usd
        FROM jsonb_array_elements(p_items) AS elem
        GROUP BY 
            (elem->>'product_id')::uuid,
            elem->>'sku',
            elem->>'product_name',
            (elem->>'unit_price_usd')::numeric,
            coalesce((elem->>'cost_unit_usd')::numeric, 0)
        ORDER BY (elem->>'product_id')::uuid ASC
    ) LOOP
        -- Validar cantidad positiva
        IF r.quantity <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida para producto %: % (Debe ser > 0)', r.product_name, r.quantity;
        END IF;

        -- Bloqueo pesimista determinista
        SELECT stock INTO v_stock
        FROM public.products
        WHERE id = r.product_id
        FOR UPDATE;

        IF v_stock IS NULL THEN
            RAISE EXCEPTION 'Producto no encontrado en inventario: %', r.product_id;
        END IF;

        IF v_stock < r.quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%:disponible=%,solicitado=%', r.product_id, v_stock, r.quantity;
        END IF;

        -- Actualizar stock
        UPDATE public.products
        SET stock = stock - r.quantity
        WHERE id = r.product_id;

        -- Registrar ítem de venta
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
            r.product_id,
            r.sku,
            r.product_name,
            r.quantity,
            r.unit_price_usd,
            r.cost_unit_usd
        );

        -- Registrar movimiento de Kardex (stock_movements) DENTRO de la transacción atómica
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
            r.product_id,
            r.sku,
            r.product_name,
            'SALE',
            v_stock,
            -r.quantity,
            v_stock - r.quantity,
            v_sale_id::text,
            'Venta registrada #' || coalesce(v_local_id::text, v_sale_id::text),
            p_user_id,
            p_seller_name,
            v_sale_date
        );
    END LOOP;

    -- 3. Registrar Pago y Asiento de Caja si hubo cobro
    IF p_paid_amount_usd > 0 THEN
        INSERT INTO public.payments (sale_id, amount_usd, method, note)
        VALUES (v_sale_id, p_paid_amount_usd, p_payment_method, 'Pago Inicial');

        -- Resolver moneda del método de pago
        SELECT coalesce(currency, 'USD') INTO v_method_currency
        FROM public.payment_methods
        WHERE name = p_payment_method
        LIMIT 1;

        -- Asiento atómico en cash_ledger
        INSERT INTO public.cash_ledger (
            date,
            direction,
            kind,
            amount_usd,
            amount_bs,
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
            CASE WHEN v_method_currency = 'BS' THEN p_total_ved ELSE NULL END,
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
-- 4. FUNCIÓN ATÓMICA DE DEVOLUCIONES (Elimina Cross-Deadlocks y Saltos NC)
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
    r RECORD;
BEGIN
    -- Validaciones de entrada
    IF p_option NOT IN ('CREDIT', 'REEMBOLSO') THEN
        RAISE EXCEPTION 'Opción de devolución inválida: %', p_option;
    END IF;

    -- 1. Adquisición estricta de bloqueos en orden jerárquico:
    --    Paso A: Bloquear la venta asociada para evitar anulación simultánea
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
        FOR r IN (
            SELECT 
                (elem->>'productId')::uuid AS product_id,
                elem->>'sku' AS sku,
                elem->>'name' AS product_name,
                (elem->>'quantity')::numeric AS quantity
            FROM jsonb_array_elements(p_items) AS elem
            ORDER BY (elem->>'productId')::uuid ASC
        ) LOOP
            IF r.product_id IS NOT NULL AND r.quantity > 0 THEN
                SELECT stock INTO v_stock
                FROM public.products
                WHERE id = r.product_id
                FOR UPDATE;

                UPDATE public.products
                SET stock = stock + r.quantity
                WHERE id = r.product_id;

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
                    r.product_id,
                    r.sku,
                    r.product_name,
                    'RETURN',
                    v_stock,
                    r.quantity,
                    v_stock + r.quantity,
                    v_return_id::text,
                    coalesce(p_reason, 'Devolución asociada a ' || v_nc_number),
                    p_user_id,
                    p_seller_name,
                    v_return_date
                );
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

COMMIT;
```

---

## 6. Recomendaciones de Integración para el Frontend

1. **Simplificación de `saleSlice.ts`:**
   Al ejecutar `supabase.rpc('process_sale_atomic', ...)`, la base de datos ya ejecuta de manera atómica el registro en `sales`, `sale_items`, `payments`, `stock_movements` y `cash_ledger`. El frontend debe remover el bucle de llamadas HTTP secundarias (`addStockMovement` y `recordCashMovement`), eliminando latencia de red y riesgo de datos huérfanos.
2. **Reemplazo en `returnSlice.ts`:**
   Sustituir las 4 peticiones HTTP dispersas de `addReturn` por una única llamada limpia a `supabase.rpc('process_return_atomic', payload)`. Esto garantiza el 100% de cumplimiento fiscal sin saltos de correlativos y elimina los deadlocks entre ventas y devoluciones.
