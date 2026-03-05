# Verificación de Correo para Nuevos Usuarios

## Descripción del Problema
Actualmente, cuando un Administrador crea un usuario en el sistema, la cuenta se activa inmediatamente. El requerimiento es que el nuevo usuario deba confirmar y validar su correo mediante un enlace antes de poder acceder, garantizando que el correo sea real y pertenezca a la persona.

## Estrategia con Supabase
Supabase tiene esta funcionalidad construida de forma nativa. Cuando se activa la opción de **"Confirmar Email"**, el método `signUp()` (que ya estamos usando en `userSlice.ts`) cambia su comportamiento:
1. **No inicia sesión automáticamente**: Lo cual es ideal para nosotros, ya que evita que el Administrador que está creando al usuario pierda su propia sesión actual.
2. **Envía un correo de validación**: Supabase envía automáticamente el enlace al correo del nuevo usuario.
3. **Bloquea el acceso**: El usuario no podrá hacer Login hasta que haga clic en ese correo.

## Plan de Implementación

### 1. Configuración Manual Requerida (Por parte del Usuario)
Dado que esto depende de la configuración de seguridad del proyecto en Supabase, el administrador (tú) deberá habilitarlo en el panel de control.

### 2. Modificaciones en el Frontend
- **[MODIFICAR] `src/store/slices/userSlice.ts`**
  - Actualizar el mensaje de éxito en `createUser` para notificar al Administrador que el usuario fue creado, pero que **debe revisar su bandeja de entrada** para activar la cuenta.
  - Asegurarnos de que el flujo maneje correctamente el estado bloqueado si el usuario intenta hacer login antes de confirmar. (Supabase devuelve `Email not confirmed` como error de login, que debemos atrapar y mostrar amigablemente en `authSlice.ts`).

## User Review Required
> [!IMPORTANT]
> Esta característica requiere que vayas a tu panel de **Supabase**:
> 1. Ve a **Authentication** -> **Providers** -> **Email**.
> 2. Asegúrate de activar el interruptor que dice **"Confirm email"** (Confirmar correo).
> 3. También puedes personalizar el mensaje del correo en **Authentication** -> **Email Templates** -> **Confirmation address**.
> 
> ¿Estás de acuerdo con este enfoque nativo para avanzar con los cambios visuales y las alertas correspondientes?
