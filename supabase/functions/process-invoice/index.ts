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
Eres un sistema contable experto en repuestos y suministros. Analiza la imagen o documento de la factura adjunta y extrae la información requerida.
DEBES devolver ÚNICAMENTE un objeto JSON válido que cumpla estrictamente con esta estructura. No incluyas texto extra, ni bloques markdown como \`\`\`json.

{
  "number": "string (El número de factura, nota de entrega o documento)",
  "supplierName": "string (Razón social o nombre comercial del proveedor)",
  "supplierRif": "string (RIF o identificación fiscal del proveedor, ej. J-12345678-9. Si no está visible, dejar vacío)",
  "dateIssue": "string (Formato YYYY-MM-DD. Si no hay, usa la fecha de hoy)",
  "currency": "string (Moneda del documento: 'USD' o 'BS')",
  "subtotalUSD": "number (El subtotal numérico. Si la factura está en USD o Bs, extrae el monto)",
  "freightTotalUSD": "number (El flete, envío o delivery. Si no hay, es 0)",
  "taxTotalUSD": "number (El total de impuestos o IVA. Si no hay, es 0)",
  "items": [
    {
      "sku": "string (Código del producto o referencia del fabricante. Si no hay, genera uno corto de 4 letras basado en el nombre)",
      "name": "string (Descripción clara del repuesto o producto)",
      "quantity": "number",
      "costUnitUSD": "number (Costo unitario del producto)"
    }
  ]
}
`;

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Método no permitido.' }, 405);
  }

  // ─── 1. Control de Carga contra DoS / OOM (Límite: 10MB) ─────────────────────
  const contentLength = Number(req.headers.get('content-length') || 0);
  const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return jsonResponse({ success: false, error: 'El archivo excede el límite permitido de 10MB.' }, 413);
  }

  // ─── 2. Autenticación y Autorización RBAC (ADMIN o MANAGER) ─────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'No autorizado: se requiere token de sesión.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

  if (supabaseUrl && serviceKey) {
    const supabaseClient = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ success: false, error: 'Sesión inválida o expirada.' }, 401);
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile || profile.is_active === false) {
      return jsonResponse({ success: false, error: 'Usuario inactivo o no autorizado.' }, 403);
    }

    if (!['ADMIN', 'MANAGER'].includes(profile.role)) {
      return jsonResponse({ success: false, error: 'Acceso denegado: permisos insuficientes para procesar facturas.' }, 403);
    }
  }

  // ─── 3. Validación del Payload ─────────────────────────────────────────────
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

  // ─── 4. Procesamiento Seguro con Gemini API ────────────────────────────────
  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return jsonResponse({ success: false, error: 'Servidor mal configurado: GEMINI_API_KEY no encontrada.' }, 500);
    }

    // ✅ DEVSECOPS: La API Key se traslada a la cabecera x-goog-api-key, protegiendo logs y proxies
    const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      signal: AbortSignal.timeout(30000), // ✅ SRE: 30 segundos de timeout para evitar workers colgados
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

    if (!response.ok) {
      console.error(`Gemini upstream error: ${response.status}`);
      throw new Error(`Error en el servicio de IA (HTTP ${response.status})`);
    }

    const geminiData = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    let resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const parsedJSON = JSON.parse(resultText);
      return jsonResponse({ success: true, data: parsedJSON }, 200);
    } catch {
      console.error('Failed to parse Gemini output as JSON:', resultText.substring(0, 80));
      return jsonResponse({ success: false, error: 'El modelo no devolvió un JSON contable estructurado.' }, 500);
    }

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Process Invoice Error:', err.name, err.message);
    const clientMessage = err.name === 'TimeoutError'
      ? 'Tiempo de espera agotado con el proveedor de IA (30s).'
      : 'Error interno al procesar factura.';
    return jsonResponse({ success: false, error: clientMessage }, 500);
  }
});
