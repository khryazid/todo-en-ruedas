# 🤖 Guía para Desarrolladores / AI — Glyph Core
> **Actualizado:** 2026-03-01 | Para humanos y modelos de IA que trabajan en este proyecto.

---

## TL;DR Operativo (1 pantalla)

### Comandos minimos
- `npm run dev`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

### Puntos de entrada
- App/rutas: `src/App.tsx`
- Store root: `src/store/useStore.ts`
- Tipos globales: `src/types/index.ts`
- Backend client: `src/supabase/client.ts`
- Realtime: `src/hooks/useRealtimeSync.ts`
- Permisos: `src/utils/permissions.ts`
- Pricing bimoneda: `src/utils/pricing.ts`

### Si vas a agregar una feature
1. Tipo en `src/types/index.ts`
2. Slice en `src/store/slices/`
3. Conectar en `src/store/useStore.ts` y `src/store/types.ts`
4. Cargar en `fetchInitialData` (`src/store/slices/authSlice.ts`) si aplica
5. Ruta en `src/App.tsx` + menu en `src/components/layout/TopBar.tsx`
6. Permisos en `src/utils/permissions.ts` + `RoleRoute`
7. Migracion Supabase en `supabase/migrations/`

### Flujos sensibles (no romper)
- Venta: `saleSlice.completeSale` + RPC `process_sale_atomic`
- Compra/factura: `invoiceSlice.addInvoice`
- Devolucion/NC: `returnSlice.addReturn`
- Setup inicial: `useSetupCheck` + `setupFirstAdmin`

### Contrato tecnico
- DB: `snake_case` | Frontend: `camelCase`
- UI en espanol + feedback con `react-hot-toast`
- RBAC en frontend y RLS en Supabase deben mantenerse alineados

### Smoke test rapido
- Login y carga inicial
- POS vende y descuenta stock
- Venta credito + abono
- Factura compra sube stock
- Gasto impacta `cash_ledger`
- Cotizacion convierte a venta
- Devolucion genera NC y repone stock

---

## 1. Qué es esto

Sistema POS + Inventario + Cotizaciones + Gastos para negocio venezolano bimonetario (USD/VES). En producción activa. El dueño habla español.

---

## 2. Reglas de Oro

| Regla | Detalle |
|---|---|
| **TSC limpio** | Siempre correr `npx tsc --noEmit` antes de declarar algo listo |
| **Linting estricto** | 0 warnings permitidos. El React Compiler maneja la memoización (no usar `useMemo` manual a no ser que sea estrictamente necesario, preferir IIFEs). |
| **React Purity** | No usar funciones impuras como `Date.now()` para IDs o identificadores en el body del componente (usar `crypto.randomUUID()` o hacerlo en handlers). |
| **Tipos en `types/index.ts`** | No crear tipos locales en páginas. Un solo archivo de tipos |
| **Fetch en `fetchInitialData`** | Todo slice nuevo con tabla Supabase → agregar su `fetchXxx()` al final de `authSlice.fetchInitialData()` |
| **No tocar `App.tsx` a ciegas** | Las rutas están protegidas con `<RoleRoute>`. Agregar rutas nuevas con su `allowedRoles` |
| **RLS es la barrera final** | El frontend muestra/oculta botones por rol, pero Supabase RLS bloquea en el backend. Ambas capas deben estar alineadas |
| **Control de Versiones (GIT)** | La IA **NUNCA** debe ejecutar comandos de Git automáticamente. Cuando se termine un bloque lógico de cambios, la IA debe notificar al usuario y generar un texto de commit (ej. `feat: implementado x`) para que el usuario lo copie y ejecute manualmente. |

---

## 3. Lógica Bimonetaria (CRÍTICO)

`src/utils/pricing.ts` → `calculatePrices(product, settings)`

```
// Producto BCV
PVP_USD = Costo + Margen% + IVA%
PVP_BS  = PVP_USD × tasaBCV

// Producto TH ("El Camuflaje")
// Cobra a tasa paralela pero el recibo dice BCV
Base    = Costo + Margen% + IVA%
PVP_BS  = Base × tasaTH          ← lo que el cliente paga
PVP_USD = PVP_BS / tasaBCV        ← USD inflado para el recibo legal
```

---

## 4. Store Zustand

`src/store/useStore.ts` combina slices. El hydration ocurre en `authSlice.fetchInitialData()`.

```
authSlice       → login/logout + fetchInitialData
userSlice       → gestión usuarios del sistema
settingsSlice   → config empresa, tasas, métodos de pago, cierre
productSlice    → CRUD inventario
cartSlice       → carrito POS (en memoria)
saleSlice       → ventas, abonos, anulaciones
invoiceSlice    → facturas de compra
clientSlice     → clientes + credit_limit
quoteSlice      → cotizaciones + convertQuoteToSale
returnSlice     → devoluciones
expenseSlice    → gastos (currency, amountBS, isRecurring)
```

---

## 5. Sistema de Roles

`src/utils/permissions.ts`

```
ADMIN   → Todo
MANAGER → Operación + inventario + gastos + cotizaciones (no config base)
SELLER  → Solo POS + sus ventas/cotizaciones + agregar clientes
VIEWER  → Solo lectura: ventas, facturas, reportes
```

---

## 6. Schema Supabase (estado actual)

| Tabla | Campos clave |
|---|---|
| `settings` | company_name, rif, address, tasa_bcv, tasa_monitor, last_close_date, shift_start, default_margin, default_vat, printer_currency, seller_commission_pct |
| `products` | sku, name, category, stock, min_stock, cost, cost_type (BCV/TH), freight, supplier |
| `clients` | name, rif, phone, address, email, notes, **credit_limit** |
| `sales` | client_id, total_usd, total_ved, payment_method, status, paid_amount_usd, is_credit, user_id, seller_name |
| `sale_items` | sale_id, product_id, quantity, unit_price_usd, cost_unit_usd, product_name_snapshot, sku |
| `payments` | sale_id, amount_usd, method, note |
| `quotes` | number, date, valid_until, client_id, client_name, items (JSONB), total_usd, total_bs, status, user_id, seller_name |
| `expenses` | date, description, amount_usd, **currency** (USD/BS), **amount_bs**, category, payment_method, user_id, seller_name, **is_recurring**, **recurring_id** |
| `users` | id, full_name, email, role, is_active, last_login |
| `suppliers` | name, rif, phone, email, address |
| `invoices` | supplier_id, date_issue, date_due, status, subtotal_usd, total_usd, paid_amount_usd |
| `payment_methods` | name, currency |
| `audit_logs` | action, entity, entity_id, user_id, details (JSONB) |

### ⚠️ Migración pendiente de ejecutar en Supabase

```sql
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS amount_bs NUMERIC,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurring_id TEXT;
```

---

## 7. Archivos Clave

| Archivo | Propósito |
|---|---|
| `src/types/index.ts` | ÚNICA fuente de tipos. Siempre actualizar aquí |
| `src/store/slices/authSlice.ts` | fetchInitialData — el arranque de todo |
| `src/utils/pricing.ts` | Motor bimonetario de precios |
| `src/utils/permissions.ts` | Matriz de permisos por rol |
| `src/utils/ticketGenerator.ts` | PDF tickets + `printQuoteReport()` (PDF A4 cotización) |
| `src/components/layout/TopBar.tsx` | Navbar, dark mode toggle, personalización |
| `src/hooks/useDarkMode.ts` | Hook dark mode (localStorage + clase HTML) |
| `src/index.css` | Tailwind + CSS variables dark mode globales |
| `tailwind.config.js` | `darkMode: 'class'` activo |

---

## 8. Features por Módulo (estado actual)

### ✅ Completado
- **POS** — carrito, checkout, crédito con límite e indicador visual de deuda, tickets WhatsApp/impresión. Catálogo virtualizado/paginado para alto rendimiento (>1000 items).
- **Inventario** — CRUD, alertas stock mínimo
- **Ventas** — historial, abonos crédito, anulación, filtros por vendedor
- **Clientes** — CRM, credit_limit, historial
- **Cotizaciones** — CRUD, estados, descuento por ítem, PDF A4, convertir a venta, autor
- **Gastos** — moneda USD/BS, categorías libres, recurrentes, autor
- **Cierre Turno** — DailyClose con gastos + utilidad neta
- **Comisiones** — cálculo por vendedor
- **Cuentas por Cobrar** — abonos, deudores, WhatsApp
- **Dark Mode** — CSS variables globales, toggle TopBar
- **Personalización TopBar** — ítems pinados por usuario (localStorage)
- **Carga de Facturas IA** — Escaneo OCR + LLM en modal "Cargar Compra" (`Inventory.tsx`) mediante `process-invoice` (Google Gemini Edge Function).

### 🔴 Pendiente
- Notificación al login de gastos recurrentes del día
- Gráfico Gastos vs Ventas en Dashboard
- Categorías de gastos persistidas en Supabase

---

## 9. Cómo agregar un módulo nuevo

1. Crear el tipo en `src/types/index.ts`
2. Crear tabla en Supabase
3. Crear `src/store/slices/nuevoSlice.ts` con `fetchNuevo`, `addNuevo`, `updateNuevo`, `deleteNuevo`
4. Importar y spreadsear en `src/store/useStore.ts`
5. Agregar `await get().fetchNuevo()` al final de `fetchInitialData` en `authSlice.ts`
6. Crear `src/pages/Nuevo.tsx`
7. Agregar ruta en `App.tsx` con `<RoleRoute>`
8. Agregar ítem en `TopBar.tsx`
9. Correr `npx tsc --noEmit`

---

## 10. Ultimo Handover

- Documento: `artefactos/HANDOVER_2026-03-05_POS_SYNC_UX.md`
- Alcance: sincronizacion realtime/POS multi-cliente, rediseño UX movil de POS, fixes de compatibilidad y estabilidad.
- Estado: cambios implementados y compilando; pendiente smoke test funcional A/B en dispositivos reales.
