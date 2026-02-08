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

Instalación y Despliegue
Requisitos Previos
Node.js (v16 o superior)

npm o yarn

Pasos para Ejecutar
Clonar el repositorio:

Bash
git clone [https://github.com/tu-usuario/todo-en-ruedas.git](https://github.com/tu-usuario/todo-en-ruedas.git)
Instalar dependencias:

Bash
npm install
Iniciar en modo desarrollo:

Bash
npm run dev
Compilar para producción:

Bash
npm run build
💾 Copias de Seguridad (Backup)
Dado que el sistema es "Local-First" (los datos residen en el dispositivo del usuario), se implementó un sistema de respaldo manual en la sección Configuración:

Exportar: Genera un archivo .json con toda la base de datos (Ventas, Productos, Configuración).

Importar: Permite restaurar el sistema en otro dispositivo o tras borrar el caché del navegador.