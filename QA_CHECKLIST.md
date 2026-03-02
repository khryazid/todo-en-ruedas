# Manual de Aseguramiento de Calidad (QA) - Glyph Core

Este documento contiene la lista exhaustiva de funcionalidades y flujos que deben funcionar correctamente en la aplicación **Todo en Ruedas (Glyph Core)**. Sirve como guía paso a paso para pruebas manuales antes de cualquier despliegue a producción.

---

## 🤖 INSTRUCCIONES PARA EL AGENTE DE QA IA

Si eres una IA encargada de verificar que esta aplicación es 100% funcional en un entorno "limpio", debes seguir esciptamente este orden de ejecución operando como un usuario real a través del navegador. 

**Pre-requisitos que debes hacer localmente:**
1. Asegurarte que el `.env` esté correctamente apuntado a una base de datos limpia de pruebas de Supabase.
2. Levantar el proyecto con `npm run dev`.
3. Navegar a `http://localhost:5173`.

**Flujo de Pruebas que DEBES seguir cronológicamente:**
1. **Registro/Auth Base:** Dado que Supabase Auth requiere registro, crea un usuario base (ej: `admin@test.com` / `Kh123123!`). Inicia sesión.
2. **Setup Lock-in:** Comprueba que tras tu primer login exitoso, al no haber empresa, la app te lanza obligatoriamente a `/setup`. Ejecuta y llena todos los datos como un humano ("Todo En Ruedas CA", "J-12345678").
3. **Flujo Cero a Ventas (Hero Path):**
    - Crea al menos 2 categorías, luego ve a `Inventario` y crea un **Producto BCV** y un **Producto TH** con stocks iniciales (Ej: 10 unds c/u).
    - Navega al `POS`. Simula el checkout de 1 unidad al contado. Valida que el descuento de stock funcione.
    - Simula el checkout de otra unidad **A Crédito**. Valida el alert nativo del DOM y crea un `Cliente Rápido` con "Límite: $50". Haz otro intento, completa el recibo con deuda remanente.
4. **Roles Simulados:** Abre una pestaña de incógnito, registra un usuario `cajero@test.com`. Asígnale rol `SELLER` desde el Panel de Control del primer usuario (`ADMIN`). Entra con el `SELLER` y verifica que NO pueda entrar a la pestaña Configuración.
5. **Reporte de Fallos:**
    - Mientras iterás los tests de este documento, por cada error (consola roja, pantallazo de DOM blanco, cuelgue en un botón), documéntalo en un archivo de artefacto `QA_REPORT.md`.
    - Agrupa los errores bajo: **"Severidad Alta (Bloqueantes)"**, **"Media (Visual o Lógico)"**, **"Baja (UI/UX)"**.

---

## � 0. Instalación y Primer Uso (Onboarding / Setup)

El proceso de Onboarding es el primer punto de contacto para una instancia de la aplicación "en blanco" (Base de datos limpia sin configuraciones previas).

- [ ] **Redirección Autenticada al Setup:**
  - Al levantar la app y entrar a `localhost` o la URL del host por primera vez, el sistema detecta que no hay variables predeterminadas (Empresa).
  - De todas formas, requiere que el Super Usuario (ADMIN) sea creado en Firebase/Supabase Auth primero (la pantalla de login principal se sobrepone si no hay sesión activa).
- [ ] **Pantalla de Registro de la Empresa (`/setup`):** 
  - Una vez autorizado el primer correo electrónico, el middleware de enrutado envía automáticamente a la vista `/setup` (Asistente de Configuración).
- [ ] **Validación y Completado de Perfil Empresarial:**
  - Llenar los campos requeridos: **Nombre de la Empresa**, **Tipo de RIF (J, V, E...)**, **RIF Numérico** y **Dirección**.
  - Si los datos están incompletos, el botón "Guardar Configuración Inicial" permanece deshabilitado u arroja error de validación.
- [ ] **Configuraciones Numéricas Base:**
  - Establecer el porcentaje del **Margen de Ganancia Global por Defecto** (ej. 30%).
  - Establecer el **IVA por Defecto** (ej. 16%).
- [ ] **Carga Exitosa y Bloqueo Posterior:**
  - Una vez guardados los datos con éxito en la tabla `settings`, la aplicación redirige al `/dashboard`.
  - Intentar navegar manualmente hacia la URL `/setup` posterior a esto, expulsa al usuario al dashboard automáticamente, validando la directiva (SetupLock).
- [ ] **Asignación del Primer Usuario (Permisos):**
  - Aquel primer usuario que gatilló y llenó el `/setup` se inserta automáticamente en la tabla `users` con el rol supremo `ADMIN`.
  - Este usuario estrena la potestad de ver la pestaña de `Configuración` y `Usuarios` en el menú lateral de inmediato.

---

## �🔐 1. Autenticación y Autorización (Auth & Roles)
- [ ] **Login:** Iniciar sesión con credenciales válidas redirige al Dashboard o POS (según el rol).
- [ ] **Errores de Login:** Credenciales inválidas muestran un mensaje de error claro ("Credenciales incorrectas").
- [ ] **Protección de Rutas:** Un usuario no autenticado que intente acceder a `/pos` o `/dashboard` es redirigido a `/login`.
- [ ] **Roles (RBAC):**
  - **ADMIN:** Puede ver y editar todas las secciones, incluyendo Configuración y Usuarios.
  - **MANAGER:** Puede ver Dashboard, Inventario, Compras, Ventas, Gastos. No puede editar Usuarios ni Configuración raíz.
  - **SELLER:** Solo tiene acceso al Punto de Venta (POS), Clientes, Cotizaciones y sus propias Ventas/Gastos. No ve reportes globales ni inventario detallado.
  - **VIEWER:** Solo lectura. Puede ver Dashboard y reportes, pero los botones de "Crear", "Editar" o "Eliminar" están ocultos o desactivados.
- [ ] **Logout:** Cerrar sesión limpia el estado (`Zustand`) y redirige al login.

---

## 🛒 2. Punto de Venta (POS)
### 2.1 Catálogo y Carrito
- [ ] **Búsqueda Avanzada:** Buscar productos por Nombre o SKU filtra la lista en tiempo real.
- [ ] **Paginación Virtual:** El catálogo carga eficientemente incluso si hay más de 1000 productos, limitando la vista inicial a 100 elementos sin colgar el navegador.
- [ ] **Agregar al Carrito:** Clic en un producto lo añade al carrito lateral. Clic repetido aumenta la cantidad.
- [ ] **Stock Mínimo/Insuficiente:** Intentar agregar más cantidad de la que hay en stock muestra una advertencia ("⚠️ Stock insuficiente").
- [ ] **Modificar Cantidad:** Los botones `+` y `-` en el carrito ajustan la cantidad correctamente.
- [ ] **Eliminar Producto:** El botón de papelera elimina el producto específico del carrito.
- [ ] **Vaciar Carrito:** El botón inferior vacía completamente el carrito actual.

### 2.2 Cálculos y Totales
- [ ] **Descuentos:** Aplicar un descuento (%) actualiza instantáneamente el Subtotal y ambos totales (USD y VES/BS).
- [ ] **Conversión Bimonetaria:** El "Total a Pagar" en Bs (VES) se calcula en base al Total USD multiplicado por la tasa BCV del día registrada en configuración.

### 2.3 Selección de Cliente
- [ ] **Creación Rápida:** Botón "Nuevo Cliente Rápido" permite agregar uno nuevo desde el modal e inmediatamente lo selecciona para la venta.
- [ ] **Búsqueda Inteligente:** Buscar cliente por nombre o cédula/RIF y seleccionarlo de la lista.
- [ ] **Remoción del Cliente:** Clic en la "X" al lado del cliente asignado lo remueve del carrito.

### 2.4 Checkout (Cobro)
- [ ] **Modal de Checkout:** Muestra correctamente el total en USD y Bs. El método de pago elegido funciona según lo configurado (Efectivo, Pago Móvil, Zelle, etc).
- [ ] **Venta a Crédito:** Seleccionar la opción de crédito con un Cliente **sin límite de crédito** establecido lo permite.
- [ ] **Validación de Límite de Crédito:**
  - Si el cliente tiene un límite (ej: $50) y la suma de su "Deuda Actual" + el "Nuevo Crédito" supera $50, el sistema bloquea la venta con una alerta detallada.
  - El modal de Checkout muestra visualmente el límite en azul y la deuda actual (en verde si cabe, en rojo si compromete el límite).
- [ ] **Abonos Iniciales:** Si la venta es de $100 y el cliente paga $40 (Abono), la deuda registrada y guardada debe ser de $60.

### 2.5 Post-Venta
- [ ] **Descuento de Stock:** Tras completar el checkout, las cantidades vendidas se descuentan automáticamente del módulo de `Inventario`.
- [ ] **Impresión Térmica:** El botón de "IMPRIMIR RECIBO" genera un modal visible e imprime el layout en 80mm correctamente adaptando el formato USD/BS. Productos bajo régimen `TH` inflan su valor impreso en USD según la tasa paralela/BCV.
- [ ] **Envío WhatsApp:** El botón "ENVIAR POR WHATSAPP" formatea el texto y levanta `api.whatsapp.com` pre-llenando el número del cliente seleccionado.

---

## 📦 3. Inventario (Catálogo)
- [ ] **Crear Producto:** Crear un nuevo producto llena la lista de Categorías, el Costo Inicial y permite definir si el precio se pauta bajo **Tasa BCV** o **Tasa TH (Camuflaje)**.
- [ ] **Búsqueda por Proveedor o Nombre**
- [ ] **Stock Bajo:** Los productos cuya cantidad ≤ "Stock Mínimo", se muestran con la advertencia de stock bajo.
- [ ] **Edición:** Editar un producto permite ajustar precios, costeletes, fletes o corregir nombres temporalmente.
- [ ] **Borrado Seguro:** Un producto sin historial de ventas puede borrarse. Alguien que intente borrar un producto con ventas previas recibe un error pidiendo "Bajar el stock a 0 u Ocultarlos".

---

## 🧾 4. Compras (Módulo Facturas)
- [ ] **Registro Manual:** Es posible ingresar una nueva compra manualmente, seleccionar Ítems (Productos nuevos o existentes), asentar las cantidades, Flete y Mermas.
- [ ] **Actualización en Cascada (El Core):** Al completar la factura, el `Costo Promedio (o Último)`, la cantidad en `Stock` de TODOS los productos ingresados en ella y el Flete prorrateado se actualizan mágicamente en la BBDD global.
- [ ] **Escaneo con Inteligencia Artificial:** Subir una imagen JPG/PNG levanta la `Edge Function Process-Invoice` y el LLM parsea automáticamente el Proveedor, Fecha, y los montos.
- [ ] **Pago de Proveedor:** Entrar a una factura de "Crédito a Proveedor" y hacer Abonos hasta saldarla (Total de deuda).

---

## 📄 5. Cotizaciones (Presupuestos)
- [ ] **Estructura Similar al POS:** Agregar productos. Aplicar descuentos específicos (por ítem, a diferencia del POS que es global).
- [ ] **Expiración:** Posibilidad de darle "X días" de vigencia a una cotización.
- [ ] **Impresión A4:** Las Cotizaciones tienen un comprobante PDF (tamaño carta / A4) estético, detallado.
- [ ] **Conversión Rápida (1-Click):** Desde el menú principal "Ventas -> Cotizaciones", transformar una cotización "APROBADA" directamente a "NUEVA VENTA", llevando todos los artículos al carrito del POS instantáneamente.
- [ ] **Listado Dinámico:** Poder marcarlas como (DRAFT, ENVIADA, ACEPTADA o RECHAZADA).

---

## 📝 6. Historial de Ventas
- [ ] **Listado Principal:** Ver todas las ventas hechas hoy/semana/meses pasados ordenados por Fecha con sus status (COMPLETED, PARTIAL, CANCELLED).
- [ ] **Filtros por Vendedor:** Un `ADMIN` puede ver las ventas de "Juan", mientras que Juan (SELLER) sólo ve las suyas.
- [ ] **Ver Detalles / Re-imprimir:** Abrir los "Detalles" de ventas pasadas muestra exactitud en los items exactos adquiridos. Botón "Re-Imprimir Ticket".
- [ ] **Anulaciones (Refills):** Anular una factura cancela su ingreso comercial y le DEVUELVE las unidades exactas vendidas al módulo de `Inventario`.

---

## 💰 7. Cuentas por Cobrar (Deudas)
- [ ] **Listado de Morosos:** Todas las ventas bajo el estado `PENDIENTE` o `PARCIAL` aparecen listadas explícitamente.
- [ ] **Abonar:** Entrar al "Detalle" de una deuda y sumar un pago ("$20 por Zelle"). Verificar que la "Deuda Remanente" se debite correctamente. Si el pago saldo el 100%, su estado pasa a `COMPLETO` y desaparece del listado de cuentas.

---

## 💸 8. Gastos (Egresos y Egresos Recurrentes)
- [ ] **Moneda Dual:** Ingresar gastos con Moneda Origen (Ej: un gasto de PAGO MOVIL por "150 BS"). El sistema toma al vuelo la `Tasa BCV` actual, calcula que son X `USD`, y en BBDD salva la cantidad en divisas con una "nota de la moneda original" para los reportes gerenciales.
- [ ] **Gasto Fijo / Único:** Registrar la Compra de Bombillos (Varios / $15 USD).
- [ ] **Plantillas Recurrentes:** Un "MANAGER/ADMIN" registra [Nómina Asistentes] como Plantilla Recurrente los "28 de Cada Mes" de "$200".
- [ ] **Liquidación:** Pagar o "Asentar" esa Nómina en el día a día para que entre al arqueo contable.

---

## 📊 9. Cierre Diario (Daily Close / Cierres de Turno)
El cierre de caja suma y compara todas las mecánicas bimonetarias y métodos en reportes **Z** y **X**.
- [ ] **Reporte X vs Z:** Generar un ticket "X" sin cerrar el día, imprimir, funciona normal. Generar "Reporte Z" totaliza el ciclo comercial y corta la base de datos hasta "Hoy".
- [ ] **Ingresos Brutos:** Cuenta los Totales USD ganados en ventas pagadas al 100% y en cobro de deudas atrasadas (abonos).
- [ ] **Egresos o Pagos del Día:** Todos los Gastos cargados AL DÍA EN CURSO (que no son plantillas sueltas sino pagadas) se suman.
- [ ] **Utilidad / Balance de Caja Neta:** (Ingresos Brutos) - (Gastos Registrados) debe estar igualado.
- [ ] **Desglose de Caja FÍSICA:** Efectivo USD ($200), Zelle ($150), Biopago Bs ($35) para un cuadre por medios de pago.

---

## 📊 10. Dashboard (Métricas en vivo)
- [ ] **Gráfica de Ventas Semanal:** Un line-chart con los ingresos acumulados de los últimos 7 días.
- [ ] **Proyección de Inventario:** Inversión total (costo de productos guardados en almacén) vs Rentabilidad (Posible total a ganar vendiéndolos al 100%).
- [ ] **Top Vendedores / Comisiones:** El Dashboard "MANAGER" lista a los vendedores que más vendieron hoy.
- [ ] **Top Clientes & Productos:** Ranked Lists actualizables por performance (Los 5 mejores artículos rotando y los 5 que llevan más tiempo quietos sin salir del almacén).

---

## ⚙️ 11. Configuración del Sistema (Settings)
- [ ] **Parametros Generales:** Perfil de empresa (Nombre, Cédula / RIF C.A). Logo.
- [ ] **Tasas Activas:** Edición manual en vivo de TASA BCV (oficial) y TASA TH (Paralela). Guardar emite un aviso local y repercute instantáneo en el POS si hay una ventana paralela.
- [ ] **Agregador de Métodos de Pago:** El Administrador puede habilitar "Reserve", "Binance Pay" desde allí manualmente.

---
**FIN DEL DOCUMENTO DE ASSURANCES.**
Si llegas hasta este punto, el sistema puede considerarse estable y "Prod-Ready".
