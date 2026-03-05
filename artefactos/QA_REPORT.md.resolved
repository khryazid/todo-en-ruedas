# QA Report

## Severidad Alta (Bloqueantes)
- **Falla en Validación de Stock Máximo (POS):** El sistema permite al cajero añadir más unidades de un producto al carrito de las que existen realmente en el inventario (ej. subir a 10 unidades cuando el stock es 9), sin emitir ninguna advertencia o bloqueo en tiempo real dentro del POS.
- **Botón "Convertir en Venta" Roto:** En el módulo de Cotizaciones, al hacer clic en el botón inferior "Convertir en Venta" de una cotización existente, la acción falla de manera silenciosa (no redirige al POS ni carga el carrito para efectuar el cobro).

## Media (Visual o Lógico)
- **Faltan Campos en el Formulario de Setup:** Los campos "Margen de Ganancia Global por Defecto" y "IVA por Defecto" no están presentes en el formulario inicial de `/setup`. Se tuvo que navegar a `/settings` para configurarlos manualmente.
- **Campo de Límite de Crédito Ausente:** En el componente de "Nuevo Cliente Rápido" invocado desde el Punto de Venta (POS), no existe un campo para definir el límite de crédito del cliente.
- **Sin Feedback en Borrado Seguro (Inventario):** Al intentar eliminar un producto protegido que ya tiene un historial de ventas (ej. Producto BCV), la base de datos restringe la acción correctamente, pero la UI no muestra ningún mensaje tipo Toast para explicarle al usuario la razón por la que no se puede eliminar.
- **Aviso de Validación Silencioso en Compras:** Al intentar "Procesar Compra" en el inventario, si faltan campos obligatorios como el "Nº Control", el formulario no se envía pero tampoco despliega ningún error visual (texto en rojo o Toast), lo que parece que el botón no funciona.
- **Ausencia de Guardado en POS:** No existe un botón funcional en la vista principal de la caja (POS) para guardar un carrito lleno temporalmente como una Cotización/Presupuesto.

## Baja (UI/UX)
- **Redirección Automática sin Mensaje:** Navegar a `/` o `/login` en una base de datos limpia redirige automáticamente a `/setup`.
- **Destino de Redirección Post-Setup:** Tras completar el setup, la app redirige a `/sales` en lugar del esperado `/dashboard`.
- **Formulario Combinado:** El registro de usuario y la configuración de empresa están combinados en un solo formulario.
- **Falta Aviso Visual de Validación (POS):** Al intentar presionar "REGISTRAR DEUDA" en una venta a crédito sin tener un cliente asignado, la acción se bloquea internamente (lo cual es correcto) pero no se dispara ningún `Toast` ni advertencia DOM clara que notifique al vendedor.
- **Registro Público Oculto:** El enlace para registro público no es visible directamente en la pantalla de login (probablemente intencional por seguridad). Se verificó la creación funcional desde el panel de `Gestión de Usuarios`.

---
## Conclusión Final
**Estado de Testing: 100% Ejecutado (Secciones 1 a 11).**

**Resumen:**
La aplicación *Todo en Ruedas* (Glyph Core) se percibe estable en sus flujos más críticos.
- **Transacciones y Stock:** Los flujos core de facturación al contado/crédito actúan sobre el inventario de manera exacta. El Historial de Ventas permite devolver productos restructurando el stock de manera impecable.
- **Roles:** El RBAC funciona perfectamente limitando las vistas a Vendedores vs Admin.
- **Gastos y Cierres:** El rastreo de caja chica (Gastos) entra directamente en consideración para la 'Utilidad Neta' del Cierre Z, mostrando consistencia matemática. De igual manera, las Deudas permiten abonos parciales funcionales.

**Puntos de Riesgo a Reparar (Alta Severidad):**
Para garantizar una experiencia PROD-READY íntegra, es **urgente** reparar:
1. **Validación de Stock Máximo en POS:** Frenar que el cajero incremente las unidades más allá del stock disponible.
2. **Botón Convertir a Venta:** Reparar la acción en el detalle de la cotización para que transfiera la data al POS, y agregar un botón de acceso directo en el mismo POS para guardar un carrito como cotización.
