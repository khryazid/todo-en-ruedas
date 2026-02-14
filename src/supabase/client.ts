import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '❌ Faltan variables de entorno de Supabase.\n' +
    'Crea un archivo .env en la raíz del proyecto con:\n' +
    'VITE_SUPABASE_URL=https://tu-proyecto.supabase.co\n' +
    'VITE_SUPABASE_ANON_KEY=tu_anon_key'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
