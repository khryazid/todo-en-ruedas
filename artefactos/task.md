# Checklist: Validación de Correos

## Pending
- [x] **Configuración Supabase** — Notificar al usuario que active "Confirm Email".
- [x] **Alertas de UI (userSlice.ts)** — Modificar el toast en `createUser` para indicar que se envió el enlace de validación.
- [x] **Alertas de UI (authSlice.ts)** — Capturar el error específico de Supabase cuando un usuario intenta acceder sin confirmar su correo, brindando un mensaje de error claro en pantalla.
