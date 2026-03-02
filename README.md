# 🚗 Glyph Core — Sistema POS & Administrativo

> Sistema de Punto de Venta, Inventario, Cotizaciones y Control Financiero diseñado para negocios venezolanos que operan en ambiente **bimonetario (USD / VES)**.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)

---

## ✨ Características

### 🛒 Punto de Venta (POS)
- Búsqueda rápida de productos y clientes (renderizados optimizados para >1000 items)
- Ventas al contado y **a crédito** con validación y **visualización de deuda vs límite de crédito**
- Envío de recibo por **WhatsApp** o impresión térmica 80mm
- Descuentos y métodos de pago múltiples
- Conversión automática USD ↔ Bs según tasa BCV/Monitor

### 📦 Inventario
- CRUD de productos con SKU, costo, márgenes y stock
- Alertas de stock mínimo
- Dos regímenes de precio: **BCV** y **TH (Monitor)** — ver [Lógica Bimonetaria](#-lógica-bimonetaria)
- Control de proveedores y facturas de compra
- **Carga Mágica de Facturas con IA (OCR + LLM)**: auto-completado de costos y productos desde fotos/PDF.

### 📋 Cotizaciones
- Crear cotizaciones con descuento por ítem
- Estados: Borrador → Enviada → Aceptada / Rechazada / Vencida
- **PDF A4 profesional** + ticket móvil
- **Convertir cotización en venta** con un clic
- Autor registrado en cada cotización

### � Gastos y Egresos
- Moneda seleccionable: **USD o Bs** (conversión automática)
- Categorías base + **categorías personalizadas** de texto libre
- **Plantillas de gastos recurrentes** (Alquiler, Luz, Agua, Internet…) — registrar con 1 clic
- Autor del gasto + exportar CSV

### 📊 Reportes y Cierre de Turno
- Cierre X / Z con desglose por método de pago
- **Gastos del turno** y **Utilidad Neta** integrados en el cierre
- Dashboard adaptado por rol (ADMIN/MANAGER/SELLER)
- Comisiones de vendedores

### 👥 Control de Clientes y Cuentas por Cobrar
- CRM de clientes con campo **límite de crédito**
- Historial de compras por cliente
- Tabla de deudores con abonos parciales y remisión por WhatsApp

### 🔐 Roles y Permisos (RBAC)
| Rol | Acceso |
|---|---|
| **ADMIN** | Control total — configuración, usuarios, reportes completos |
| **MANAGER** | Operación diaria, inventario, gastos, reportes |
| **SELLER** | Solo POS y sus propias ventas / cotizaciones |
| **VIEWER** | Solo lectura — reportes y facturas |

### 🌙 Dark Mode
- Toggle en la barra de navegación (persiste en `localStorage`)

---

## 🧮 Lógica Bimonetaria

El motor de precios en `src/utils/pricing.ts` soporta dos regímenes:

**Producto BCV:** `PVP_BS = (Costo + Margen + IVA) × tasaBCV`

**Producto TH (Monitor):** El negocio cobra al valor de la tasa paralela pero el recibo refleja la tasa oficial — garantizando rentabilidad de reposición sin contradecir la contabilidad legal.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Estado | Zustand 5 (store modular con slices) |
| Estilos | Tailwind CSS 3 + CSS variables dark mode |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Routing | React Router DOM 7 |
| Iconos | Lucide React |
| Gráficos | Recharts |

---

## � Instalación Local

### Prerrequisitos
- Node.js 18+
- Proyecto en [Supabase](https://supabase.com/) con las tablas configuradas

### Pasos

```bash
# 1. Clonar
git clone <repository_url>
cd glyph-core

# 2. Instalar dependencias
npm install

# 3. Variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase:
# VITE_SUPABASE_URL=https://xxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=tu_anon_key

# 4. Inicializar Base de Datos (Supabase)
# Copia el contenido del archivo `supabase/initial_schema.sql` y pégalo 
# en el SQL Editor de tu proyecto en Supabase. Corre el script para crear las tablas.

# 5. Levantar en desarrollo
npm run dev
# → http://localhost:5173

# 6. Build producción
npm run build
```

### Primera vez (Setup)
Si la base de datos está vacía, la app redirige automáticamente a `/setup` donde se registra la empresa y se crea el primer usuario `ADMIN`.

---

## � Estructura del Proyecto

```
src/
├── App.tsx              ← Rutas con lazy loading + RoleRoute
├── index.css            ← Tailwind + CSS variables dark mode
├── types/index.ts       ← Única fuente de tipos TypeScript
├── store/
│   ├── useStore.ts      ← Zustand: combina todos los slices
│   └── slices/          ← authSlice, saleSlice, quoteSlice, expenseSlice…
├── pages/               ← POS, Dashboard, Inventory, Clients, Quotes, Expenses…
├── components/
│   └── layout/TopBar.tsx← Navbar (dark mode, menú usuario, búsqueda global)
├── hooks/               ← useDarkMode, usePermissions, useSetupCheck
└── utils/
    ├── pricing.ts       ← Motor bimonetario de cálculo de precios
    ├── permissions.ts   ← Matriz de permisos por rol
    └── ticketGenerator.ts ← PDF tickets + cotizaciones A4
```

---

## 🗄️ Tablas Supabase

`settings` · `products` · `clients` · `sales` · `sale_items` · `payments` · `quotes` · `expenses` · `users` · `suppliers` · `invoices` · `payment_methods` · `audit_logs`

---

## 📝 Convenciones

- **Tipos:** siempre en `src/types/index.ts`
- **Typecheck:** `npx tsc --noEmit` antes de cada commit
- **Iconos:** solo de `lucide-react`
- **Notificaciones:** `react-hot-toast`
- **Rutas nuevas:** agregar en `App.tsx` + `TopBar.tsx`

---

*© 2025–2026 Glyph Core. Todos los derechos reservados.*