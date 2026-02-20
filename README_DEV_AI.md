# 🚗 Todo en Ruedas - Sistema POS e Inventario

Sistema de Punto de Venta (POS), control de inventario y facturación diseñado para un entorno bimonetario (USD / VES) con soporte para diferentes tasas de cambio, gestión de usuarios basada en roles (RBAC) y control de márgenes de ganancia.

## 🛠 Stack Tecnológico

*   **Frontend:** React 18, TypeScript, Vite
*   **Estilos:** Tailwind CSS, Lucide React (Iconos)
*   **Enrutamiento:** React Router DOM v6
*   **Gestión de Estado:** Zustand (para manejo global de sesión, configuración, ventas, etc.)
*   **Backend / Base de Datos:** Supabase (PostgreSQL) con Row Level Security (RLS)
*   **Autenticación:** Supabase Auth

---

## 🏗 Arquitectura del Frontend (`/src`)

El código está estructurado en un patrón modular y centralizado:

*   `/components`: Componentes UI reutilizables.
    *   `/layout/Sidebar.tsx`: Navegación principal, renderizada dinámicamente según los permisos del rol.
    *   `RoleRoute.tsx`: Componente de orden superior (HOC) que protege las rutas de React Router basándose en el rol del usuario conectado.
*   `/hooks`: Hooks personalizados (ej. `usePermissions.ts` para evaluar qué puede hacer el usuario actual).
*   `/pages`: Vistas completas de la aplicación (Dashboard, POS, Inventario, Configuración, etc.). Funciona con Lazy Loading (`React.lazy`) desde `App.tsx` para code-splitting.
*   `/store`: Gestión de estado con **Zustand**. Dividido en "slices" lógicos que se combinan en `useStore.ts`:
    *   `authSlice.ts`, `cartSlice.ts`, `saleSlice.ts`, `settingsSlice.ts`, etc.
*   `/types`: Interfaces de TypeScript. **Toda la app usa `index.ts` como única fuente de verdad para los tipos.**
*   `/utils`: Utilidades puras y de negocio.
    *   `pricing.ts`: Lógica matemática de cálculo de precios (muy importante, ver sección de "Lógica de Negocio").
    *   `permissions.ts`: Matriz de permisos por rol.
    *   `ticketGenerator.ts`: Generación de recibos PDF/Impresión.

---

## 🔐 Sistema de Roles (RBAC)

El sistema utiliza una matriz de permisos dura definida en `src/utils/permissions.ts` combinada con políticas RLS (Row Level Security) en Supabase para proteger los datos de forma redundante (Frontend + Backend).

### Roles Existentes:
1.  **ADMIN:** Acceso total. Creado automáticamente la primera vez que se accede a `/setup`. Puede crear otros administradores. Modifica toda la configuración general.
2.  **MANAGER (Gerente):** Operaciones diarias, inventario, reportes, auditoría y control de vendedores. No puede acceder a modificar configuraciones base.
3.  **SELLER (Vendedor):** Operador del POS. 
    *   Solo ve sus propias ventas (no las de otros).
    *   Limitado estrictamente a crear ventas, cotizaciones puntuales y agregar clientes orgánicamente.
    *   No tiene acceso a métricas de la empresa ni inventario profundo.
4.  **VIEWER (Auditor/Contable):** Rol de solo lectura para contadores o personal externo. Solo puede ver reportes y ventas/facturas, sin capacidad de modificar nada en el sistema.

---

## 🧮 Lógica de Negocio Central (Bimonetaria)

La característica más crítica del sistema es el manejo simultáneo de dos tasas de conversión de la moneda local (VES):
*   **Tasa BCV:** Tasa oficial y legal del banco central.
*   **Tasa TH (Monitor/Mercado):** Tasa paralela.

### El "Camuflaje" del Precio (Pricing Engine)
Implementado en `src/utils/pricing.ts`. Los productos se configuran en el inventario bajo uno de dos regímenes: `BCV` o `TH`.

1.  **Producto BCV:**
    *   **PVP ($) =** `Costo` + `Margen %` + `IVA %`.
    *   **PVP (Bs) =** PVP ($) × `Tasa BCV`.
2.  **Producto TH (La Ilusión):**
    El objetivo es cobrar el precio base al valor de la **Tasa TH**, pero reflejar en el recibo legal que el cobro se hizo a **Tasa BCV**, inflando el precio en USD para cuadrar la contabilidad.
    *   **Base:** `Costo` + `Margen %` + `IVA %`.
    *   **PVP (Bs) =** Base × `Tasa TH` (Este es el monto real que el usuario paga).
    *   **PVP ($) a mostrar =** PVP (Bs) / `Tasa BCV`. 

Esta lógica garantiza que la rentabilidad de reposición siempre está cubierta sin importar el tipo de cambio oficial del día, mientras se mantienen recibos legalmente coherentes.

---

## 🗄 Modelo de Datos (Supabase PostgreSQL)

Tablas principales en la base de datos:

*   `users`: Mapeo extendido de `auth.users` de Supabase. Almacena el rol (`ADMIN`, `MANAGER`, etc.).
*   `products`: Catálogo central. Posee triggers asociados a su ID para relacionarlo en ventas e históricos de compras.
*   `sales`: Transacciones del POS. Tiene relaciones con la tabla `users` (columna `user_id` y `seller_name` para auditar quién hizo la venta, esencial para que el SELLER solo vea las propias). Un registro en estado `COMPLETED` afecta automáticamente el stock del producto.
*   `clients`, `suppliers`, `invoices` (cuentas por pagar/compras de mercancía).
*   `settings`: **Tabla "Singleton"**. Un único registro (`id != ''`) que mantiene los datos de la empresa, logo, márgenes por defecto y las Tasas de Cambio (`tasa_bcv`, `tasa_monitor`) utilizadas globalmente por Zustand.
*   `audit_logs`: Trazabilidad inamovible de las acciones delicadas realizadas en la aplicación, generada por Triggers a nivel de BD o insersiones desde el frontend en casos específicos.

---

## 🚀 Flujo de Arranque ("The Cold Boot")

1.  **Setup Inicial:** Si la base de datos no tiene una empresa registrada en `settings`, la app redirige a `/setup` de forma obligatoria. El primer usuario en pasar este flujo obtiene el rol `ADMIN` automáticamente.
2.  **Store Hydration (`fetchInitialData`):** Al hacer login exitoso, `authSlice.ts` lanza una cascada de SELECTs a la base de datos para pre-cargar las tasas de cambio, inventario y configuración base en memoria del navegador usando Zustand. Todas las vistas operan con estos datos en memoria reaccionando increíblemente rápido; las sincronizaciones de guardado operan asincrónicamente con la DB.

---

## 📋 Nota para Modelos IA

*   **Evitar modificaciones a lo ciego en `App.tsx`**: Las rutas están meticulosamente cubiertas con `<RoleRoute>` para evitar Bypass.
*   **Si cambias el Schema de la BD**: Deberás actualizar obligatoriamente `src/types/index.ts`.
*   **Políticas de RLS**: Las políticas RLS en Supabase (como aquellas que obligan a un seller a solo ver sus ventas) deben sincronizarse mentalmente con el renderizado condicional de los botones (ej. En `Sales.tsx`, el botón de anular no se muestra si eres Seller). El frontend es un espejo "User-Friendly", pero la RLS es la barrera final (El Backend mandará Error si hace 'hack' JS al DOM).
