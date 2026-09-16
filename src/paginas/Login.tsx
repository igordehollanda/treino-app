import { useState } from 'react'
import type { AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Modo = 'senha' | 'link'

export default function Login() {
  // Senha e o padrao porque nao depende de e-mail chegar: o link magico
  // ja deixou as tres pessoas de fora quando o limite de envio estourou.
  const [modo, setModo] = useState<Modo>('senha')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'enviado'>('parado')
  const [erro, setErro] = useState<string | null>(null)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEstado('enviando')
    setErro(null)

    if (modo === 'senha') {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      })
      if (error) {
        setErro(explicar(error))
        setEstado('parado')
      }
      // Sucesso: o onAuthStateChange troca a tela sozinho.
      return
    }

    // shouldCreateUser: false — o app e fechado. Mesmo que o cadastro
    // fique ligado no painel por engano, e-mail novo nao vira conta.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    if (error) {
      setErro(explicar(error))
      setEstado('parado')
    } else {
      setEstado('enviado')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-7 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">Treino</h1>
        <p className="mt-2 text-sm text-suave">Seus treinos e suas cargas.</p>
      </div>

      {estado === 'enviado' ? (
        <div className="max-w-xs text-center">
          <p className="font-medium text-feito">Link enviado.</p>
          <p className="mt-2 text-sm text-suave">
            Abra o e-mail <span className="text-texto">{email}</span> no celular e toque
            no link.
          </p>
          <button
            onClick={() => {
              setEstado('parado')
              setModo('senha')
            }}
            className="mt-4 text-sm text-fraco underline"
          >
            entrar com senha
          </button>
        </div>
      ) : (
        <form onSubmit={entrar} className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="username"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-borda bg-superficie px-4 py-3.5 text-base outline-none focus:border-acento"
          />

          {modo === 'senha' && (
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="sua senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="rounded-xl border border-borda bg-superficie px-4 py-3.5 text-base outline-none focus:border-acento"
            />
          )}

          <button
            type="submit"
            disabled={estado === 'enviando'}
            className="rounded-xl bg-acento py-3.5 text-base font-semibold active:bg-acento-forte disabled:opacity-50"
          >
            {estado === 'enviando'
              ? 'Aguarde…'
              : modo === 'senha'
                ? 'Entrar'
                : 'Enviar link por e-mail'}
          </button>

          {erro && (
            <p className="rounded-xl border border-erro/30 bg-erro/10 px-3 py-2.5 text-sm text-erro">
              {erro}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setModo(modo === 'senha' ? 'link' : 'senha')
              setErro(null)
            }}
            className="mt-1 text-center text-sm text-fraco underline"
          >
            {modo === 'senha' ? 'prefiro receber um link por e-mail' : 'entrar com senha'}
          </button>
        </form>
      )}
    </div>
  )
}

/**
 * Traduz o erro do Supabase sem escondê-lo.
 *
 * A versao anterior dizia sempre "confira o e-mail", o que mandava a
 * pessoa procurar um erro de digitacao quando a causa real era o limite
 * de envio. Mensagem de erro que mente custa mais caro que mensagem
 * tecnica.
 */
function explicar(error: AuthError): string {
  const m = (error.message ?? '').toLowerCase()

  if (m.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (error.status === 429 || m.includes('rate limit') || m.includes('too many')) {
    return 'Limite de e-mails atingido. O envio do Supabase no plano gratuito é restrito, somando as três pessoas. Entre com senha, ou espere alguns minutos.'
  }
  if (m.includes('signups not allowed') || m.includes('otp_disabled') || m.includes('not found')) {
    return 'Este e-mail não está entre os cadastrados no app.'
  }
  if (m.includes('email not confirmed')) {
    return 'Esta conta ainda não foi confirmada. No Supabase, recrie o usuário com "Auto Confirm User" marcado.'
  }
  if (m.includes('redirect') || m.includes('not allowed')) {
    return `O Supabase recusou o endereço deste site. Confira Authentication → URL Configuration. (${error.message})`
  }
  return `Não consegui entrar: ${error.message}`
}
