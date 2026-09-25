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
Eres un sistema contable experto en repuestos, insumos y suministros. Analiza la imagen o documento de la factura o nota de entrega adjunta y extrae la información requerida.
DEBES devolver ÚNICAMENTE un objeto JSON válido que cumpla estrictamente con esta estructura. No incluyas texto extra, explicaciones ni bloques markdown como \`\`\`json.

{
  "number": "string (El número de factura, correlativo, control o nota de entrega)",
  "supplierName": "string (Razón social o nombre comercial del proveedor)",
  "supplierRif": "string (RIF o identificación fiscal del proveedor, ej. J-12345678-9. Si no está visible, dejar vacío)",
  "dateIssue": "string (Formato YYYY-MM-DD. Si no hay, usa la fecha de hoy)",
  "currency": "string (Moneda del documento: 'USD' o 'BS')",
  "subtotalUSD": "number (El subtotal numérico)",
  "freightTotalUSD": "number (El flete, envío o delivery. Si no hay, es 0)",
  "taxTotalUSD": "number (El total de impuestos o IVA. Si no hay, es 0)",
  "items": [
    {
      "sku": "string (Código del producto o referencia del fabricante. Si no hay, genera uno corto de 4 letras basado en el nombre)",
      "name": "string (Descripción clara del repuesto o producto)",
      "quantity": "number (Cantidad numérica)",
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

  // ─── 1. Control de Carga contra DoS / OOM (Límite: 15MB) ─────────────────────
  const contentLength = Number(req.headers.get('content-length') || 0);
  const MAX_PAYLOAD_BYTES = 15 * 1024 * 1024;
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return jsonResponse({ success: false, error: 'El archivo excede el límite permitido de 15MB.' }, 413);
  }

  // ─── 2. Autenticación y Autorización RBAC ───────────────────────────────────
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

    if (profileError) {
      console.warn('Advertencia al consultar users:', profileError.message);
    }

    if (profile && profile.is_active === false) {
      return jsonResponse({ success: false, error: 'Usuario inactivo o suspendido.' }, 403);
    }

    const role = (profile?.role || user.user_metadata?.role || user.app_metadata?.role || '').toUpperCase();
    const allowedRoles = ['ADMIN', 'MANAGER', 'OWNER'];
    if (role && !allowedRoles.includes(role)) {
      return jsonResponse({
        success: false,
        error: `Acceso denegado: el rol ${role} no tiene permisos para procesar facturas (se requiere ADMIN o MANAGER).`
      }, 403);
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

  // ─── 4. Procesamiento Seguro con Google Gemini API ──────────────────────────
  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return jsonResponse({
        success: false,
        error: 'Servidor mal configurado: GEMINI_API_KEY no encontrada en Supabase Secrets.'
      }, 500);
    }

    // Lista de modelos ordenados: Gemini 3.8 Flash es el modelo oficial actual recomendado por Google
    const configuredModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';
    const candidateModels = [
      configuredModel,
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
    ];

    const uniqueModels = [...new Set(candidateModels)];

    let lastError: Error | null = null;
    let geminiData: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string; code?: number };
    } | null = null;

    for (const model of uniqueModels) {
      try {
        console.log(`Invocando modelo Gemini: ${model}`);
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiApiKey,
          },
          signal: AbortSignal.timeout(20000), // 20s para evitar 502 de gateway
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: SYSTEM_PROMPT }]
            },
            contents: [
              {
                role: 'user',
                parts: [
                  { text: 'Extrae con alta precisión todos los datos de esta factura o documento contable en el formato JSON especificado.' },
                  { inlineData: { mimeType, data: imageBase64 } }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`Modelo ${model} retornó HTTP ${response.status}:`, errText);
          let errDetail = errText;
          try {
            const p = JSON.parse(errText);
            if (p.error?.message) errDetail = p.error.message;
          } catch (e) {
            console.debug('Error body no es JSON:', e);
          }

          lastError = new Error(`[${model}] HTTP ${response.status}: ${errDetail}`);

          // Si el error es de clave API inválida, detener de inmediato
          if (
            response.status === 401 ||
            response.status === 403 ||
            errText.toLowerCase().includes('api_key_invalid') ||
            errText.toLowerCase().includes('api key not valid')
          ) {
            throw lastError;
          }

          // Si es 404 (modelo no disponible), probar el siguiente
          continue;
        }

        geminiData = await response.json();
        console.log(`Éxito con el modelo: ${model}`);
        break; // Éxito con este modelo
      } catch (err: unknown) {
        lastError = err as Error;
        if ((err as Error).message?.includes('API_KEY')) throw err;
      }
    }

    if (!geminiData) {
      throw lastError || new Error('No se pudo procesar la factura con los modelos de IA disponibles.');
    }

    let resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    resultText = resultText.trim();

    // Limpieza robusta de cercas markdown
    if (resultText.startsWith('```json')) {
      resultText = resultText.slice(7);
    } else if (resultText.startsWith('```')) {
      resultText = resultText.slice(3);
    }
    if (resultText.endsWith('```')) {
      resultText = resultText.slice(0, -3);
    }
    resultText = resultText.trim();

    const firstBrace = resultText.indexOf('{');
    const lastBrace = resultText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      resultText = resultText.substring(firstBrace, lastBrace + 1);
    }

    let parsedJSON: Record<string, unknown>;
    try {
      parsedJSON = JSON.parse(resultText);
    } catch {
      console.error('Failed to parse Gemini output as JSON:', resultText.substring(0, 200));
      return jsonResponse({
        success: false,
        error: 'La IA no devolvió un formato JSON válido. Intenta con una imagen más nítida o en mejor ángulo.'
      }, 500);
    }

    if (!Array.isArray(parsedJSON.items)) {
      parsedJSON.items = [];
    }

    return jsonResponse({ success: true, data: parsedJSON }, 200);

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Process Invoice Error:', err.name, err.message);
    const clientMessage = err.name === 'TimeoutError'
      ? 'Tiempo de espera agotado con Google Gemini (20s). Intenta de nuevo con una imagen más ligera.'
      : (err.message || 'Error interno al procesar factura con IA.');
    return jsonResponse({ success: false, error: clientMessage }, 500);
  }
});
