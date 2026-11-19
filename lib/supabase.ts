import { createBrowserClient } from '@supabase/ssr';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// O browser e o servidor partilham a sessao por cookies (PKCE).
export const supabase = url && key ? createBrowserClient(url, key) : null;
