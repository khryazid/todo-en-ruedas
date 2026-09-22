/* global Deno */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ✅ AUDIT FIX #15: Agregar validación de autenticación JWT antes de procesar payload.
// Sin este check, cualquier request externo con la URL pública puede consumir la cuota de Gemini.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ─── 1. Validación JWT de Supabase Auth ────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'No autorizado: se requiere token de sesión.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ success: false, error: 'Servidor mal configurado: variables de entorno de Supabase faltantes.' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.warn('Auth validation failed:', authError.message);
    return jsonResponse({ success: false, error: 'No autorizado: sesión inválida o expirada.' }, 401);
  }

  // ─── 2. Validación del payload ─────────────────────────────────────────────
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

  // ─── 3. Procesamiento con Gemini ───────────────────────────────────────────
  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return jsonResponse({ success: false, error: 'Servidor mal configurado: GEMINI_API_KEY no encontrada.' }, 500);
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    console.log('Sending request to Gemini API...');

    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    const geminiData = await geminiResponse.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!geminiResponse.ok) {
      console.error('Error from Gemini:', geminiData);
      throw new Error(geminiData.error?.message || 'Error communicating with Gemini AI');
    }

    let resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Sometimes the model outputs markdown anyway, let's clean it up
    resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const parsedJSON = JSON.parse(resultText);
      return jsonResponse({ success: true, data: parsedJSON }, 200);
    } catch {
      console.error("Failed to parse Gemini output as JSON:", resultText);
      throw new Error("El modelo no devolvió un JSON válido. Respuesta: " + resultText.substring(0, 50));
    }

  } catch (error: unknown) {
    console.error('Process Invoice Error:', error);
    return jsonResponse({ success: false, error: (error as Error).message }, 500);
  }
});
