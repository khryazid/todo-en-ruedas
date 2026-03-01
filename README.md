# 🚗 Todo en Ruedas - Sistema Administrativo y POS

Sistema completo de Punto de Venta (POS), Inventario, Control de Caja y Facturación diseñado para la administración eficiente de negocios. Construido con **React**, **TypeScript**, **Zustand** y potenciado por **Supabase** para una gestión de datos rápida, segura y en tiempo real.

---

## 🚀 Características Principales

### 🛒 **Punto de Venta (POS) Integrado**
- Interfaz fluida y diseñada para uso rápido (búsqueda de clientes y productos veloz).
- Soporte para **Ventas al Contado y Ventas a Crédito (Fiado)**.
- Integración inmediata para el **Envío de Recibos por WhatsApp** o impresión térmica (formato 80mm).
- Manejo inteligente de conversiones automáticas de moneda ($ USD a Bs.) mediante la Tasa de Cambio (BCV).

### 📦 **Gestión de Inventario**
- Control detallado de stock y actualización en tiempo real al concretarse ventas.
- Costeo de productos (Precio de Compra) y sugerencia de Precio de Venta (PVP).
- Soporte para categorías y marcas, facilitando reportes detallados y búsquedas.

### 👥 **Roles y Permisos Múltiples (RBAC)**
- **ADMIN**: Acceso ilimitado al sistema, configuraciones globales y creación de usuarios.
- **MANAGER**: Puede modificar inventario, gestionar clientes, procesar ventas y ver historial general. 
- **SELLER (Vendedor)**: Modo restringido. Solo evalúa sus propias ventas, comisiones (dashboard adaptado) y gestiona el POS temporalmente. No ve costos.
- **VIEWER (Contabilidad)**: Modo solo lectura para fines de auditoría, balances y Cuentas por Cobrar.

### 💵 **Control Financiero y Caja**
- Tablero de Cuentas por Cobrar interactivo: Filtros de deudores, abonos parciales, remisión directa de recibos de deuda a WhatsApp y control de cartera morosa.
- Cierres de Caja (Corte X / Z) minuciosos y desglose por método de pago.
- Sistema multicaja y registro histórico de turnos operativos, sincronizado al instante con la base de datos de flujo de caja.

### ⚙️ **Configuración Avanzada**
- Sincronización continua con **Supabase**, utilizando políticas de seguridad estricta RLS (*Row Level Security*) por tenant/compañía (en arquitecturas preparadas).
- Tasas de cambio configurables e historia de parámetros tributarios (IVA, Monedas base).

---

## 🛠️ Tecnologías Utilizadas

- **Frontend Core:** React 18, TypeScript, Vite.
- **Estado Global:** Zustand (store modular).
- **Estilos y UI:** Tailwind CSS, Lucide React (Íconos).
- **Backend y BD:** Supabase (Auth, PostgreSQL, Row Level Security - RLS).
- **Alertas y Utilidades:** React Hot Toast, utilidades personalizadas de impresión DOM-CSS y generación WhatsApp.

---

## 📦 Instalación y Despliegue Local

1. **Clonar el repositorio:**
   ```bash
   git clone <repository_url>
   cd todo-en-ruedas
   ```

2. **Instalar Dependencias:**
   Asegúrate de tener [Node.js](https://nodejs.org/) instalado.
   ```bash
   npm install
   ```

3. **Configuración de Variables de Entorno (Supabase):**
   Crea un archivo `.env` en la raíz del proyecto y agrega tus credenciales del panel de Supabase:
   ```env
   VITE_SUPABASE_URL=tu_url_de_supabase
   VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
   ```

4. **Despliegue Local (Desarrollo):**
   ```bash
   npm run dev
   ```
   El entorno se levantará en `http://localhost:5173`. Para compilar usa `npm run build`.

---

## 🔒 Estructura y Estándares Críticos

El sistema se enfoca en estricto tipado estático para garantizar la integridad de los datos financieros. Todo cambio en utilidades, stores (`useStore`) o hooks globales está sometido a una validación profunda de Typescript (`tsc -b && vite build`) impidiendo _silent-bugs_ en el POS o historial:

- **src/store**: División en **Slices** lógicos (`authSlice`, `saleSlice`, `inventorySlice`, `cashRegisterSlice`) inyectados en un store consolidado para escalabilidad suprema. Los tipos unificados se hallan en `types.ts`.
- **src/pages**: Contenedores principales (POS, Cuentas por Cobrar, Dashboard, Inventario) con protección Role-Based (RoleRoute).
- **Supabase RLS**: Los privilegios se resuelven de forma cruzada (Frontend → `role` de `users` local, Backend → `auth.users` y triggers de RLS postgresql).

---

## 📝 Script de Cierre Diario
El proyecto está facultado tanto para emitir Facturación física local para tickets, cómo para exportar resúmenes por turnos, facilitando la auditoría de ventas separada de Abonos a cartera vencida (Cuentas por Cobrar separadas del flujo de venta de inventario para no reportar doble ganancia real).

*© [Año Actual] Todo en Ruedas POS. Todos los derechos reservados.*