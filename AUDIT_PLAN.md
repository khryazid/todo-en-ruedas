# 📋 Plan de Auditoría Técnica y Remediación — Glyph Core (Todo en Ruedas)

> **Fecha:** 2026-09-22  
> **Rol:** Agente Autónomo de Auditoría Técnica  
> **Estado:** 🚀 Remediación Total Completada — 18/18 tareas ejecutadas y verificadas. `npm run lint`, `tsc -b` y `npm run build` pasan con código 0 sin errores ni advertencias.

---

## 🔍 Resumen Ejecutivo del Diagnóstico

1. **Compilador TypeScript (`tsc -b` / `npx tsc --noEmit`):**
   - **Resultado:** Exitoso (código 0). Cero discrepancias sintácticas o de tipos en todo el frontend.
2. **Linter de Código (`npm run lint`):**
   - **Resultado:** Exitoso (código 0). Cero errores, cero advertencias. React 19 Compiler pasa limpiamente.
3. **Contratos RPC y Base de Datos (Supabase PostgreSQL):**
   - Inconsistencias críticas entre contratos SQL y llamadas RPC en slices (`nextval` ausente en PostgREST, restricciones `CHECK (currency IN ('USD','BS'))` que rechazan `COP`, políticas RLS permisivas universales `USING(true) WITH CHECK(true)` y omisión de RPCs en las migraciones versionadas).
4. **Reglas de Negocio e Integridad Contable:**
   - Descuadres en Cierre Diario por omitir el libro mayor (`cash_ledger`), límite rígido de 100 ventas que oculta cuentas por cobrar antiguas, y desvinculación de cliente al convertir cotización a venta en el POS.

---

## 🔴 Severidad Alta (Críticas / Bloqueantes / Seguridad / Contratos DB)

### [x] 1. RPC Inexistente para Secuencia de Devoluciones (`nextval`)
- **Archivo Afectado:** [`src/store/slices/returnSlice.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/store/slices/returnSlice.ts#L21-L29)
- **Causa Raíz:** La función `nextNcNumber()` invoca `supabase.rpc('nextval', { sequence_name: 'nc_number_seq' })`. PostgREST no expone la función interna de PostgreSQL `pg_catalog.nextval` en el schema `public`, ni existe ninguna función SQL envoltorio definida en `schema.sql` o en las migraciones. La llamada RPC siempre falla con error 404/PGRST y cae en el `catch`, ejecutando un fallback basado en `count(*)` de la tabla `returns`.
- **Impacto:** En caso de devoluciones concurrentes o si se anulan/eliminan devoluciones, se generan números de Nota de Crédito duplicados (`NC-0001`, `NC-0001`), violando la integridad fiscal y contractual.
- **✅ Corrección Aplicada:**
  - Creada migración `supabase/migrations/20260921000001_add_get_next_nc_number_rpc.sql` con la función `public.get_next_nc_number()`.
  - Actualizado `nextNcNumber()` en `returnSlice.ts` para invocar `supabase.rpc('get_next_nc_number')`.
  - Fallback cambiado a timestamp-slug (anti-duplicados, no secuencial).

---

### [x] 2. Restricciones CHECK en PostgreSQL Bloquean Operaciones en Pesos Colombianos (`COP`)
- **Archivos Afectados:** `supabase/schema.sql`, migraciones, `settingsSlice.ts`, `cashLedgerSlice.ts`, `expenseSlice.ts`
- **✅ Corrección Aplicada:**
  - Creada migración `20260921000002_expand_currency_check_for_cop.sql` que actualiza los 4 `CHECK` constraints.
  - Corregido `schema.sql` (líneas 243, 269, 311, 398) para entornos de reset limpio.
  - Agregada columna `amount_cop` a la tabla real `payments`.

---

### [x] 3. Row Level Security (RLS) Permisivo Universal (Vulnerabilidad Crítica de Autorización)
- **Archivo Afectado:** [`supabase/schema.sql`](file:///c:/Users/Khris/dev/todo-en-ruedas/supabase/schema.sql#L457-L515)
- **✅ Corrección Aplicada:**
  - Creada migración `20260921000003_restrict_rls_admin_tables.sql` con políticas restrictivas para `users`, `settings`, `cash_closes` y `audit_logs`.
  - Creada función helper `public.current_user_role()` para verificar rol desde contexto de sesión.
  - Políticas de lectura para autenticados preservadas; escritura limitada a ADMIN/MANAGER según tabla.

---

### [x] 4. Riesgo de Escalación de Privilegios en Auto-creación de Usuarios
- **Archivo Afectado:** [`src/store/slices/userSlice.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/store/slices/userSlice.ts#L115-L130)
- **✅ Corrección Aplicada:**
  - Eliminada lectura de `user.user_metadata?.role` en `fetchCurrentUserData()`.
  - Auto-registro ahora asigna siempre `role: 'VIEWER'` (variable `safeRole`).
  - Corregidas 2 referencias al fallback local que usaban la variable eliminada `fallbackRole`.

---

### [x] 5. Inconsistencia de Migraciones para RPCs de Gestión de Usuarios
- **Archivos Afectados:** `userSlice.ts`, `schema.sql`, `supabase/migrations/`
- **✅ Corrección Aplicada:**
  - Creada migración `20260921000004_admin_user_rpcs_and_hardened_trigger.sql` que incluye:
    - `admin_update_user_password(target_user_id, new_password)`
    - `admin_update_user_email(target_user_id, new_email)`
    - Trigger `sync_public_user_from_auth` endurecido (no lee role del JWT metadata).
  - Movido archivo huérfano `migration_20260304_users_profile_sync.sql` a la nueva migración versionada.

---

### [x] 6. Omisión de Mecanismos Atómicos y Asientos Contables en Cotizaciones y Devoluciones
- **Archivos Afectados:** `quoteSlice.ts`, `returnSlice.ts`
- **✅ Corrección Aplicada:**
  - **`quoteSlice.ts`**: Reemplazado `products.update({ stock: newStock })` por `adjust_product_stock(p_product_id, -qty)` RPC atómica. Agregado registro `addStockMovement`. Agregado asiento `IN` en `cash_ledger` para la conversión.
  - **`returnSlice.ts`**: Reemplazado `products.update({ stock: newStock })` por `adjust_product_stock(p_product_id, +qty)` RPC. Agregado asiento `OUT`/`AJUSTE` en `cash_ledger` cuando `option === 'REEMBOLSO'`.

---

### [x] 7. Potencial Fallo Catastrófico en Inicialización por RIF Nulo
- **Archivos Afectados:** `authSlice.ts`, `settingsSlice.ts`
- **✅ Corrección Aplicada:**
  - En ambos archivos: reemplazado `settingsData.rif.split(...)` por sanitización defensiva con operador `??` y verificación de `includes('-')`.
  - Parseo seguro con `rifParts.slice(1).join('-')` para RIFs con múltiples guiones (ej. `J-12345678-9`).
  - `rifType` casteado a tipo literal seguro `'J' | 'V' | 'E' | 'G' | 'P' | 'C'`.

---

## 🟡 Severidad Media (Lógica de Negocio / Calidad / Rendimiento)

### [x] 8. Errores de ESLint React 19 por `setState` Síncrono en Efectos
- **Archivos Afectados:**
  - [`src/components/pos/POSCheckoutModal.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/components/pos/POSCheckoutModal.tsx#L66)
  - [`src/pages/Expenses.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Expenses.tsx#L155)
  - [`src/pages/POS.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/POS.tsx#L225)
  - [`src/hooks/useRealtimeSync.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/hooks/useRealtimeSync.ts#L235-L236)
  - [`src/store/slices/userSlice.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/store/slices/userSlice.ts#L12)
- **✅ Corrección Aplicada:**
  - En `POSCheckoutModal.tsx`: inicialización lazy de `clientQuery` y key prop combinada en `POS.tsx` para forzar remount limpio sin `useEffect` síncrono.
  - En `Expenses.tsx`: guard con `useRef` y diferimiento asíncrono con `queueMicrotask` para la recuperación de plantillas recurrentes.
  - En `POS.tsx`: reemplazado el `useEffect` de `mobileView` por la función wrapper `switchToProductsView` que sincroniza el offset y drag del sheet.
  - En `useRealtimeSync.ts`: refs de tablas pendientes capturados en variables locales al inicio del efecto antes de que corra el cleanup.
  - En `userSlice.ts`: eliminada función `isValidRole` no utilizada.
  - Resultado: `npm run lint` pasa con 0 errores y 0 advertencias.

---

### [x] 9. Límite Hardcodeado de 100 Ventas Oculta Cuentas por Cobrar y Afecta Cierres
- **Archivos Afectados:**
  - [`src/store/slices/authSlice.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/store/slices/authSlice.ts#L172)
  - [`src/store/slices/saleSlice.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/store/slices/saleSlice.ts#L27)
  - [`src/pages/AccountsReceivable.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/AccountsReceivable.tsx#L35-L63)
  - [`src/pages/Commissions.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Commissions.tsx#L31-L40)
  - [`src/pages/DailyClose.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/DailyClose.tsx#L64-L74)
- **✅ Corrección Aplicada:**
  - En `AccountsReceivable.tsx`: creada consulta remota dedicada a Supabase (`or(status.in.(PENDING,PARTIAL),is_credit.eq.true)`) sin límite de 100 filas, con indicador visual de sincronización.
  - En `saleSlice.ts` y `authSlice.ts`: límite de ventas de carga general ampliado de 100 a 500 registros.
  - En `DailyClose.tsx`: total recalculado usando `paidAmountUSD` en lugar de `totalUSD`.
  - En `Commissions.tsx`: filtro restringido a `s.status === 'COMPLETED'` y cálculo sobre `s.paidAmountUSD`.

---

### [x] 10. Pérdida del Cliente al Convertir Cotización a Venta en POS
- **Archivos Afectados:**
  - [`src/pages/Quotes.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Quotes.tsx#L454-L455)
  - [`src/pages/POS.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/POS.tsx#L100-L121)
- **✅ Corrección Aplicada:**
  - Verificado que `Quotes.tsx` pasa `clientId` y `clientName` en el state de navegación.
  - `POS.tsx` hidrata el cliente automáticamente mediante efecto reactivo sobre `location.state?.clientId` / `clientName` y limpia el historial de navegación para evitar re-aplicaciones accidentales.

---

### [x] 11. Suscripciones Globales no Selectivas a Zustand (Violación de CLAUDE.md)
- **Archivos Afectados:** 17 archivos en `src/pages/` y `src/components/` ([`App.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/App.tsx), [`Dashboard.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Dashboard.tsx), [`POS.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/POS.tsx), [`Clients.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Clients.tsx), [`Invoices.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Invoices.tsx), [`Inventory.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Inventory.tsx), [`InventoryMovements.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/InventoryMovements.tsx), [`Quotes.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Quotes.tsx), [`Sales.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Sales.tsx), [`Suppliers.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Suppliers.tsx), [`Users.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Users.tsx), [`Expenses.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Expenses.tsx), [`Settings.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Settings.tsx), [`DailyClose.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/DailyClose.tsx), [`AccountsReceivable.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/AccountsReceivable.tsx), [`Commissions.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Commissions.tsx), [`GlobalSearch.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/components/GlobalSearch.tsx), [`TopBar.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/components/layout/TopBar.tsx), [`Login.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Login.tsx), [`ResetPassword.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/ResetPassword.tsx))
- **✅ Corrección Aplicada:**
  - Migradas todas las llamadas monolíticas `useStore()` hacia selectores atómicos `useStore(s => s.propiedad)`.
  - Cero llamadas restantes a `useStore()` sin selector en todo el código fuente.

---

### [x] 12. Descuadre Contable y Omisión del Libro Mayor en Cierre Diario (`DailyClose.tsx`)
- **Archivo Afectado:** [`src/pages/DailyClose.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/DailyClose.tsx#L70-L135)
- **✅ Corrección Aplicada:**
  - Integrado `cash_ledger` como fuente de verdad del arqueo de caja del turno (`shiftCashMovements` filtrado por `lastClose`).
  - El desglose por método de pago ahora computa entradas (`IN`) y salidas (`OUT`) reales de dinero (incluyendo abonos a clientes, pagos a proveedores, gastos y reembolsos).
  - Preservada memoización estricta con `useMemo` para `currentShiftSales` y `breakdown` compatible con React Compiler.

---

### [x] 13. Ausencia de Restricción de Edición en Configuración para Rol MANAGER
- **Archivo Afectado:** [`src/pages/Settings.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Settings.tsx)
- **✅ Corrección Aplicada:**
  - Definida constante `isAdmin = currentUserData?.role === 'ADMIN'`.
  - Guardia defensiva en `handleSave`: rechaza y alerta con toast si un no-admin intenta guardar datos corporativos.
  - Inputs de datos fiscales y márgenes globales deshabilitados (`disabled={!isAdmin}`) con badges visuales de "Solo lectura (requiere ADMIN)".
  - Los usuarios MANAGER retienen acceso de edición exclusivo a la actualización de tasas de cambio (BCV / Monitor / COP).

---

### [x] 14. Eliminación de Ventas y Facturas Deja Inconsistencias en Stock y Caja
- **Archivos Afectados:**
  - [`src/store/slices/saleSlice.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/store/slices/saleSlice.ts#L320-L365) (`deleteSale`, `annulSale`)
  - [`src/store/slices/invoiceSlice.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/store/slices/invoiceSlice.ts#L237-L285) (`deleteInvoice`)
  - [`src/pages/Sales.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Sales.tsx#L130)
  - [`src/pages/Invoices.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Invoices.tsx#L115)
- **✅ Corrección Aplicada:**
  - En `saleSlice.ts`: `annulSale` y `deleteSale` ahora registran reverso en `cash_ledger` si la venta tenía montos cobrados (`paidAmountUSD > 0`). En `deleteSale`, si la venta no estaba cancelada, devuelve el stock con `adjust_product_stock` antes del borrado.
  - En `invoiceSlice.ts`: `deleteInvoice` descuenta las existencias ingresadas por la compra vía `adjustProductStock` y asienta el reverso en `cash_ledger` si hubo pagos a proveedor registrados.
  - Diálogos de confirmación en la UI actualizados para informar con precisión las operaciones de stock y caja.

---

## 🟢 Severidad Baja (UI / UX / Robustez / Limpieza)

### [x] 15. Edge Function `process-invoice` sin Autenticación JWT
- **Archivo Afectado:** [`supabase/functions/process-invoice/index.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/supabase/functions/process-invoice/index.ts#L31-L44)
- **✅ Corrección Aplicada:**
  - Incorporada validación obligatoria del token JWT de sesión mediante `@supabase/supabase-js` (`supabase.auth.getUser()`) en la Edge Function Deno.
  - Respuestas HTTP estandarizadas con códigos de estado semánticos (401 No autorizado, 400 Payload inválido, 500 Error de servidor) protegiendo el consumo no autorizado de cuota Gemini.

---

### [x] 16. Atributo Inválido `className` en Generador de Tickets Térmicos
- **Archivo Afectado:** [`src/utils/ticketGenerator.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/utils/ticketGenerator.ts#L110)
- **✅ Corrección Aplicada:**
  - Corregido `className="divider"` por `class="divider"` en el template string HTML puro para asegurar la aplicación de estilos de corte en impresoras térmicas.

---

### [x] 17. Cálculo de Comisiones Computa Facturas a Crédito Impagas
- **Archivo Afectado:** [`src/pages/Commissions.tsx`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/pages/Commissions.tsx#L31-L48)
- **✅ Corrección Aplicada:**
  - Filtro ajustado estrictamente a `s.status === 'COMPLETED'` (excluyendo ventas PENDING, PARTIAL y CANCELLED).
  - Cálculo de comisión y montos de ventas basado de forma defensiva en `s.paidAmountUSD`.

---

### [x] 18. Entidades Faltantes en la Carga Inicial Secundaria (`returns`, `stockMovements`)
- **Archivo Afectado:** [`src/store/slices/authSlice.ts`](file:///c:/Users/Khris/dev/todo-en-ruedas/src/store/slices/authSlice.ts#L245-L265)
- **✅ Corrección Aplicada:**
  - Incluidas llamadas tolerantes a fallos a `get().fetchReturns()` y `get().fetchStockMovements()` en la carga inicial secundaria de `authSlice.ts`.


---

## 🛠️ Plan de Ejecución Priorizado para Próximos Sprints

| Fase | Tareas Principales | Archivos Involucrados |
|---|---|---|
| **Fase 1: Corrección de Base de Datos y Contratos (Bloqueante)** | • Migración SQL para `get_next_nc_number()`<br>• Migración CHECK `currency` (soporte `COP`) en 4 tablas<br>• Migración para RPCs de usuarios (`admin_update_user_*`)<br>• Corrección de RLS básico en tablas maestras | `supabase/migrations/*`, `supabase/schema.sql`, `returnSlice.ts`, `settingsSlice.ts` |
| **Fase 2: Calidad de Código y Despliegue (Build Clean)** | • Corrección de los 3 errores de `react-hooks/set-state-in-effect`<br>• Corrección de advertencias de cleanup en `useRealtimeSync.ts`<br>• Asegurar compilación limpia con `npm run lint` y `npm run build` | `POSCheckoutModal.tsx`, `Expenses.tsx`, `POS.tsx`, `useRealtimeSync.ts` |
| **Fase 3: Integridad Transaccional y Negocio** | • Blindaje contra RIF nulo en carga inicial<br>• Sanitizar auto-creación de roles en `userSlice.ts`<br>• Conexión de cliente transferido de `Quotes.tsx` a `POS.tsx`<br>• Reemplazo de updates manuales de stock por `adjust_product_stock` en devoluciones y cotizaciones | `authSlice.ts`, `settingsSlice.ts`, `userSlice.ts`, `POS.tsx`, `returnSlice.ts`, `quoteSlice.ts` |
| **Fase 4: Consistencia Contable y Performance** | • Reingeniería del cálculo de Cierre Diario basado en `cash_ledger`<br>• Desacoplamiento de Cuentas por Cobrar del límite de 100 ventas<br>• Refactorización de suscripciones Zustand masivas a selectores atómicos | `DailyClose.tsx`, `AccountsReceivable.tsx`, Vistas y páginas principales |
