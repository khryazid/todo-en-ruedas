# 🤖 Automatización: Extracción de Facturas con IA (OCR + LLM)
> **Objetivo:** Permitir al usuario subir una foto o PDF de una factura de proveedor. El sistema debe "leer" la imagen, extraer los datos (proveedor, fecha, número, ítems, costos, totales) y pre-llenar el formulario de "Nueva Factura" para que el usuario solo revise y acepte.

---

## 🏗️ 1. Flujo de Usuario Propuesto

1. **Botón Mágico:** En el panel de "Facturas", junto al botón "Nueva Compra", agregamos un botón con el ícono ✨ llamado "Escanear Factura".
2. **Subida de Archivo:** Se abre un modal sencillo donde el usuario sube un archivo (JPG, PNG o PDF).
3. **Procesamiento (Estado de Carga):** La app muestra un loader (ej. "Analizando factura con IA...").
4. **Pre-Llenado Mágico:** El backend devuelve un JSON estructurado. El Frontend toma ese JSON y **rellena automáticamente los campos** del formulario modal que ya existe (`Invoices.tsx`).
5. **Revisión Humana:** El usuario ve el formulario lleno. Puede corregir un SKU mal leído, ajustar un centavo, o asignar un producto nuevo a su categoría.
6. **Guardado (Confirmación):** Al darle "Guardar", la factura se registra en la base de datos exactamente como si la hubiera escrito a mano (ejecutando la lógica de stock, historial de costos y cuentas por pagar sin riesgo).

---

## 🆓 2. Opciones GRATUITAS para Empezar (Costo $0)

Para empezar a probar y validar la idea sin gastar dinero, estas son las mejores opciones _Free Tier_ (Generosas para volumen bajo) o de software libre:

### Opción A (La Mejor y Más Fácil): Gemini API (Google AI Studio) - Plan Gratuito
* **¿Por qué elegirla?** El plan gratuito de la API de Google Gemini (modelo `gemini-1.5-flash` o `pro`) es **extremadamente generoso**. Permite hasta 15 consultas por minuto y 1.500 al día **completamente gratis**.
* **Capacidad Vision:** Gemini es nativamente multimodal, entiende imágenes (fotos de facturas o PDFs) y extrae JSON estructurado con altísima precisión.
* **Implementación:** Supabase Edge Function llamando a la API de Gemini (solo necesitas sacar un API Key gratis de Google AI Studio).
* **Escalabilidad:** Si en algún momento necesitas miles de facturas diarias, pasas al plan de pago, que igual es baratísimo.
* **Veredicto:** 🏆 **La ganadora absoluta para empezar gratis hoy mismo.**

### Opción B: Groq API + Modelo Llama 3.2 Vision (Grog Cloud)
* **¿Por qué elegirla?** Groq no es un modelo, es un procesador ultra-rápido (LPU). Tienen un plan gratuito para desarrolladores que permite usar modelos Open Source como `Llama-3.2-11B-Vision` (de Meta).
* **Velocidad:** Es increíblemente rápido. Extraería la factura en 1 segundo.
* **Limitaciones:** El modelo de visión Open Source puede requerir un "Prompt" mucho más preciso que Gemini o GPT-4o para no equivocarse con los formatos de factura complejos.
* **Costo:** Gratis para _rate limits_ bajos.

### Opción C (Puro Código Libre): Tesseract.js (OCR en el Navegador) + Regex
* **¿Por qué elegirla?** Todo corre en la computadora (o celular) del usuario. 100% gratis siempre, sin APIs externas.
* **Flujo:** Subes la foto, `Tesseract.js` (una librería Javascript) lee "en crudo" todo el texto de la imagen, y tú con código (Expresiones Regulares - Regex) intentas adivinar qué es qué.
* **El Problema:** Tesseract no entiende el contexto. Si lee "Total: 100", no sabe si es 100 naranjas o $100. Construir las reglas manuales es muy difícil porque cada proveedor tiene su formato distinto.
* **Veredicto:** ❌ Descartada. Te hará perder tiempo intentar que el JSON sea perfecto sin una IA que "entienda" qué es una factura.

---

## 🛠️ 3. Opciones de Pago (Para cuando escales)

*(Si un día procesas miles de facturas y el plan gratuito de Gemini no te alcanza)*

### Opción D: Supabase Edge Functions + OpenAI Vision (GPT-4o)
* **Costo:** Cerca de $0.01 - $0.03 por factura procesada.
* **Ventaja:** OpenAI (GPT-4o) o Anthropic (Claude 3.5 Sonnet) suelen ser un 1-2% más precisos en facturas manuscritas feas o borrosas que los modelos gratuitos.

### Opción E: DocumentAI de Google Cloud (Enterprise)
* **Costo:** Se paga por bloque de 1000 documentos.
* **Ventaja:** Es el estándar corporativo para leer facturas formales. Devuelve coordenadas visuales. Complejo de integrar.

---

## 🧠 4. Estructura del Prompt (El Secreto para la API Gratuita)

Si usamos **Gemini API (Gratis)**, este sería el "cerebro" de la instrucción:

```text
SYSTEM INSTRUCTION:
Eres un sistema contable experto. Analiza la imagen de la factura adjunta y extrae la información requerida.
DEBES devolver ÚNICAMENTE un objeto JSON válido que cumpla estrictamente con esta interfaz TypeScript. 
No incluyas texto conversacional ni bloques markdown de código (```json).

interface ExtractedInvoice {
  number: string; // El número de factura o documento
  supplierName: string; // Nombre del proveedor o tienda
  dateIssue: string; // Formato YYYY-MM-DD
  subtotalUSD: number;
  freightTotalUSD: number; // Busca envío, flete, delivery. Por defecto 0.
  items: Array<{
    sku: string; // Intenta hallar un código de ítem. Si no hay, genera uno corto de 4 letras basado en el nombre.
    name: string; // Descripción del producto
    quantity: number;
    costUnitUSD: number; // Costo por unidad
  }>;
}
```

---

## 📝 5. Resumen del Plan de Implementación a Costo $0

1. **Crear cuenta en Google AI Studio:** Sacar una API Key (Gratis total).
2. **Backend (Supabase Edge Function):** Crear un micro-código en Supabase (TypeScript) que reciba la foto desde React y la envíe a la API de Gemini usando tu Key gratuita. Gemini responde con el JSON y Supabase se lo pasa de vuelta a React.
3. **Frontend (Tu app actual):** Crear el botón "✨ Escanear", subir la foto, recibir el JSON y rellenar automáticamente el formulario de `Invoices.tsx`. El usuario guarda y la app hace el resto.
