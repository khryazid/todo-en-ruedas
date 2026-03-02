// @ts-nocheck
/* global Deno */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64 || !mimeType) {
      return new Response(JSON.stringify({ success: false, error: 'imageBase64 and mimeType are required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'Servidor mal configurado: GEMINI_API_KEY no encontrada.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error('Error from Gemini:', geminiData);
      throw new Error(geminiData.error?.message || 'Error communicating with Gemini AI');
    }

    let resultText = geminiData.candidates[0].content.parts[0].text;

    // Sometimes the model outputs markdown anyway, let's clean it up
    resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const parsedJSON = JSON.parse(resultText);
      return new Response(JSON.stringify({ success: true, data: parsedJSON }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } catch {
      console.error("Failed to parse Gemini output as JSON:", resultText);
      throw new Error("El modelo no devolvió un JSON válido. Respuesta: " + resultText.substring(0, 50));
    }

  } catch (error: unknown) {
    console.error('Process Invoice Error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
