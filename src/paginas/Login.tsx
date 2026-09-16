import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'enviado'>('parado')
  const [erro, setErro] = useState<string | null>(null)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEstado('enviando')
    setErro(null)
    // shouldCreateUser: false — o app e fechado. Mesmo que o signup fique
    // ligado no painel por engano, nenhum e-mail novo vira conta por aqui.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    if (error) {
      setErro('Nao consegui enviar. Confira o e-mail — so os tres cadastrados entram.')
      setEstado('parado')
    } else {
      setEstado('enviado')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Treino</h1>
        <p className="mt-2 text-sm text-slate-400">Seus treinos e suas cargas.</p>
      </div>

      {estado === 'enviado' ? (
        <div className="max-w-xs text-center">
          <p className="font-medium text-emerald-400">Link enviado.</p>
          <p className="mt-2 text-sm text-slate-400">
            Abra o e-mail <span className="text-slate-200">{email}</span> no celular e toque
            no link. Nao precisa de senha.
          </p>
        </div>
      ) : (
        <form onSubmit={entrar} className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-borda bg-cartao px-4 py-3.5 text-base outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={estado === 'enviando'}
            className="rounded-xl bg-blue-600 py-3.5 text-base font-semibold active:bg-blue-700 disabled:opacity-50"
          >
            {estado === 'enviando' ? 'Enviando...' : 'Entrar'}
          </button>
          {erro && <p className="text-center text-sm text-rose-400">{erro}</p>}
        </form>
      )}
    </div>
  )
}
