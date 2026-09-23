# INFORME DE AUDITORÍA DE SEGURIDAD DE APLICACIONES (AppSec)
**Proyecto:** Todo en Ruedas — Sistema de Gestión Empresarial y POS  
**Arquitectura:** JAMstack (React/Vite) + Supabase BaaS (PostgREST, Auth, PostgreSQL RLS, Deno Edge Functions)  
**Fecha:** 2026-09-22  
**Clasificación:** Confidencial / Auditoría de Seguridad Defensiva  
**Rol Auditor:** Principal Application Security Engineer (AppSec)  

---

## 1. Matriz de Vulnerabilidades (CVSS v3.1)

| ID | Vulnerabilidad | Componente Afectado | Vector CVSS v3.1 | Score | Severidad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | **Bypass de RBAC / CRUD Irrestricto en PostgREST:** Tablas críticas (`suppliers`, `products`, `sales`, `invoices`, `expenses`, `cash_ledger`) permiten acceso total a cualquier usuario autenticado (`SELLER`/cajero). | PostgreSQL RLS (`schema.sql`) | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H` | **8.8** | **High** |
| **VULN-02** | **Broken Function-Level Access Control (BFLAC) & Resource Exhaustion (DoS):** La Edge Function `process-invoice` no valida rol del usuario (`SELLER`/`VIEWER` pueden invocarla) ni limita el tamaño de `imageBase64`. | Edge Function (`process-invoice/index.ts`) | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:H` | **7.1** | **High** |
| **VULN-03** | **Fuga Crítica de Clave de API de Gemini por Query Parameter y Respuesta de Error 500:** `GEMINI_API_KEY` se envía en la URL y los fallos de red reflejan `(error as Error).message` directo al cliente. | Edge Function (`process-invoice/index.ts`) | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N` | **6.5** | **Medium** |
| **VULN-04** | **Exposición Pública No Autenticada de Configuración Empresarial:** La política `"Allow anon read settings"` permite a clientes sin credenciales leer márgenes, comisiones y RIF. | PostgreSQL RLS (`schema.sql`, `restrict_rls_admin_tables.sql`) | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N` | **5.3** | **Medium** |
| **VULN-05** | **Exposición Masiva de PII de Clientes y Proveedores:** Descarga indiscriminada de cédulas/RIF, teléfonos, correos y acuerdos de precios en el arranque (`authSlice.ts`) y PostgREST abierto. | Supabase Client / PostgREST (`clients`, `suppliers`) | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N` | **6.5** | **Medium** |
| **VULN-06** | **Suplantación e Inyección de Auditoría (Audit Log Spoofing):** Política `WITH CHECK (true)` en `audit_logs` permite a cajeros forjar logs de administradores con IPs y acciones arbitrarias. | PostgreSQL RLS (`restrict_rls_admin_tables.sql`) | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N` | **6.5** | **Medium** |
| **VULN-07** | **Desincronización de Permisos Manager vs RLS:** `permissions.ts` faculta a `MANAGER` a crear usuarios, pero RLS en `users` solo admite `ADMIN`, provocando fallos operativos no controlados. | Frontend vs Backend (`permissions.ts`, `users` RLS) | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:L` | **4.6** | **Medium** |

---

## 2. Análisis Técnico Detallado

### 2.1. Row Level Security (RLS) en Tablas Críticas
Al auditar `restrict_rls_admin_tables.sql` contra `schema.sql`:

1. **`suppliers` (Proveedores):**
   - **Estado:** La migración `restrict_rls_admin_tables.sql` **no incluye** la tabla `suppliers`.
   - **Regla activa:** `Allow authenticated users full access on suppliers` (`FOR ALL TO authenticated USING (true) WITH CHECK (true)`).
   - **¿Puede un usuario 'cajero' (SELLER) leer o modificar?:** **SÍ, acceso total (CRUD).** Un cajero puede enviar `PATCH` o `DELETE` directamente a `/rest/v1/suppliers` y modificar cuentas de pago o eliminar proveedores, a pesar de que el frontend oculta la ruta `/suppliers`.
   - **¿Cliente anónimo?:** Bloqueado por `TO authenticated`.

2. **`settings` (Configuración del Sistema):**
   - **Estado:** La migración endureció la escritura (`current_user_role() = 'ADMIN'`), pero **no revocó** la política previa:
     ```sql
     CREATE POLICY "Allow anon read settings" ON public.settings FOR SELECT TO anon USING (true);
     ```
   - **¿Cliente anónimo?:** **SÍ puede leer.** Con la clave pública anónima (`anon key`), cualquier atacante externo puede extraer `/rest/v1/settings` obteniendo márgenes de ganancia (`default_margin`, `margin_mayorista`, `margin_especial`), porcentaje de comisión a vendedores (`seller_commission_pct`), RIF y dirección fiscal.
   - **¿Usuario 'cajero'?:** Puede leer toda la información comercial y financiera sensible de la empresa.

3. **`users` (Roles y Credenciales):**
   - **Estado:** La lectura está abierta a todos los usuarios autenticados:
     ```sql
     CREATE POLICY "Allow authenticated users to read users" ON public.users FOR SELECT TO authenticated USING (true);
     ```
   - **¿Usuario 'cajero'?:** Puede enumerar a todos los empleados, administradores, correos y fechas de último acceso (`last_login`). No puede modificar registros vía PostgREST directo, pero la función auxiliar `current_user_role()` **no verifica** si la cuenta está activa (`is_active = true`), permitiendo que un usuario suspendido conserve sus facultades mientras su JWT siga vigente.

4. **`audit_logs` (Trazabilidad):**
   - **Estado:**
     ```sql
     CREATE POLICY "Allow authenticated to insert audit_logs" ON public.audit_logs
       FOR INSERT TO authenticated WITH CHECK (true);
     ```
   - **¿Usuario 'cajero'?:** Puede insertar cualquier registro sin validación (`WITH CHECK (true)`). No se valida `user_id = auth.uid()`. El atacante puede registrar eventos falsos atribuyéndoselos a un Administrador (`user_email = 'admin@empresa.com'`) o contaminar la base de datos con falsos positivos.

---

### 2.2. Edge Function `process-invoice` (`index.ts`)

1. **Validación JWT de Supabase Auth:**
   - Realiza la comprobación criptográfica mediante `supabase.auth.getUser()`.
   - **Deficiencia:** No comprueba el estado del usuario en la base de datos (`public.users.is_active`).

2. **Verificación del Rol del Emisor (BFLAC):**
   - **Omisión crítica:** No consulta el rol del usuario autenticado. En el frontend, la ruta `/invoices` está prohibida para cajeros (`SELLER`), pero cualquier token de cajero o visualizador puede consumir directamente la Edge Function.

3. **Sanitización de Inputs & Resiliencia DoS:**
   - `imageBase64` y `mimeType` solo se validan con `typeof === 'string'`.
   - **Sin límite de tamaño:** Un atacante puede enviar payloads en Base64 de 50MB a 100MB, provocando el agotamiento de memoria en la instancia de Deno Edge Runtime o costes excesivos por consumo de tokens.
   - **Sin lista blanca de tipos MIME:** Se permite enviar cualquier cadena en `mimeType` hacia la API de Google Gemini.

4. **Headers CORS Permisivos:**
   - Configuración con comodín:
     ```typescript
     const corsHeaders = {
       'Access-Control-Allow-Origin': '*',
       'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
     };
     ```
   - Habilita que páginas web externas de terceros puedan ejecutar solicitudes autenticadas contra la Edge Function si el navegador del usuario tiene credenciales activas o mediante técnicas de Cross-Origin Request Forgery asistido.

5. **Gestión de Secretos & Fuga de Credenciales:**
   - La API Key de Gemini se incluye en la URL:
     ```typescript
     const apiUrl = `https://generativelanguage.googleapis.com/.../gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
     ```
   - Al ocurrir un error de red o timeout en `fetch()`, el runtime de Deno genera una excepción cuyo mensaje contiene la URL completa solicitada:
     ```typescript
     } catch (error: unknown) {
       return jsonResponse({ success: false, error: (error as Error).message }, 500);
     }
     ```
   - **Resultado:** La clave privada `GEMINI_API_KEY` se filtra en texto claro en el JSON de respuesta HTTP 500 hacia el cliente.

---

### 2.3. Desajuste Frontend vs Backend (Security Through Obscurity)

El análisis comparativo entre los permisos de interfaz (`permissions.ts`, `RoleRoute.tsx`) y la base de datos demuestra que el frontend implementa una barrera puramente cosmética:

* **`products`:** En UI, el cajero solo tiene `VIEW_PRODUCTS`. En PostgREST, la directiva `USING (true) WITH CHECK (true)` le permite alterar el costo base (`cost`), el precio de venta o vaciar el stock (`DELETE`).
* **`sales` y `payments`:** En UI, el cajero solo puede ver sus propias ventas (`VIEW_OWN_SALES`). En la base de datos, puede consultar todas las ventas de otros vendedores, anular facturas históricas o borrar transacciones de pago.
* **`expenses` y `cash_ledger`:** Ocultos en el menú para el cajero, pero totalmente manipulables mediante llamadas HTTP directas a PostgREST.

---

### 2.4. Fugas de Privacidad (PII)

1. **Datos de Clientes (`clients`):**
   - Contiene: RIF / Cédula de Identidad, Teléfono, Correo, Dirección física, Límites y Saldos de crédito.
   - En `authSlice.ts`, la función `fetchInitialData()` ejecuta:
     ```typescript
     supabase.from('clients').select('*')
     ```
     descargando la base de datos completa de clientes a la memoria de cualquier usuario que inicie sesión, violando el principio de mínimo privilegio.
   - Cualquier cajero puede ejecutar `useStore.getState().clients` en la consola de herramientas de desarrollo y copiar toda la cartera de clientes de la empresa.

2. **Datos de Proveedores (`suppliers`):**
   - Contiene nombres de contactos comerciales directos, teléfonos privados, correos y acuerdos de precios/catálogos.
   - Descargados automáticamente en el arranque para cualquier usuario, permitiendo a cualquier empleado transferir los contactos comerciales a competidores.

3. **Datos de Personal (`users`):**
   - Nombres, correos electrónicos corporativos y roles accesibles sin restricción de departamento.

---

## 3. PoC (Proof of Concept) Conceptual

### PoC 1: Manipulación de Proveedores y Precios por un Cajero (Bypass de UI)
Un usuario autenticado con rol `SELLER` extrae su `access_token` del `localStorage` o de la consola del navegador y emite peticiones directas contra PostgREST:

```bash
# 1. Modificar datos de un proveedor crítico (bloqueado en UI, permitido en DB)
curl -X PATCH "https://<PROJECT_ID>.supabase.co/rest/v1/suppliers?id=eq.<SUPPLIER_UUID>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <CAJERO_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Proveedor Alterado", "notes": "Cuentas bancarias desviadas"}'

# 2. Modificar costo o precio de un producto en inventario
curl -X PATCH "https://<PROJECT_ID>.supabase.co/rest/v1/products?sku=eq.PROD-001" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <CAJERO_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"cost": 0.01, "stock": 9999}'
```

### PoC 2: Exfiltración de PII y Catálogos desde la Consola del Navegador
Dado que `authSlice.ts` almacena todas las entidades en el estado global de Zustand al arrancar:

```javascript
// Ejecutado en la consola de DevTools de cualquier sesión con rol 'SELLER':
const clientsPII = window.__ZUSTAND_STORE__ 
  ? window.__ZUSTAND_STORE__.getState().clients 
  : await (await fetch('/rest/v1/clients?select=name,rif,phone,email,address,credit_balance', {
      headers: {
        'apikey': '<SUPABASE_ANON_KEY>',
        'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem('sb-<PROJECT>-auth-token')).access_token
      }
    })).json();

console.table(clientsPII);
```

### PoC 3: Inyección de Registros Falsos en Auditoría
El cajero suplanta a un administrador debido al `WITH CHECK (true)` en `audit_logs`:

```bash
curl -X POST "https://<PROJECT_ID>.supabase.co/rest/v1/audit_logs" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <CAJERO_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_email": "administrador@empresa.com",
    "user_name": "Administrador General",
    "action": "DELETE",
    "entity": "sale",
    "changes": {"reason": "Auditoría saboteada por atacante"}
  }'
```

### PoC 4: Extracción de `GEMINI_API_KEY` provocando un Error 500
Enviando un tipo MIME inválido o provocando un timeout para que el mensaje de error refleje la URL con la API Key:

```bash
curl -X POST "https://<PROJECT_ID>.supabase.co/functions/v1/process-invoice" \
  -H "Authorization: Bearer <CAJERO_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"imageBase64": "invalid_base64_payload", "mimeType": "invalid/type"}'
```
*Si la conexión con Google API falla, el cuerpo de respuesta 500 devuelve:*
`{"success":false,"error":"error sending request for url (https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyD...): ...}`

---

## 4. Parche Defensivo Inmediato

### 4.1. Parche en SQL (Políticas RLS y Endurecimiento de Seguridad)
Ejecutar el siguiente script en Supabase SQL Editor para sustituir las políticas vulnerables y establecer un RBAC estricto a nivel de base de datos:

```sql
-- ====================================================================
-- PARCHE DEFENSIVO APPSEC: RBAC Y PROTECCIÓN DE DATOS
-- ====================================================================

-- 1. Actualizar la función current_user_role validando estado activo del usuario
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role 
  FROM public.users 
  WHERE id = auth.uid() AND is_active = true;
  
  RETURN COALESCE(v_role, 'VIEWER');
END;
$$;

-- 2. TABLA SETTINGS: Revocar lectura a usuarios anónimos
DROP POLICY IF EXISTS "Allow anon read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow admins to manage settings" ON public.settings;

-- Solo usuarios autenticados leen configuración
CREATE POLICY "Allow authenticated to read settings" ON public.settings
  FOR SELECT TO authenticated USING (true);

-- Solo ADMIN modifica configuración
CREATE POLICY "Allow admin to manage settings" ON public.settings
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- 3. TABLA SUPPLIERS: Restricción estricta
DROP POLICY IF EXISTS "Allow authenticated users full access on suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow staff to read suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow admin and manager to manage suppliers" ON public.suppliers;

-- ADMIN, MANAGER y SELLER pueden consultar proveedores (necesario para productos/POS)
CREATE POLICY "Allow staff to read suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER'));

-- Solo ADMIN y MANAGER pueden crear, editar o eliminar proveedores
CREATE POLICY "Allow admin and manager to manage suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- 4. TABLA PRODUCTS: Proteger costos y manipulación
DROP POLICY IF EXISTS "Allow authenticated users full access on products" ON public.products;

CREATE POLICY "Allow authenticated to read products" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin and manager to modify products" ON public.products
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- 5. TABLA SALES Y SALE_ITEMS: Restringir visibilidad de ventas al vendedor asignado
DROP POLICY IF EXISTS "Allow authenticated users full access on sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authenticated users full access on sale_items" ON public.sale_items;

-- ADMIN y MANAGER ven todas las ventas; SELLER solo ve las suyas
CREATE POLICY "Allow read sales by role" ON public.sales
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER') 
    OR user_id = auth.uid()
  );

-- ADMIN, MANAGER y SELLER pueden registrar ventas
CREATE POLICY "Allow insert sales" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'MANAGER', 'SELLER')
    AND user_id = auth.uid()
  );

-- Solo ADMIN y MANAGER pueden modificar ventas (anulaciones, ajustes)
CREATE POLICY "Allow admin and manager to update sales" ON public.sales
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow read sale items by role" ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s 
      WHERE s.id = sale_items.sale_id 
        AND (public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER') OR s.user_id = auth.uid())
    )
  );

CREATE POLICY "Allow insert sale items" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s 
      WHERE s.id = sale_items.sale_id AND s.user_id = auth.uid()
    )
  );

-- 6. TABLAS INVOICES Y EXPENSES: Bloqueadas para SELLER
DROP POLICY IF EXISTS "Allow authenticated users full access on invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow authenticated users full access on expenses" ON public.expenses;

CREATE POLICY "Allow invoice access to authorized roles" ON public.invoices
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER', 'VIEWER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY "Allow expenses access to authorized roles" ON public.expenses
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'MANAGER'));

-- 7. TABLA AUDIT_LOGS: Prevenir falsificación de identidad
DROP POLICY IF EXISTS "Allow authenticated to insert audit_logs" ON public.audit_logs;

CREATE POLICY "Allow verified insertion of audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 8. TABLA USERS: Permitir a MANAGER gestionar SELLER y VIEWER sin romper RLS
DROP POLICY IF EXISTS "Allow admins to manage users" ON public.users;

CREATE POLICY "Allow admin and manager to manage users" ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    OR (
      public.current_user_role() = 'MANAGER' 
      AND role IN ('SELLER', 'VIEWER')
    )
  )
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    OR (
      public.current_user_role() = 'MANAGER' 
      AND role IN ('SELLER', 'VIEWER')
    )
  );

CREATE POLICY "Allow admin to insert or delete users" ON public.users
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');
```

---

### 4.2. Parche en TypeScript: Edge Function Refactorizada
Reemplazo seguro para `supabase/functions/process-invoice/index.ts`:

```typescript
/* global Deno */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Restricción de CORS
const ALLOWED_ORIGINS = [
  Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173',
];

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('Origin') ?? '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.tu-dominio.com');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
};

const jsonResponse = (body: unknown, status: number, req: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

// Límite: 10MB en Base64 (~7.5MB archivo binario)
const MAX_BASE64_LENGTH = 10 * 1024 * 1024 * 1.37;

const SYSTEM_PROMPT = `
Eres un sistema contable experto. Analiza la imagen de la factura adjunta y extrae la información requerida.
DEBES devolver ÚNICAMENTE un objeto JSON válido cumpliendo con el esquema solicitado.
`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Método no permitido.' }, 405, req);
  }

  // 1. Verificación de JWT y Sesión Activa
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'No autorizado: token faltante.' }, 401, req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ success: false, error: 'Error interno de configuración.' }, 500, req);
  }

  // Cliente con service_role para consultar users de forma autorizada
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // Cliente con token de usuario para validar identidad
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ success: false, error: 'Sesión inválida o expirada.' }, 401, req);
  }

  // 2. Control de Acceso Basado en Roles (RBAC) en Backend
  const { data: profile, error: profileError } = await adminClient
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    return jsonResponse({ success: false, error: 'Cuenta inactiva o no registrada.' }, 403, req);
  }

  // Únicamente ADMIN y MANAGER tienen permiso de procesar facturas de compra
  if (!['ADMIN', 'MANAGER'].includes(profile.role)) {
    return jsonResponse({ success: false, error: 'Acceso denegado: rol insuficiente.' }, 403, req);
  }

  // 3. Sanitización y Validación de Payload
  let imageBase64: string;
  let mimeType: string;

  try {
    const body = await req.json() as Record<string, unknown>;
    imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  } catch {
    return jsonResponse({ success: false, error: 'JSON malformado.' }, 400, req);
  }

  if (!imageBase64 || !mimeType) {
    return jsonResponse({ success: false, error: 'Parámetros imageBase64 y mimeType requeridos.' }, 400, req);
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    return jsonResponse({ success: false, error: 'Tipo MIME no admitido. Permitidos: JPEG, PNG, WEBP, PDF.' }, 400, req);
  }

  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return jsonResponse({ success: false, error: 'El archivo excede el tamaño máximo permitido (7.5MB).' }, 413, req);
  }

  // 4. Llamada Segura a Gemini (API Key en Header, no en URL)
  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return jsonResponse({ success: false, error: 'Servicio de IA no disponible.' }, 500, req);
    }

    // Endpoint limpio sin secrets en query string
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey, // ✅ API Key segura en cabecera
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              { inlineData: { mimeType, data: imageBase64 } }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!geminiResponse.ok) {
      console.error('Error de Gemini API. Status:', geminiResponse.status);
      return jsonResponse({ success: false, error: 'Error procesando documento con IA.' }, 502, req);
    }

    const geminiData = await geminiResponse.json();
    let resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsedJSON = JSON.parse(resultText);
    return jsonResponse({ success: true, data: parsedJSON }, 200, req);

  } catch (error: unknown) {
    console.error('Process Invoice Error:', error);
    return jsonResponse({ success: false, error: 'Error interno durante el procesamiento del archivo.' }, 500, req);
  }
});
```

---

### 4.3. Parche en Frontend: Carga Condicional por Rol en `authSlice.ts`
En `src/store/slices/authSlice.ts`, modularizar la carga de datos para evitar la descarga de PII sensible cuando el usuario es un cajero:

```typescript
// Reemplazo en fetchInitialData (src/store/slices/authSlice.ts)
fetchInitialData: async () => {
  if (!get().user) return;
  set({ isLoading: true });
  try {
    await get().fetchCurrentUserData();
    const currentRole = get().currentUserData?.role ?? 'VIEWER';

    // 1. Consultas comunes mínimas para operación de caja y POS
    const baseQueries: Promise<any>[] = [
      supabase.from('settings').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('products').select('*'),
      supabase.from('payment_methods').select('*'),
    ];

    // 2. Si es ADMIN o MANAGER, cargar proveedores e informes financieros
    const isElevated = currentRole === 'ADMIN' || currentRole === 'MANAGER';
    
    const [settingsRes, productsRes, paymentMethodsRes] = await Promise.all(baseQueries);
    
    if (isElevated) {
      const [suppliersRes, invoicesRes] = await Promise.all([
        supabase.from('suppliers').select('*'),
        supabase.from('invoices').select('*'),
      ]);
      set({ 
        suppliers: (suppliersRes.data || []).map(mapSupplierFromDB),
        invoices: (invoicesRes.data || []).map(mapInvoiceFromDB),
      });
    }

    // 3. Ventas: Si es SELLER, solicitar únicamente sus ventas propias
    const salesQuery = supabase
      .from('sales')
      .select('*, sale_items(*), payments(*)')
      .order('date', { ascending: false })
      .limit(200);

    if (currentRole === 'SELLER') {
      salesQuery.eq('user_id', get().user!.id);
    }
    const salesRes = await salesQuery;

    // Procesar settings...
  } catch (error) {
    console.error('Error cargando datos iniciales:', error);
  } finally {
    set({ isLoading: false });
  }
}
```
