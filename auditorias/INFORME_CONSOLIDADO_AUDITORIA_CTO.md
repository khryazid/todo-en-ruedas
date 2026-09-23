# INFORME TÉCNICO VINCULANTE: AUDITORÍA INTEGRAL DE PRODUCCIÓN "TODO EN RUEDAS"

**Fecha de Emisión:** 22 de Septiembre de 2026  
**Autoridad Emisora:** Chief Technology Officer (CTO) & Director de Arquitectura de Software  
**Destinatarios:** Dirección Ejecutiva, Líderes Técnicos y Equipo de Desarrollo  
**Estado:** VINCULANTE Y DE APLICACIÓN OBLIGATORIA  

---

## 1. Matriz de Criticidad Ejecutiva

| ID | Dominio | Severidad | Descripción del Fallo | Esfuerzo de Remediación |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-DBA-001** | DBA / Transaccional | **Crítica** | Ausencia de `CHECK (stock >= 0)`, inyección de cantidades negativas en `process_sale_atomic` y desacoplamiento transaccional (kardex y caja ejecutados desde frontend tras la RPC). | 4 a 6 horas |
| **SEC-DBA-002** | DBA / Concurrencia | **Crítica** | Deadlocks recurrentes (`ERROR 40P01`) ante ventas simultáneas por adquisición desordenada de bloqueos `FOR UPDATE` sobre `products`. | 3 a 4 horas |
| **SEC-APP-001** | AppSec / RLS | **Crítica** | Bypass de RBAC y CRUD irrestricto vía PostgREST en tablas críticas (`suppliers`, `products`, `sales`, `invoices`, `expenses`, `cash_ledger`) por directivas `FOR ALL TO authenticated USING (true) WITH CHECK (true)`. | 6 a 8 horas |
| **FIN-POS-001** | Financiero / POS | **Crítica** | Generación de deuda fraudulenta y distorsión de cuentas por cobrar: `POS.tsx` y `saleSlice.ts` descartan el descuento al registrar la venta, asentando el total bruto en base de datos. | 3 a 4 horas |
| **FIN-CLS-002** | Financiero / Cierre | **Crítica** | Ventas huérfanas de turno en Cierre Z: actualización en cliente de `settings.last_close_date = now()` no atómica que excluye ventas concurrentes en vuelo permanentemente de todo reporte contable. | 6 a 8 horas |
| **FE-POS-001** | Frontend / Concurrencia | **Crítica** | Doble cobro y duplicación de ventas por rebote: botón de cobro en `POSCheckoutModal.tsx` sin inhabilitación síncrona ni idempotencia, duplicando deducciones de stock y asientos de caja. | 3 a 4 horas |
| **SRE-DEP-001** | SRE / Supply Chain | **Crítica** | 29 vulnerabilidades activas en dependencias: `tar <= 7.5.20` (Crítica - Path Traversal / DoS), `vite 7.x` (Alta - Path Traversal en `0.0.0.0`) y `react-router-dom 7.11` (Alta - XSS/RCE). | 4 a 6 horas |
| **SEC-DBA-003** | DBA / Fiscal | **Alta** | Saltos irreversibles en numeración fiscal correlativa de Notas de Crédito (`nc_number_seq`) por invocación previa desacoplada del `INSERT` y ausencia de restricción `UNIQUE`. | 4 a 5 horas |
| **SEC-DBA-004** | DBA / Transaccional | **Alta** | Deadlocks cruzados entre anulaciones (`annulSale`) y devoluciones (`addReturn`) por inversión jerárquica de bloqueos entre `sales` y `products`. | 4 a 6 horas |
| **SEC-DBA-005** | DBA / Rendimiento | **Alta** | Claves foráneas sin indexar (`sale_items.product_id`, `quotes.client_id`) que imponen `ShareRowExclusiveLock` y Sequential Scans completos, congelando operaciones de venta concurrentes. | 2 a 3 horas |
| **SEC-APP-002** | AppSec / Serverless | **Alta** | BFLAC y DoS en Edge Function `process-invoice`: invocable por cualquier rol autenticado (`SELLER`/`VIEWER`), sin límite de tamaño de imagen en base64 ni timeout de ejecución. | 4 a 5 horas |
| **SEC-APP-003** | AppSec / DevSecOps | **Alta** | Fuga de credencial privada `GEMINI_API_KEY` en query string de la URL y reflejo directo de excepciones internas en respuestas HTTP 500 al cliente. | 2 horas |
| **FIN-NUM-003** | Financiero / FX | **Alta** | Fuga financiera por redondeo flotante IEEE 754 y truncamiento prematuro en "Camuflaje TH", cobrando sobreprecios indebidos en USD o perdiendo bolívares al convertir a tasa BCV. | 5 a 6 horas |
| **FIN-DSH-004** | Financiero / Métricas | **Alta** | Descalabro contable de 4,000x en métricas de flujo de caja en `Dashboard.tsx`: operador ternario procesa cobros en COP como si fueran USD. | 1 hora |
| **FIN-ARQ-005** | Financiero / Arqueo | **Alta** | Inexistencia de módulo de arqueo físico: el sistema no captura el conteo de gaveta por denominación de billetes ni computa faltantes o sobrantes por cajero. | 8 a 12 horas |
| **FE-PERF-002** | Frontend / Rendimiento | **Alta** | Polling ciego cada 4s en `POS.tsx` y re-renders descontrolados que causan pérdida de caracteres y congelamiento durante el escaneo con lectores de código de barras. | 3 a 4 horas |
| **FE-CTX-003** | Frontend / UX Caja | **Alta** | Cierre destructivo del modal de cobro ante fallos de red o validación en backend (`else { setIsCheckoutModalOpen(false); }`), destruyendo datos de abonos y métodos ingresados. | 2 a 3 horas |
| **SRE-SEC-002** | SRE / Seguridad Web | **Alta** | Ausencia de cabeceras HTTP de seguridad (HSTS, X-Frame-Options, Permissions-Policy) y CSP con comodines inseguros `https:` y `wss:` en `netlify.toml`. | 3 a 4 horas |
| **SRE-BLD-003** | SRE / Build | **Alta** | Exposición de código fuente en producción por falta de desactivación de sourcemaps y persistencia de `console.log` en el bundle de Vite. | 2 horas |
| **SEC-APP-004** | AppSec / RLS | **Media** | Exposición pública no autenticada de configuración comercial (`settings`) a través de la política `Allow anon read settings`. | 1 hora |
| **SEC-APP-005** | AppSec / Privacidad | **Media** | Exfiltración de PII masiva: descarga irrestricta de bases completas de clientes y proveedores en el arranque (`authSlice.ts`) accesible desde consola por cajeros. | 3 a 4 horas |
| **SEC-APP-006** | AppSec / Auditoría | **Media** | Falsificación de trazabilidad en `audit_logs`: política `WITH CHECK (true)` permite a cajeros insertar eventos haciéndose pasar por Administradores. | 1 hora |
| **FE-PRN-004** | Frontend / Periféricos | **Media** | Bloqueo síncrono del hilo de UI por `window.print()` y fallo silencioso en la generación de reportes Z por bloqueadores de ventanas emergentes. | 2 a 3 horas |
| **SRE-SUP-004** | SRE / Supply Chain | **Media** | Contaminación del bundle y pipeline de producción con `@anthropic-ai/claude-code` en las dependencias de `package.json`. | 30 minutos |
| **SEC-DBA-006** | DBA / Rendimiento | **Media** | Degradación en consultas de reportería y kardex por ausencia de índices compuestos temporales en `cash_ledger`, `sales` y `stock_movements`. | 2 horas |

---

## 2. Showstoppers de Producción (Puntos Críticos Bloqueantes)

### 2.1. Pérdida o Inconsistencia de Inventario bajo Concurrencia
1. **Inyección de Cantidades Negativas y Ausencia de `CHECK (stock >= 0)` (`SEC-DBA-001`):**  
   La columna `products.stock` carece de restricción relacional `CHECK (stock >= 0)`. Además, `process_sale_atomic` no valida que las cantidades solicitadas sean estrictamente mayores a cero (`quantity > 0`). Si una llamada maliciosa o corrupta envía `quantity: -10`, la condición `v_stock < v_quantity` resulta falsa (`5 < -10` es falso) y la sentencia `stock = stock - (-10)` **incrementa el stock físicamente en la base de datos**, alterando el inventario sin sustento.
2. **Deadlocks Recurrentes en Carrito Concurrentes (`SEC-DBA-002`):**  
   `process_sale_atomic` itera los ítems del carrito según el orden arbitrario enviado por el cliente. Si Caja 1 vende `[Prod-A, Prod-B]` y Caja 2 vende `[Prod-B, Prod-A]` simultáneamente, ambas transacciones adquieren candados exclusivos `FOR UPDATE` cruzados. Al expirar `deadlock_timeout`, PostgreSQL aborta una de las dos operaciones con el código `40P01 (deadlock_detected)`, cancelando la venta en el punto de cobro.
3. **Ruptura de Atomicidad en Kardex (`stock_movements`) (`SEC-DBA-001`):**  
   La inserción en la tabla de trazabilidad `stock_movements` se delega al cliente web (`saleSlice.ts`) tras resolverse la llamada RPC. Si el navegador pierde la conexión inmediatamente después del `commit` de la venta, el stock se descuenta en `products`, pero el movimiento de salida no se asienta jamás en el kardex, imposibilitando la reconciliación en auditorías físicas.
4. **Doble Deducción de Stock por Rebote de Clic (`FE-POS-001`):**  
   El botón de confirmación en `POSCheckoutModal.tsx` carece de atributo `disabled` y de un cerrojo síncrono en JavaScript. Un doble clic en pantallas táctiles o un operador impaciente despacha dos promesas asíncronas de red. Al no poseer token de idempotencia, el backend ejecuta dos veces `process_sale_atomic`, descontando dos veces las existencias de catálogo por una única entrega de producto al cliente.

### 2.2. Descuadres de Dinero en Arqueo y Cierres de Caja
1. **Generación Fraudulenta de Cuentas por Cobrar por Descuento Ignorado (`FIN-POS-001`):**  
   En `POS.tsx`, la interfaz calcula el total con descuento (ej. un 10% de rebaja), pero la llamada a `completeSale(method, clientId, paymentAmount)` en `saleSlice.ts` omite el parámetro de descuento. La función recalcula el total sumando los precios de lista sin rebaja. Como el dinero entregado por el cliente cubre el monto con descuento pero es inferior al subtotal bruto, el sistema califica la venta como `PARTIAL` o `PENDING`, cargando una deuda morosa ficticia al cliente y declarando ingresos devengados no recaudados.
2. **Ventas Asíncronas Huérfanas de Cierre Z (`FIN-CLS-002`):**  
   `DailyClose.tsx` ejecuta el Cierre Z actualizando `settings.last_close_date = now()` mediante una llamada REST no atómica. Una venta en curso iniciada a las 18:00:00.000 con latencia de red que finaliza a las 18:00:00.400 queda registrada con timestamp anterior al cierre ejecutado a las 18:00:00.200. En consecuencia, **queda excluida del Cierre Z de hoy y el filtro del próximo cierre (`sale.date > lastClose`) la ignorará para siempre**. El dinero no ingresa a ningún arqueo formal y la caja queda descuadrada de manera irreversible.
3. **Desacoplamiento Transaccional del Asiento de Caja (`SEC-DBA-001`):**  
   El asiento de cobro en `cash_ledger` se ejecuta mediante un `insert` desde el frontend posterior a la venta. Si la red se degrada tras la venta, la transacción comercial queda asentada pero la gaveta no registra el ingreso contable.
4. **Descalabro de 4,000x en Moneda COP en Dashboard (`FIN-DSH-004`):**  
   En `Dashboard.tsx` (línea 454), la conversión monetaria evalúa únicamente `currency === 'BS'`. Si la divisa es `'COP'`, el operador ternario la envía a `movement.amountUSD`. Un cobro de **400,000 COP** se computa como **$400,000 USD** (o como $100 COP si se normaliza erróneamente), destruyendo la fidelidad del balance financiero en pantalla.
5. **Ausencia Absoluta de Arqueo Físico y Control de Billetaje (`FIN-ARQ-005`):**  
   El sistema no captura el conteo de gaveta física por denominación ($100, $50, $20, Bs, COP) ni comprobantes de tarjeta. Al no calcular la diferencia contra el saldo teórico esperado, los faltantes de caja por robo hormiga o pérdidas operativas quedan completamente invisibilizados.

### 2.3. Brechas de Seguridad que Permiten Saltarse el RLS o Elevar Privilegios
1. **Bypass Masivo de RBAC en PostgREST (`SEC-APP-001`):**  
   Las tablas `suppliers`, `products`, `sales`, `sale_items`, `invoices`, `expenses` y `cash_ledger` mantienen políticas `FOR ALL TO authenticated USING (true) WITH CHECK (true)`. Aunque la interfaz oculte botones a usuarios con rol `SELLER`, cualquier cajero con un JWT válido puede emitir peticiones directas contra PostgREST mediante `curl` o consola:
   - Modificar precios de venta y costos en `products` (`cost: 0.01`).
   - Alterar cuentas bancarias de proveedores en `suppliers`.
   - Modificar montos cobrados en `sales` o eliminar salidas de efectivo en `cash_ledger`.
2. **Exposición No Autenticada de Configuración Financiera (`SEC-APP-004`):**  
   La tabla `settings` conserva activa la regla `Allow anon read settings`. Cualquier cliente en internet que posea la clave anónima pública del frontend puede extraer `/rest/v1/settings` y acceder a los márgenes de utilidad del negocio (`default_margin`, `margin_mayorista`), porcentajes de comisión a vendedores y datos fiscales.
3. **Invocación No Autorizada y Fuga de Credenciales en Edge Function (`SEC-APP-002`, `SEC-APP-003`):**  
   La función serverless `process-invoice` no verifica el rol del usuario en `public.users` ni su estado (`is_active = true`), permitiendo a cajeros o cuentas suspendidas consumirla. La función envía la `GEMINI_API_KEY` en el query string de la URL y, ante cualquier error de red, el bloque `catch` refleja `(error as Error).message` en la respuesta HTTP 500, filtrando la clave privada de IA al navegador.
4. **Suplantación de Identidad en Registros de Auditoría (`SEC-APP-006`):**  
   La directiva `WITH CHECK (true)` en `audit_logs` no valida que `user_id = auth.uid()`, habilitando a cualquier usuario autenticado a inyectar eventos fraudulentos atribuyéndoselos a Administradores.

### 2.4. Bloqueos Operativos en el Punto de Venta durante el Cobro
1. **Pérdida Destructiva de Contexto ante Fallos de Red o Stock (`FE-CTX-003`):**  
   En `POS.tsx`, si `completeSale` falla (por ejemplo, por stock insuficiente detectado en backend o timeout), el bloque de captura ejecuta `else { setIsCheckoutModalOpen(false); }`. El modal se cierra súbitamente, borrando los datos de abono inicial, cliente seleccionado, método de pago y descuentos aplicados, forzando al operador a comenzar de nuevo con el cliente en espera.
2. **Congelamiento de Interfaz y Retraso en Lector de Código de Barras (`FE-PERF-002`):**  
   `POS.tsx` ejecuta un polling ciego cada 4 segundos (`fetchProducts()`). Cada refresco sobrescribe el catálogo en Zustand, lo que desencadena el recálculo masivo de precios en `productsWithPrices`, el análisis de doble bucle en `topSold` y la re-renderización de la cuadrícula de productos. Esto satura el hilo principal del navegador, causando pérdida de caracteres al escanear con pistolas de códigos de barras.
3. **Bloqueo Síncrono por Impresión y Fallo Silencioso de Pop-ups (`FE-PRN-004`):**  
   La llamada nativa `window.print()` detiene la ejecución del runtime hasta que el diálogo nativo sea cerrado. Adicionalmente, reportes de cierre invocados mediante `window.open` fallan silenciosamente cuando el navegador activa el bloqueo de pop-ups, sin presentar ninguna alerta al cajero.
4. **Bloqueo en Cascada por Claves Foráneas sin Índice (`SEC-DBA-005`):**  
   Las claves foráneas `sale_items(product_id)` y `quotes(client_id)` no están indexadas. Cualquier `UPDATE` o `DELETE` sobre el catálogo de productos impone un candado `ShareRowExclusiveLock` que fuerza un Sequential Scan bloqueante sobre cientos de miles de ítems históricos, paralizando las cajas registradoras.

---

## 3. Plan de Remediación por Fases

### Fase 1: Hotfixes Inmediatos (24 a 48 Horas)
*Objetivo: Erradicar brechas de seguridad, anular deadlocks transaccionales e impedir la corrupción de stock y caja.*
1. **Ejecución de Parche SQL de RLS y RBAC en PostgreSQL:**
   - Revocar el acceso `anon` sobre la tabla `settings`.
   - Reemplazar las políticas permisivas en `suppliers`, `products`, `sales`, `sale_items`, `invoices`, `expenses` y `audit_logs`.
   - Modificar la función `current_user_role()` para exigir `is_active = true`.
2. **Despliegue de Funciones Atómicas ACID en PostgreSQL:**
   - Instalar las restricciones `chk_products_stock_non_negative` y `chk_sale_items_quantity_positive`.
   - Crear índices `UNIQUE` en `returns(nc_number)` y `sales(local_id)`.
   - Sustituir `process_sale_atomic` por la versión determinista con ordenamiento estricto `ORDER BY (elem->>'product_id')::uuid ASC`, candado pesimista `FOR UPDATE` e inserción atómica de `stock_movements` y `cash_ledger`.
   - Instalar la función `process_return_atomic` con bloqueo jerárquico de ventas y generación atómica de correlativos de Notas de Crédito.
3. **Parche Defensivo en Edge Function `process-invoice`:**
   - Mover la `GEMINI_API_KEY` a la cabecera HTTP `x-goog-api-key`.
   - Validar identidad y exigir rol `ADMIN` o `MANAGER` antes de procesar el archivo.
   - Establecer límite de 10 MB para payloads en base64 y timeout de 30 segundos vía `AbortSignal.timeout(30000)`.

### Fase 2: Consistencia Financiera & Estado POS (3 a 5 Días)
*Objetivo: Garantizar la exactitud matemática de caja, erradicar dobles cobros y estabilizar la reactividad del frontend.*
1. **Subsanación del Flujo de Venta y Descuento en POS:**
   - Modificar la firma de `completeSale` en `saleSlice.ts` para recibir y computar `discountPct`.
   - Asegurar que la determinación de deuda (`isCredit`) se calcule exclusivamente sobre el total neto facturado.
   - Eliminar el registro duplicado de `stock_movements` y `cash_ledger` en el cliente JavaScript tras la confirmación de la RPC.
2. **Cerrojo Síncrono e Idempotencia en Interfaz de Cobro:**
   - Implementar cerrojo con `useRef` síncrono y estado visual `disabled={isSubmitting}` con spinner en `POSCheckoutModal.tsx`.
   - Evitar el cierre destructivo del modal ante excepciones, preservando los datos de pago para reintento.
3. **Motor Matemático Determinista Financiero:**
   - Refactorizar `pricing.ts` integrando la función `roundTo` con escalamiento entero/centavos para eliminar inconsistencias por flotantes IEEE 754.
   - Corregir el cálculo de "Camuflaje TH" preservando la precisión en Bolívares antes de la conversión a USD.
   - Corregir la fórmula de evaluación de divisas en `Dashboard.tsx` para normalizar montos en COP.
4. **Higienización de Sincronización Realtime y Polling:**
   - Desmontar el `setInterval` de 4 segundos en `POS.tsx` a favor de revalidación dirigida por foco de ventana (`focus` / `visibilitychange`).
   - Depurar dependencias en `useRealtimeSync.ts` para erradicar el churn de WebSockets y fugas de memoria.
5. **Cierre Z Transaccional y Arqueo Ciego:**
   - Desplegar la RPC `execute_safe_daily_close_z` con bloqueo exclusivo sobre `settings` para consolidar todas las ventas del turno sin huérfanas.
   - Añadir al modal de `DailyClose.tsx` el desglose de arqueo físico por denominaciones de billetes con determinación de faltantes y sobrantes.

### Fase 3: Infraestructura y Hardening (1 a 2 Semanas)
*Objetivo: Optimizar rendimiento en base de datos, asegurar la cadena de suministro y blindar la entrega en CDN.*
1. **Optimización de Índices en PostgreSQL:**
   - Indexar claves foráneas: `sale_items(product_id)`, `quotes(client_id)`, `sales(user_id)`, `returns(user_id)`.
   - Crear índices compuestos para alta concurrencia: `stock_movements(product_id, created_at DESC)`, `cash_ledger(created_at DESC)`, `sales(status, date DESC)`.
2. **Saneamiento de la Cadena de Suministro (Supply Chain):**
   - Desinstalar `@anthropic-ai/claude-code` de las dependencias de `package.json`.
   - Actualizar paquetes vulnerables: `supabase CLI >= 2.77.2` (mitiga `tar`), `vite >= 7.3.6` y `react-router-dom >= 7.18.4`.
3. **Hardening de Configuración Web y CDN (`netlify.toml` y `vite.config.ts`):**
   - Inyectar cabeceras HSTS (`max-age=31536000`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y CSP estricto sin comodines `https:` / `wss:`.
   - Configurar redirecciones SPA declarativas en `netlify.toml` bajo estándar IaC.
   - Forzar `sourcemap: false`, aplicar `esbuild.drop = ['console', 'debugger']` en producción y enlazar el servidor local exclusivamente a `127.0.0.1`.
4. **Resiliencia en Periféricos de Impresión:**
   - Sustituir llamadas síncronas directas de impresión por handlers asíncronos y agregar detección explícita con notificación toast cuando el navegador bloquee pop-ups de tickets y reportes.

---

## 4. Manual de Remediación

### Fallo Crítico 1: Integridad Transaccional, Control de Deadlocks y Kardex Atómico
- **Archivo afectado:** `supabase/migrations/20260922_dba_atomic_sales_and_constraints.sql`

#### Código actual defectuoso:
```sql
FOR r IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT stock INTO v_stock FROM public.products WHERE id = (r->>'product_id')::uuid FOR UPDATE;
    IF v_stock < (r->>'quantity')::numeric THEN
        RAISE EXCEPTION 'Stock insuficiente';
    END IF;
    UPDATE public.products SET stock = stock - (r->>'quantity')::numeric WHERE id = (r->>'product_id')::uuid;
END LOOP;
```

#### Código refactorizado listo para producción:
```sql
BEGIN;

-- 1. Restricciones de integridad física
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_non_negative') THEN
        UPDATE public.products SET stock = 0 WHERE stock < 0;
        ALTER TABLE public.products ADD CONSTRAINT chk_products_stock_non_negative CHECK (stock >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_quantity_positive') THEN
        ALTER TABLE public.sale_items ADD CONSTRAINT chk_sale_items_quantity_positive CHECK (quantity > 0);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_returns_nc_number ON public.returns(nc_number) WHERE nc_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_local_id ON public.sales(local_id) WHERE local_id IS NOT NULL;

-- 2. Función Atómica Refactorizada
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
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito de venta no puede estar vacío';
    END IF;

    -- Insertar Cabecera de Venta
    INSERT INTO public.sales (
        client_id, total_usd, total_ved, payment_method, status,
        paid_amount_usd, is_credit, user_id, seller_name, date
    ) VALUES (
        p_client_id, p_total_usd, coalesce(p_total_ved, 0), p_payment_method, p_status,
        coalesce(p_paid_amount_usd, 0), coalesce(p_is_credit, false), p_user_id, p_seller_name, v_sale_date
    )
    RETURNING id, sales.local_id, sales.date INTO v_sale_id, v_local_id, v_sale_date;

    -- Procesar Ítems: Agrupados y ordenados canónicamente por UUID para erradicar Deadlocks (40P01)
    FOR r IN (
        SELECT 
            (elem->>'product_id')::uuid AS product_id,
            elem->>'sku' AS sku,
            elem->>'product_name' AS product_name,
            sum((elem->>'quantity')::numeric) AS quantity,
            (elem->>'unit_price_usd')::numeric AS unit_price_usd,
            coalesce((elem->>'cost_unit_usd')::numeric, 0) AS cost_unit_usd
        FROM jsonb_array_elements(p_items) AS elem
        GROUP BY (elem->>'product_id')::uuid, elem->>'sku', elem->>'product_name', (elem->>'unit_price_usd')::numeric, coalesce((elem->>'cost_unit_usd')::numeric, 0)
        ORDER BY (elem->>'product_id')::uuid ASC
    ) LOOP
        IF r.quantity <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida para producto %: % (Debe ser > 0)', r.product_name, r.quantity;
        END IF;

        -- Bloqueo determinista
        SELECT stock INTO v_stock FROM public.products WHERE id = r.product_id FOR UPDATE;

        IF v_stock IS NULL THEN
            RAISE EXCEPTION 'Producto no encontrado: %', r.product_id;
        END IF;

        IF v_stock < r.quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%:disponible=%,solicitado=%', r.product_id, v_stock, r.quantity;
        END IF;

        UPDATE public.products SET stock = stock - r.quantity WHERE id = r.product_id;

        INSERT INTO public.sale_items (
            sale_id, product_id, sku, product_name_snapshot, quantity, unit_price_usd, cost_unit_usd
        ) VALUES (
            v_sale_id, r.product_id, r.sku, r.product_name, r.quantity, r.unit_price_usd, r.cost_unit_usd
        );

        -- Kardex atómico DENTRO de la transacción
        INSERT INTO public.stock_movements (
            product_id, sku, product_name, type, qty_before, qty_change, qty_after,
            reference_id, reason, created_by, seller_name, created_at
        ) VALUES (
            r.product_id, r.sku, r.product_name, 'SALE', v_stock, -r.quantity, v_stock - r.quantity,
            v_sale_id::text, 'Venta registrada #' || coalesce(v_local_id::text, v_sale_id::text),
            p_user_id, p_seller_name, v_sale_date
        );
    END LOOP;

    -- Asiento de Caja atómico si hubo cobro
    IF p_paid_amount_usd > 0 THEN
        INSERT INTO public.payments (sale_id, amount_usd, method, note)
        VALUES (v_sale_id, p_paid_amount_usd, p_payment_method, 'Pago Inicial');

        SELECT coalesce(currency, 'USD') INTO v_method_currency
        FROM public.payment_methods WHERE name = p_payment_method LIMIT 1;

        INSERT INTO public.cash_ledger (
            date, direction, kind, amount_usd, amount_bs, currency, payment_method,
            description, reference_type, reference_id, user_id, seller_name, created_at
        ) VALUES (
            v_sale_date::text, 'IN', 'VENTA_COBRADA', p_paid_amount_usd,
            CASE WHEN v_method_currency = 'BS' THEN p_total_ved ELSE NULL END,
            coalesce(v_method_currency, 'USD'), p_payment_method,
            'Cobro inicial venta #' || coalesce(v_local_id::text, substring(v_sale_id::text from 1 for 8)),
            'sale-payment', v_sale_id::text || ':initial', p_user_id, p_seller_name, v_sale_date
        ) ON CONFLICT (reference_type, reference_id) DO NOTHING;
    END IF;

    RETURN QUERY SELECT v_sale_id, v_local_id, v_sale_date;
END;
$$;

COMMIT;
```

---

### Fallo Crítico 2: Vulnerabilidad RLS y Control de Acceso por Roles (RBAC)
- **Archivo afectado:** `supabase/migrations/20260922_appsec_rbac_rls_hardening.sql`

#### Código actual defectuoso:
```sql
CREATE POLICY "Allow authenticated users full access on suppliers" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users full access on products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users full access on sales" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read settings" ON public.settings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated to insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
```

#### Código refactorizado listo para producción:
```sql
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
  RETURN COALESCE(v_role, 'VIEWER');
END;
$$;

-- Endurecer SETTINGS
DROP POLICY IF EXISTS "Allow anon read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admins to manage settings" ON public.settings;

CREATE POLICY "Allow authenticated to read settings" ON public.settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin to manage settings" ON public.settings
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- Endurecer SUPPLIERS
DROP POLICY IF EXISTS "Allow authenticated users full access on suppliers" ON public.suppliers;

CREATE POLICY "Allow staff to read suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER'));

CREATE POLICY "Allow admin and manager to manage suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- Endurecer PRODUCTS
DROP POLICY IF EXISTS "Allow authenticated users full access on products" ON public.products;

CREATE POLICY "Allow authenticated to read products" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin and manager to modify products" ON public.products
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- Endurecer SALES y SALE_ITEMS
DROP POLICY IF EXISTS "Allow authenticated users full access on sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authenticated users full access on sale_items" ON public.sale_items;

CREATE POLICY "Allow read sales by role" ON public.sales
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER') OR user_id = auth.uid());

CREATE POLICY "Allow insert sales" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER') AND user_id = auth.uid());

CREATE POLICY "Allow admin and manager to update sales" ON public.sales
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- Endurecer AUDIT_LOGS
DROP POLICY IF EXISTS "Allow authenticated to insert audit_logs" ON public.audit_logs;

CREATE POLICY "Allow verified insertion of audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
```

---

### Fallo Crítico 3: Generación de Deuda Fraudulenta por Descuento Ignorado
- **Archivo afectado:** `src/store/slices/saleSlice.ts`

#### Código actual defectuoso:
```typescript
const totalUSD = Math.round(cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0) * 100) / 100;
const totalVED = Math.round((totalUSD * settings.tasaBCV) * 100) / 100;

const paidAmount = initialPayment !== undefined ? initialPayment : totalUSD;
let status: SaleStatus = 'COMPLETED';
if (paidAmount < totalUSD - 0.01) status = paidAmount > 0 ? 'PARTIAL' : 'PENDING';

const isCredit = paidAmount < totalUSD - 0.01;
```

#### Código refactorizado listo para producción:
```typescript
completeSale: async (
  paymentMethod: string,
  clientId?: string,
  initialPayment?: number,
  discountPct: number = 0
) => {
  const { cart, settings, currentUserData } = get();
  toast.dismiss();

  if (cart.length === 0) {
    toast.error("El carrito está vacío 🛒");
    return null;
  }

  // 1. Cálculo financiero exacto con descuento contable
  const grossSubtotalUSD = Math.round(
    cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0) * 100
  ) / 100;

  const safeDiscountPct = Math.min(100, Math.max(0, discountPct));
  const discountAmountUSD = Math.round(grossSubtotalUSD * (safeDiscountPct / 100) * 100) / 100;
  const netTotalUSD = Math.round((grossSubtotalUSD - discountAmountUSD) * 100) / 100;
  const netTotalVED = Math.round((netTotalUSD * settings.tasaBCV) * 100) / 100;

  // 2. Evaluación de deuda contra el importe NETO a cobrar
  const paidAmount = initialPayment !== undefined ? Math.round(initialPayment * 100) / 100 : netTotalUSD;
  const isCredit = paidAmount < (netTotalUSD - 0.01);
  let status: SaleStatus = 'COMPLETED';
  if (isCredit) {
    status = paidAmount > 0 ? 'PARTIAL' : 'PENDING';
  }

  const rpcItems = cart.map((item) => ({
    product_id: item.id,
    sku: item.sku,
    product_name: item.name,
    quantity: Number(item.quantity),
    unit_price_usd: Number(item.priceFinalUSD),
    cost_unit_usd: Number(item.cost),
    discount_pct: safeDiscountPct,
  }));

  // 3. Ejecución de la transacción ACID en backend
  const { data: rpcData, error: saleError } = await supabase.rpc('process_sale_atomic', {
    p_client_id: clientId || null,
    p_payment_method: paymentMethod,
    p_paid_amount_usd: paidAmount,
    p_status: status,
    p_total_usd: netTotalUSD,
    p_total_ved: netTotalVED,
    p_is_credit: isCredit,
    p_user_id: currentUserData?.id || null,
    p_seller_name: currentUserData?.fullName || null,
    p_items: rpcItems,
  });

  if (saleError || !rpcData || rpcData.length === 0) {
    throw new Error(saleError?.message || 'Error al procesar la venta');
  }

  const saleData = rpcData[0] as { sale_id: string; local_id: number | null; sale_date: string };

  get().clearCart();
  await get().fetchProducts();
  await get().fetchSales();

  return {
    id: saleData.sale_id,
    localId: saleData.local_id ?? undefined,
    date: saleData.sale_date,
    clientId,
    totalUSD: netTotalUSD,
    paidAmountUSD: paidAmount,
    status,
    paymentMethod,
    items: [],
  } as unknown as Sale;
},
```

---

### Fallo Crítico 4: Ventas Huérfanas en Cierre Z de Caja y Concurrencia
- **Archivo afectado:** `supabase/migrations/20260922_financial_safe_daily_close_z.sql`

#### Código actual defectuoso:
```typescript
performDailyClose: async (turnData) => {
    const now = new Date().toISOString();
    await supabase.from('settings').update({ last_close_date: now }).eq('id', settingsId);
    await supabase.from('cash_closes').insert({ ...turnData });
}
```

#### Código refactorizado listo para producción:
```sql
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
  v_tx_count integer;
  v_system_total_usd numeric(12,2) := 0;
  v_system_total_bs numeric(12,2) := 0;
  v_seq integer;
  v_new_close_id uuid;
  v_diff_usd numeric(12,2);
  v_shortage numeric(12,2) := 0;
  v_overage numeric(12,2) := 0;
BEGIN
  -- 1. Bloqueo pesimista de settings para impedir cierres simultáneos
  SELECT last_close_date INTO v_last_close_date
  FROM public.settings
  LIMIT 1
  FOR UPDATE;

  IF v_last_close_date IS NULL THEN
    v_last_close_date := '1970-01-01 00:00:00+00'::timestamptz;
  END IF;

  -- 2. Consolidar transacciones estrictamente en el intervalo (last_close, v_now]
  SELECT 
    COUNT(*),
    COALESCE(SUM(paid_amount_usd), 0),
    COALESCE(SUM(total_ved), 0)
  INTO 
    v_tx_count,
    v_system_total_usd,
    v_system_total_bs
  FROM public.sales
  WHERE date > v_last_close_date
    AND date <= v_now
    AND status <> 'CANCELLED';

  -- 3. Computar faltantes o sobrantes contra arqueo declarado
  v_diff_usd := p_declared_usd - v_system_total_usd;
  IF v_diff_usd < -0.01 THEN
    v_shortage := ABS(v_diff_usd);
  ELSIF v_diff_usd > 0.01 THEN
    v_overage := v_diff_usd;
  END IF;

  -- 4. Registrar Cierre Oficial
  INSERT INTO public.cash_closes (
    closed_at, closed_by, seller_name, total_usd, total_bs, tx_count,
    declared_usd, declared_bs, declared_cop, shortage_usd, overage_usd, notes
  ) VALUES (
    v_now, p_closed_by, p_seller_name, v_system_total_usd, v_system_total_bs,
    v_tx_count, p_declared_usd, p_declared_bs, p_declared_cop, v_shortage, v_overage, p_notes
  )
  RETURNING id, cash_closes.sequence_number INTO v_new_close_id, v_seq;

  -- 5. Avanzar la marca temporal exactamente a v_now
  UPDATE public.settings SET last_close_date = v_now;

  RETURN QUERY
  SELECT 
    v_new_close_id, v_seq, v_now, v_tx_count,
    v_system_total_usd, v_system_total_bs, v_shortage, v_overage;
END;
$$;
```

---

### Fallo Crítico 5: Doble Cobro en Punto de Venta y Falta de Idempotencia
- **Archivo afectado:** `src/components/pos/POSCheckoutModal.tsx`

#### Código actual defectuoso:
```tsx
<button onClick={onCheckout} className={`w-full py-4 text-white font-bold rounded-xl text-lg shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-2 ${isCreditSale ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200' : 'bg-green-600 hover:bg-green-700 shadow-green-200'}`}>
  <CheckCircle size={24} /> {isCreditSale ? 'REGISTRAR DEUDA' : 'CONFIRMAR VENTA'}
</button>
```

#### Código refactorizado listo para producción:
```tsx
import { CheckCircle, Loader2 } from 'lucide-react';

interface CheckoutButtonProps {
  isSubmitting: boolean;
  isCreditSale: boolean;
  onConfirm: () => void;
}

export function ProtectedCheckoutButton({ isSubmitting, isCreditSale, onConfirm }: CheckoutButtonProps) {
  return (
    <button
      type="button"
      disabled={isSubmitting}
      onClick={onConfirm}
      className={`w-full py-4 text-white font-bold rounded-xl text-base shadow-lg transition flex items-center justify-center gap-2 ${
        isSubmitting
          ? 'bg-gray-400 cursor-not-allowed opacity-90'
          : isCreditSale
            ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200 active:scale-[0.98]'
            : 'bg-green-600 hover:bg-green-700 shadow-green-200 active:scale-[0.98]'
      }`}
    >
      {isSubmitting ? (
        <>
          <Loader2 size={20} className="animate-spin" />
          <span>Procesando Venta...</span>
        </>
      ) : (
        <>
          <CheckCircle size={20} />
          <span>{isCreditSale ? 'REGISTRAR DEUDA' : 'CONFIRMAR VENTA'} (Ctrl+Enter)</span>
        </>
      )}
    </button>
  );
}
```

---

### Fallo Crítico 6: Fuga de API Key de Gemini y DoS en Edge Function
- **Archivo afectado:** `supabase/functions/process-invoice/index.ts`

#### Código actual defectuoso:
```typescript
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
const geminiResponse = await fetch(apiUrl, { ... });
// ...
} catch (error: unknown) {
  return jsonResponse({ success: false, error: (error as Error).message }, 500);
}
```

#### Código refactorizado listo para producción:
```typescript
/* global Deno */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Método no permitido.' }, 405);

  // 1. Verificación de JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'No autorizado: token faltante.' }, 401);
  }

  // 2. Control de Payload contra DoS / OOM (Límite: 10MB)
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 10 * 1024 * 1024) {
    return jsonResponse({ success: false, error: 'El archivo excede el límite de 10MB.' }, 413);
  }

  // 3. Verificación de RBAC (Solo ADMIN o MANAGER)
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError || !user) return jsonResponse({ success: false, error: 'Sesión inválida.' }, 401);

  const { data: profile } = await supabaseClient
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active || !['ADMIN', 'MANAGER'].includes(profile.role)) {
    return jsonResponse({ success: false, error: 'Acceso denegado: permisos insuficientes.' }, 403);
  }

  const { imageBase64, mimeType } = await req.json();
  if (!imageBase64 || !mimeType) {
    return jsonResponse({ success: false, error: 'Parámetros incompletos.' }, 400);
  }

  // 4. Invocación Segura a Gemini (API Key en Header x-goog-api-key + Timeout 30s)
  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey!,
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Extrae los datos en JSON." }, { inlineData: { mimeType, data: imageBase64 } }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) throw new Error(`Upstream Error: ${response.status}`);
    const data = await response.json();
    return jsonResponse({ success: true, data }, 200);
  } catch (err: unknown) {
    console.error('Error procesando factura:', err);
    return jsonResponse({ success: false, error: 'Error interno en el servicio de extracción.' }, 500);
  }
});
```

---

### Fallo Crítico 7: Descalabro Contable de 4,000x en Moneda COP en Dashboard
- **Archivo afectado:** `src/pages/Dashboard.tsx`

#### Código actual defectuoso:
```typescript
const amountInMethodCurrency = map[method].currency === 'BS'
  ? (movement.amountBS ?? (movement.amountUSD * settings.tasaBCV))
  : movement.amountUSD;
```

#### Código refactorizado listo para producción:
```typescript
const getNormalizedAmount = (
  movement: CashLedgerEntry,
  currency: 'USD' | 'BS' | 'COP',
  tasaBCV: number,
  tasaCOP: number
): number => {
  if (currency === 'BS') {
    return movement.amountBS ?? (movement.amountUSD * (tasaBCV > 0 ? tasaBCV : 1));
  }
  if (currency === 'COP') {
    return movement.amountCOP ?? Math.round(movement.amountUSD * (tasaCOP > 0 ? tasaCOP : 1));
  }
  return movement.amountUSD;
};

// Aplicación en el mapeo de movimientos:
const targetCurrency = map[method].currency || 'USD';
const amountInMethodCurrency = getNormalizedAmount(
  movement,
  targetCurrency,
  settings.tasaBCV,
  settings.tasaCOP
);
```
