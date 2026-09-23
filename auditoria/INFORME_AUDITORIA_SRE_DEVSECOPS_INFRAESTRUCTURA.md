# Informe de Auditoría SRE y DevSecOps: Infraestructura, Dependencias y Pipeline de Despliegue

**Fecha:** 2026-09-22  
**Roles:** Site Reliability Engineer (SRE) & DevSecOps  
**Proyecto:** Glyph Core (`todo-en-ruedas`)  
**Archivos Auditados:**
- `package.json`
- `netlify.toml`
- `vite.config.ts`
- `supabase/config.toml`
- `supabase/functions/process-invoice/deno.json`
- `supabase/functions/process-invoice/index.ts`
- `public/_redirects`
- `vercel.json`

---

## 1. Resumen Ejecutivo y Postura de Seguridad

Se realizó una auditoría técnica profunda sobre la cadena de suministro (Software Supply Chain), la configuración de empaquetado del frontend (Vite/Rollup/Workbox), las políticas de despliegue en CDN/Edge (Netlify y Vercel) y el entorno de ejecución serverless en Deno (Supabase Edge Runtime).

Se identificaron **29 vulnerabilidades en dependencias** (1 Crítica y 20 de Severidad Alta), vectores de fuga de datos en el servidor de desarrollo local, encabezados HTTP de seguridad ausentes en el CDN de producción, comodines permisivos en la Política de Seguridad de Contenido (CSP), almacenamiento inseguro de endpoints de API en Service Worker, y anti-patrones de latencia y exposición de credenciales en Supabase Edge Functions.

---

## 2. Hallazgos Operacionales y de Seguridad en el Empaquetado

### A. Vulnerabilidades en el Árbol de Dependencias (CVEs y Supply Chain)

El análisis del árbol de dependencias (`npm audit`) reveló **29 vulnerabilidades activas**:
- **Crítica:** 1
- **Alta:** 20
- **Moderada:** 6
- **Baja:** 2

#### 1. `tar <= 7.5.20` — Severidad: CRÍTICA (CVSS 7.5)
- **Identificadores:** [GHSA-9ppj-qmqm-q256](https://github.com/advisories/GHSA-9ppj-qmqm-q256), [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw), [GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh).
- **Vector:** Symlink Path Traversal en rutas relativas a unidad (Windows), denegación de servicio por descompresión no limitada y file smuggling mediante cabeceras PAX maliciosas.
- **Origen:** Dependencia transitiva introducida por la CLI de desarrollo `supabase: ^2.76.15`.
- **Impacto:** Posible sobreescritura de archivos o DoS durante la ejecución de migraciones, generación de tipos o empaquetado de funciones.
- **Remediación:** Actualizar `supabase` a `>= 2.77.2` o forzar resolución `tar@>=7.5.21`.

#### 2. `vite 7.0.0 - 7.3.3` — Severidad: ALTA (CVSS 7.5)
- **Identificadores:** [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-v2wj-q39q-566r](https://github.com/advisories/GHSA-v2wj-q39q-566r), [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff).
- **Vector:** Path traversal en el manejo de archivos `.map` de dependencias optimizadas, bypass de `server.fs.deny` en rutas de Windows y lectura arbitraria de archivos del sistema mediante el canal WebSocket del dev server.
- **Impacto Crítico Agravado:** `package.json` tiene `"vite": "^7.2.4"`. Dado que `vite.config.ts` incluye `server: { host: true }` (enlazando en `0.0.0.0`), cualquier dispositivo en la misma red Wi-Fi/LAN puede solicitar archivos sensibles del entorno del desarrollador (`.env`, archivos del SO).
- **Remediación:** Actualizar `vite` a `^7.3.6` o versión parcheada superior y restringir `host` a `127.0.0.1`.

#### 3. `react-router` / `react-router-dom: 7.0.0 - 7.17.0` — Severidad: ALTA
- **Identificadores:** [GHSA-49rj-9fvp-4h2h](https://github.com/advisories/GHSA-49rj-9fvp-4h2h), [GHSA-2w69-qvjg-hvjx](https://github.com/advisories/GHSA-2w69-qvjg-hvjx), [GHSA-chx6-hx7r-mcp5](https://github.com/advisories/GHSA-chx6-hx7r-mcp5).
- **Vector:** Ejecución remota de constructores / deserialización `TYPE_ERROR` en `turbo-stream v2`, Cross-Site Scripting (XSS) vía redirección abierta en componentes `<Link>` / `useNavigate`.
- **Impacto:** Declarado `"react-router-dom": "^7.11.0"`.
- **Remediación:** Actualizar a `react-router-dom: ^7.18.4`.

#### 4. `serialize-javascript <= 7.0.4` — Severidad: ALTA
- **Identificadores:** [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq), [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v).
- **Vector:** RCE vía inyección de expresiones regulares y DoS por agotamiento de CPU.
- **Origen:** Dependencia de `@rollup/plugin-terser` en `workbox-build`.

#### 5. Contaminación del Supply Chain (`@anthropic-ai/claude-code`)
- **Hallazgo:** `package.json` incluye `"@anthropic-ai/claude-code": "^2.1.44"` en `devDependencies`.
- **Riesgo Operacional:** Este paquete es una CLI de agente de IA autónomo con cientos de paquetes transitivos. Mantenerlo en el `package.json` de la aplicación infla los artefactos de CI/CD, ralentiza `npm ci` en Netlify y ensancha innecesariamente el radio de ataque del supply chain. Debe desinstalarse del proyecto y mantenerse exclusivamente a nivel de máquina de usuario (`npm -g` o standalone).

---

### B. Seguridad en Despliegue (Netlify & Vercel)

#### 1. Cabeceras HTTP Ausentes o Deficientes
- **HSTS (`Strict-Transport-Security`):** Inexistente. Requiere `max-age=31536000; includeSubDomains; preload` para forzar canales HTTPS seguros e impedir ataques SSL Strip.
- **`X-Frame-Options: DENY`:** Ausente. Aunque CSP posea `frame-ancestors 'none'`, navegadores tradicionales y escáneres DAST/OWASP reportan vulnerabilidad de Clickjacking si esta cabecera no está explícita.
- **`Permissions-Policy`:** Ausente. Debe restringir el acceso a APIs de hardware que no utiliza la aplicación (`camera=()`, `microphone=()`, `geolocation=()`, `payment=()`).
- **Aislamiento Cross-Origin:** Faltan `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Resource-Policy: same-origin`.

#### 2. Debilidad en Content Security Policy (CSP)
- **Fuga de Datos en `connect-src`:**
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https: wss:;`
  El uso de comodines libres `https:` y `wss:` habilita conexiones a **cualquier servidor externo**. Si un paquete de terceros es comprometido, un atacante puede exfiltrar credenciales o registros de base de datos a un servidor de comando y control (C2) sin que la CSP lo impida.
  *Corrección:* Limitar `connect-src` estrictamente a `'self'` y a los endpoints autorizados de Supabase.

#### 3. Fallback Routing de SPA (`_redirects` vs `netlify.toml`)
- El enrutamiento SPA reside actualmente de forma fragmentada en `public/_redirects` (`/* /index.html 200`). Depender únicamente de un archivo estático en `public/` viola el principio de Infrastructure-as-Code (IaC). Si un paso de build o plugin limpia la carpeta `dist` sin copiar estáticos, los usuarios reciben 404 al recargar cualquier ruta interna (`/pos`, `/inventory`, etc.).
  *Corrección:* Declarar la regla `[[redirects]]` formalmente en `netlify.toml`.

#### 4. Estrategia de Caché de Despliegue (Cache-Control)
- Netlify sirve activos sin diferenciación de ciclo de vida:
  - `index.html`, `sw.js` y `manifest.webmanifest` deben tener `no-cache, no-store, must-revalidate` para evitar clientes obsoletos (stale versions) y fallos de carga tras nuevos despliegues.
  - `/assets/*` (con hash inmutable de Vite) debe configurarse con `public, max-age=31536000, immutable`.

---

### C. Empaquetado y Exposición en Vite (`vite.config.ts`)

1. **Exposición de Sourcemaps:**
   No se declara `sourcemap: false` explícitamente en `build`. Una ejecución con flags inadvertidos publicaría archivos `.map` en producción, exponiendo el 100% del código fuente, interfaces y lógica de negocio.
2. **Fuga de Logs y Debuggers (`console.log`):**
   Falta la directiva `esbuild.drop = ['console', 'debugger']` en modo producción. Errores con información de clientes, tokens o datos de facturas quedan impresos en la consola del navegador.
3. **Caché Persistente en Service Worker de la API de Supabase:**
   Workbox almacena en caché respuestas completas de Supabase (`supabase-api` con `NetworkFirst` por 5 minutos). En terminales de venta o computadoras compartidas, esto puede exponer datos contables y personales en `CacheStorage` aún después del cierre de sesión. Debe restringirse exclusivamente a peticiones GET idempotentes y con TTL acotado.
4. **Binding de Red Inseguro en Desarrollo:**
   `server: { host: true }` enlaza en `0.0.0.0`. En conjunto con las vulnerabilidades de Vite 7, expone la máquina local en redes públicas. Debe condicionarse a variable de entorno y defaultear a `127.0.0.1`.

---

### D. Edge Runtime (Deno vs. Node.js en Supabase Functions)

1. **Incompatibilidades del Modelo Node.js en Deno:**
   - **Riesgos de `esm.sh`**: Importar módulos de Node mediante `https://esm.sh/<pkg>` arrastra polyfills automáticos (`node:process`, `node:buffer`). En los V8 isolates de Supabase, estos polyfills provocan aumento del tiempo de Cold Start, memory leaks y excepciones en runtime ante APIs nativas no emulables.
   - **Estándar Deno 2**: Toda dependencia de Edge Functions debe importarse mediante **JSR** (`jsr:@scope/pkg`) o el especificador nativo `npm:<pkg>@<ver>`.
2. **Inconsistencia de Import Maps:**
   - `supabase/functions/process-invoice/deno.json` solo declara `@supabase/functions-js`.
   - `supabase/functions/process-invoice/index.ts` importa directamente `jsr:@supabase/supabase-js@2`, saltándose el mapa de importación. Debe unificarse de forma declarativa en `deno.json`.
3. **Latencia Innecesaria por Doble Validación JWT:**
   - En `supabase/config.toml`, `verify_jwt = true` ya está habilitado en el Gateway de Supabase. El API Gateway rechaza tokens expirados o firmas inválidas antes de invocar el worker.
   - En `index.ts`, la función vuelve a invocar `await supabase.auth.getUser()`, generando una petición HTTP redundante (150–300 ms de latencia) en cada procesamiento de factura, incrementando el P99 y dependiendo de la disponibilidad síncrona de Auth.
4. **Exposición de API Key en Query String:**
   - `index.ts` envía `?key=${geminiApiKey}` en la URL de Gemini. Las URLs completas se registran en logs de proxies, balanceadores y telemetría. La clave debe enviarse mediante la cabecera `x-goog-api-key`.
5. **Vulnerabilidad de DoS y Timeouts:**
   - `index.ts` carece de límite de tamaño de payload (`Content-Length`). Un archivo base64 excesivo satura la memoria del worker (150-256 MB) provocando OOM.
   - La petición `fetch` a Gemini carece de `AbortSignal.timeout(30000)`, arriesgando el bloqueo del worker ante cuelgues del upstream.

---

## 3. Configuraciones Corregidas y Hardened

### A. Archivo Corregido: `netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
  SECRETS_SCAN_OMIT_KEYS = "VITE_SUPABASE_ANON_KEY,VITE_SUPABASE_URL"

# ─── SPA Fallback Routing Declarativo (IaC) ──────────────────────────────────
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

# ─── Cabeceras de Seguridad HTTP Globales ─────────────────────────────────────
[[headers]]
  for = "/*"
  [headers.values]
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()"
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Resource-Policy = "same-origin"
    # CSP blindado: Comodines 'https:' y 'wss:' eliminados. Restringido a Supabase y recursos propios
    Content-Security-Policy = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:; manifest-src 'self'"

# ─── Protección Contra Exposición de Sourcemaps ──────────────────────────────
[[headers]]
  for = "/*.map"
  [headers.values]
    X-Robots-Tag = "noindex, nofollow"
    Cache-Control = "no-store"

# ─── Control de Caché para Ciclo de Vida SPA / PWA ───────────────────────────
[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

[[headers]]
  for = "/manifest.webmanifest"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

# ─── Caché Inmutable para Bundles Hashed de Vite ─────────────────────────────
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

---

### B. Archivo Corregido: `vite.config.ts`

```typescript
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isProduction = mode === 'production';

  const supabaseUrl = env.VITE_SUPABASE_URL || '';
  const escapedUrl = supabaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const supabaseCachePattern = escapedUrl
    ? new RegExp(`^${escapedUrl}/rest/v1/.*`, 'i')
    : /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/.*/i;

  return {
    build: {
      // ✅ SRE/DEVSECOPS: Forzar desactivación de sourcemaps en producción
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2022',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'supabase-vendor': ['@supabase/supabase-js'],
            'charts-vendor': ['recharts'],
            'ui-vendor': ['lucide-react', 'react-hot-toast', 'clsx', 'tailwind-merge'],
          },
        },
      },
    },
    esbuild: {
      // ✅ SRE/DEVSECOPS: Eliminar console.log y debugger en producción
      drop: isProduction ? ['console', 'debugger'] : [],
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Glyph Core - Sistema de Gestión',
          short_name: 'Glyph Core',
          description: 'Sistema ERP & POS - Inventario y Ventas Multimoneda',
          theme_color: '#111827',
          background_color: '#111827',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // ✅ Solo cachear lecturas GET seguras de catálogo; expiración controlada
          runtimeCaching: [
            {
              urlPattern: supabaseCachePattern,
              handler: 'NetworkFirst',
              method: 'GET',
              options: {
                cacheName: 'supabase-read-cache',
                expiration: {
                  maxEntries: 40,
                  maxAgeSeconds: 60 * 3 // 3 minutos
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        }
      })
    ],
    server: {
      // ✅ DEVSECOPS: Enlazar en 127.0.0.1 por defecto. No exponer a la LAN salvo indicación
      host: process.env.VITE_DEV_HOST ? true : '127.0.0.1',
      port: 5173,
    }
  };
});
```

---

### C. Archivo Corregido: `supabase/functions/process-invoice/deno.json`

```json
{
  "compilerOptions": {
    "allowJs": true,
    "lib": ["deno.window", "deno.ns"]
  },
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2.4.4",
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2.49.1",
    "@std/http": "jsr:@std/http@^1.0.13"
  },
  "lint": {
    "rules": {
      "tags": ["recommended"]
    }
  },
  "fmt": {
    "useTabs": false,
    "lineWidth": 100,
    "indentWidth": 2,
    "singleQuote": true
  }
}
```

---

### D. Archivo Corregido y Optimizado: `supabase/functions/process-invoice/index.ts`

```typescript
/* global Deno */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SYSTEM_PROMPT = `
Eres un sistema contable experto. Analiza la imagen de la factura adjunta y extrae la información requerida.
DEBES devolver ÚNICAMENTE un objeto JSON válido que cumpla estrictamente con esta estructura. No incluyas texto extra, ni bloques markdown como \`\`\`json.

{
  "number": "string (El número de factura o documento)",
  "supplierName": "string (Nombre del proveedor o tienda)",
  "dateIssue": "string (Formato YYYY-MM-DD. Si no hay, usa la fecha de hoy)",
  "subtotalUSD": "number (El subtotal numérico)",
  "freightTotalUSD": "number (El flete, envío o delivery. Si no hay, es 0)",
  "taxTotalUSD": "number (El total de impuestos o IVA. Si no hay, es 0)",
  "items": [
    {
      "sku": "string (Intenta hallar un código de ítem. Si no hay, genera uno corto de 4 letras basado en el nombre)",
      "name": "string (Descripción del producto)",
      "quantity": "number",
      "costUnitUSD": "number (Costo unitario)"
    }
  ]
}
`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Método no permitido.' }, 405);
  }

  // 1. Verificación básica de presencia de encabezado
  // (El Gateway de Supabase ya verificó criptográficamente la firma y vigencia mediante verify_jwt = true)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'No autorizado: token de sesión requerido.' }, 401);
  }

  // 2. Control de Tamaño de Carga (Prevención DoS / Memory Exhaustion en V8 Isolate)
  const contentLength = Number(req.headers.get('content-length') || 0);
  const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB límite
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return jsonResponse({ success: false, error: 'Payload excede el límite permitido de 10MB.' }, 413);
  }

  let imageBase64: string | undefined;
  let mimeType: string | undefined;

  try {
    const body = await req.json() as Record<string, unknown>;
    imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined;
    mimeType = typeof body.mimeType === 'string' ? body.mimeType : undefined;
  } catch {
    return jsonResponse({ success: false, error: 'Payload JSON inválido.' }, 400);
  }

  if (!imageBase64 || !mimeType) {
    return jsonResponse({ success: false, error: 'imageBase64 y mimeType son requeridos.' }, 400);
  }

  // 3. Procesamiento con Gemini API: Cabecera Segura y Timeout
  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return jsonResponse({ success: false, error: 'Error interno: GEMINI_API_KEY no configurada.' }, 500);
    }

    // ✅ DEVSECOPS: La API Key se envía en cabecera 'x-goog-api-key', eliminándola de los URLs y logs
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      signal: AbortSignal.timeout(30000), // ✅ SRE: 30s de timeout para evitar workers zombies
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
          responseMimeType: 'application/json'
        }
      })
    });

    const geminiData = await geminiResponse.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!geminiResponse.ok) {
      console.error('Error upstream de Gemini:', geminiData.error?.message);
      throw new Error(geminiData.error?.message || 'Error en comunicación con Gemini AI');
    }

    let resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsedJSON = JSON.parse(resultText);
    return jsonResponse({ success: true, data: parsedJSON }, 200);

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Process Invoice Error:', err.name, err.message);
    return jsonResponse({
      success: false,
      error: err.name === 'TimeoutError' ? 'Tiempo de espera agotado con el proveedor de IA.' : err.message
    }, 500);
  }
});
```

---

## 4. Matriz de Acciones de Remediación y Plan de Ejecución

| Prioridad | Componente | Acción Correctiva | Comando / Archivo |
|---|---|---|---|
| **P0 (Crítica)** | Supply Chain | Desinstalar CLI no relacionado del runtime de producción | `npm uninstall @anthropic-ai/claude-code` |
| **P0 (Crítica)** | Dependencias | Parchear `tar` (CVE Crítico) y `vite` (CVE Alto) | `npm install -D supabase@^2.77.2 vite@^7.3.6 && npm audit fix` |
| **P0 (Crítica)** | Dependencias | Parchear `react-router-dom` (CVE Alto RCE/XSS) | `npm install react-router-dom@^7.18.4` |
| **P1 (Alta)** | Netlify | Implementar HSTS, CSP hardened, X-Frame-Options y SPA Redirects | `netlify.toml` |
| **P1 (Alta)** | Vite | Desactivar sourcemaps, eliminar console.logs en prod y aislar host | `vite.config.ts` |
| **P1 (Alta)** | Edge Runtime | Eliminar API Key de URL de Gemini, limitar payload y timeout | `supabase/functions/process-invoice/index.ts` |
| **P2 (Media)** | Edge Runtime | Centralizar dependencias Deno 2 en import map | `supabase/functions/process-invoice/deno.json` |
