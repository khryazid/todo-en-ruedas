import { createClient } from '@supabase/supabase-js';

// Reemplaza esto con los datos que copiaste de Supabase (Project Settings -> API)
const supabaseUrl = 'https://zdoqkpvqpnyntxmudcda.supabase.co'; // Ej: https://xyz.supabase.co
const supabaseKey = 'sb_publishable_v1L7gfgvKYsGQwM1LMBGpg_fjTT1Q3K';    // Ej: eyJhbGciOiJIUzI1NiIsInR5cCI6...

export const supabase = createClient(supabaseUrl, supabaseKey);