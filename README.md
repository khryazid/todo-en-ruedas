# 🛒 Todo en Ruedas - Sistema ERP & POS (PWA)

![Status](https://img.shields.io/badge/Estado-Producción_Local-green)
![Version](https://img.shields.io/badge/Versión-1.0.0-blue)
![Stack](https://img.shields.io/badge/Tech-React_|_TypeScript_|_Zustand-informational)

Sistema integral de Planificación de Recursos Empresariales (ERP) y Punto de Venta (POS) diseñado específicamente para el mercado venezolano, con manejo avanzado de **Inventario Multimoneda** y **Facturación Híbrida**.

## 🧠 Lógica de Negocio y Características

El sistema resuelve la complejidad de operar con dos monedas (Bolívares y Dólares) simultáneamente:

### 1. 💱 Motor de Precios Dinámico (Dual Currency)
A diferencia de los POS tradicionales, este sistema maneja costos indexados según su origen:
* **Costo BCV vs. Monitor:** Al cargar una factura de proveedor, se define si la mercancía se pagó a tasa oficial (BCV) o paralela.
* **Cálculo Automático:** El sistema normaliza internamente todos los costos a una base estándar en USD para calcular márgenes de ganancia reales, pero proyecta los precios finales en Bs según la tasa del día configurada.
* **Actualización en Vivo:** Al cambiar la tasa en `Configuración`, todos los precios en Bolívares del inventario se recalculan instantáneamente sin modificar los costos base en divisas.

### 2. 📦 Gestión de Inventario Inteligente
* **Carga de Facturas (Compras):** Ingreso de mercancía detallada con cálculo de *Costo + Flete Prorrateado*.
* **Historial de Proveedores:** El sistema "recuerda" el último costo de compra de cada producto por proveedor.
* **Alertas de Stock:** Indicadores visuales para productos agotados (Rojo) o por debajo del mínimo (Naranja).

### 3. 🏪 Punto de Venta (POS)
* **Interfaz Optimizada:** Diseño de alto contraste (Rojo/Blanco) para lectura rápida.
* **Venta Rápida:** Búsqueda por SKU o Nombre con validación de stock en tiempo real.
* **Tickets Térmicos:** Generación de comprobantes de 80mm optimizados para impresoras térmicas (X/Z y Factura de Venta).
    * *Nota Técnica:* Usa una estrategia híbrida (Iframe en PC / Popup en Móvil) para garantizar la impresión correcta.

### 4. 💼 Finanzas y Cuentas por Pagar
* **Gestión de Deuda:** Rastreo de facturas de proveedores pendientes (`PENDING`) con fechas de vencimiento.
* **Abonos Parciales:** Registro de pagos a cuenta sobre facturas de crédito.
* **Cierre de Caja:** Arqueo diario con desglose por método de pago (Efectivo, Zelle, Pago Móvil, etc.).

---

## 🛠️ Stack Tecnológico

El proyecto está construido priorizando la velocidad, el tipado estricto y la persistencia local.

| Tecnología | Propósito |
|------------|-----------|
| **React 18** | Biblioteca de UI basada en componentes. |
| **TypeScript** | Seguridad de tipos para evitar errores de cálculo financiero (Interfaces en `src/types`). |
| **Vite** | Empaquetador de módulos ultrarrápido. |
| **Zustand** | Gestión de Estado Global. Reemplaza a Redux/Context por su simplicidad. |
| **Zustand Persist** | **Persistencia de Datos:** Guarda automáticamente todo el estado (`store`) en `localStorage`. Esto permite que la app funcione **Offline** y mantenga los datos al cerrar el navegador. |
| **Tailwind CSS** | Estilizado utilitario para diseño responsivo rápido. |
| **Lucide React** | Iconografía ligera y moderna. |

---

## 📂 Estructura del Proyecto

La arquitectura sigue un patrón modular para facilitar la escalabilidad:

```text
src/
├── components/       # Componentes de UI reutilizables
│   └── layout/       # Elementos estructurales (Sidebar, Layout)
├── pages/            # Vistas principales (Rutas de la App)
│   ├── Dashboard.tsx # KPIs y Analítica
│   ├── POS.tsx       # Caja y Ventas
│   ├── Inventory.tsx # Gestión de Productos
│   └── ...
├── store/            # Lógica de Estado (El "Cerebro")
│   └── useStore.ts   # Store de Zustand (Acciones y Estado)
├── types/            # Definiciones de Tipos (TypeScript)
│   └── index.ts      # Interfaces centrales (Product, Sale, Invoice)
├── utils/            # Funciones Puras Auxiliares
│   ├── pricing.ts    # Fórmulas de cálculo de precios e impuestos
│   └── ticketGenerator.ts # Generación de HTML para impresión
├── App.tsx           # Configuración de Rutas
└── main.tsx          # Punto de entrada

## 🚀 Instalación y Despliegue

Sigue estos pasos para correr el proyecto en tu computadora:

### Requisitos Previos
* **Node.js** (Versión 16 o superior)
* **npm** (viene con Node.js) o **yarn**

### Pasos para Ejecutar Localmente

1.  **Clonar el repositorio:**
    ```bash
    git clone [https://github.com/tu-usuario/todo-en-ruedas.git](https://github.com/tu-usuario/todo-en-ruedas.git)
    cd todo-en-ruedas
    ```

2.  **Instalar dependencias:**
    Descarga las librerías necesarias (React, Vite, Tailwind, etc.).
    ```bash
    npm install
    ```

3.  **Iniciar en modo desarrollo:**
    Esto abrirá la app en `http://localhost:5173` para que puedas programar y ver cambios en vivo.
    ```bash
    npm run dev
    ```

4.  **Compilar para Producción:**
    Cuando quieras subir la app a un hosting (como Vercel o Netlify), ejecuta:
    ```bash
    npm run build
    ```
    Esto creará una carpeta `/dist` optimizada y ligera.

---

## 💾 Copias de Seguridad (Backup)

⚠️ **IMPORTANTE:** Esta aplicación es **"Local-First"**.
Esto significa que los datos (ventas, inventario, configuración) se guardan en el **Navegador (LocalStorage)** de la computadora donde se usa. **NO** hay una base de datos en la nube (por ahora).

**Protocolo de Seguridad:**
1.  Ve a la sección **Configuración** (`/settings`).
2.  Haz clic en **"Descargar Respaldo"**.
3.  Guarda el archivo `.json` en un pendrive o en la nube (Google Drive/Dropbox) diariamente.
4.  Si cambias de computadora o se borra el caché, usa **"Restaurar Copia"** con ese archivo.

---

## 📄 Licencia y Derechos

Este proyecto es software propietario desarrollado exclusivamente para **Todo en Ruedas C.A.**

* **Desarrollador:** Khristian Ali
* **Año:** 2025
* **Uso:** Prohibida su distribución o venta sin autorización.

---

### 🐜 Solución de Problemas (Troubleshooting)

**Error: "Pantalla Blanca" al imprimir en celular**
* **Solución:** Asegúrate de tener habilitadas las "Ventanas Emergentes" (Pop-ups) en el navegador de tu móvil. El sistema usa una pestaña nueva temporal para garantizar que el ticket se renderice correctamente antes de imprimir.

**Error: `npm run build` falla por variables no usadas**
* **Solución:** Revisa tu archivo `tsconfig.json` y asegúrate de tener estas reglas en `compilerOptions`:
    ```json
    "noUnusedLocals": false,
    "noUnusedParameters": false
    ```