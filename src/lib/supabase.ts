import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Sem .env preenchido nao da para falar com o banco. A UI avisa em vez
 *  de quebrar em tela branca — este e o primeiro erro de quem clona. */
export const configurado = Boolean(url && chave)

export const supabase = createClient(
  url || 'http://localhost:54321',
  chave || 'sem-chave',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
