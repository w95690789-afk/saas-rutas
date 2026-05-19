import { createClient } from '@supabase/supabase-js';

// Usaremos las variables de entorno de Vite para la seguridad (Zero-Hardcode)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Si faltan las variables en local, lanzamos un error descriptivo
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ Faltan variables de entorno para Supabase. Verifica tu archivo .env.local");
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);
