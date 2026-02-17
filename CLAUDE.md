# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server (localhost:5173)
npm run build      # TypeScript check + Vite production build
npm run lint       # ESLint (flat config)
npm run preview    # Preview production build
npx tsc --noEmit   # Type-check only (no emit)
```

No test framework is configured.

## Architecture

Venezuelan ERP & POS system with dual-currency support (USD / Bolívares).

**Stack:** React 19 + TypeScript (strict) + Zustand + Supabase + Vite 7 + Tailwind CSS. PWA-enabled.

### State Management (Zustand slices)

Single store in `src/store/useStore.ts` composed from 7 slices in `src/store/slices/`:

| Slice | Responsibility |
|-------|---------------|
| `authSlice` | Login/logout + `fetchInitialData()` (loads all entities on session start) |
| `productSlice` | Product CRUD |
| `cartSlice` | POS cart operations |
| `saleSlice` | Complete/annul sales, credit payments |
| `invoiceSlice` | Purchase invoices, supplier management |
| `clientSlice` | Client CRUD |
| `settingsSlice` | Exchange rates, payment methods, daily close |

**State interface:** `src/store/types.ts` — defines `StoreState` plus typed `SetState`/`GetState` (no `any`).

**Update pattern:** After Supabase mutations, state is updated incrementally (no full refetches). Use `set((state) => ({...}))` for derived updates.

**Selective subscriptions:** Always use `useStore(s => s.specificField)` — never subscribe to the entire store.

### Routing

React Router v7 in `src/App.tsx`. Dashboard and Login are eager-loaded; all other pages are lazy-loaded. Routes are wrapped in `ErrorBoundary`. All routes except `/login` require an authenticated user.

### Supabase

Client singleton at `src/supabase/client.ts`. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

DB columns use **snake_case** — map to **camelCase** in JS (e.g., `total_usd` → `totalUSD`, `date_issue` → `dateIssue`).

## Key Business Logic

- **Dual exchange rates:** BCV (official) and TH/Monitor (parallel). Products declare which rate applies via `costType`.
- **Pricing formula** (`src/utils/pricing.ts`): `cost × (1 + margin%) × (1 + VAT%)`. For TH-cost products, USD price is inflated so that `price × tasaBCV` matches the real Bs price.
- **Credit sales:** Tracked via `isCredit` flag with partial payment support (`paidAmountUSD`, `payments[]`).
- **Purchase invoices:** Freight is prorated across items and updates product costs/stock on save.

## Types

Single source of truth: `src/types/index.ts`. Key types: `Product`, `Sale`, `SaleItem`, `Invoice`, `Payment`, `Client`, `AppSettings`. Currency enums: `CostType = 'BCV' | 'TH'`, `PaymentStatus`, `SaleStatus`.

## Conventions

- **UI language:** Spanish (all labels, toasts, messages)
- **Components:** PascalCase files in `src/pages/` and `src/components/`
- **No path aliases** — use relative imports
- **Styling:** Tailwind utility classes only. Brand color is red (`brand-600: #dc2626`)
- **Error feedback:** `react-hot-toast` for all user-facing messages
- **No git operations** — the user handles all git commands manually
