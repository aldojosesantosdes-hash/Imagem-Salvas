import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && key);
export const supabase = configurado ? createClient(url, key, { auth: { persistSession: true } }) : null;
