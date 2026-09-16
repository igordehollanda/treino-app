import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/** Trocar a propria senha sem depender de e-mail chegar. */
export default function Conta() {
  const { perfil, sessao, sair } = useAuth()
  const navegar = useNavigate()
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [estado, setEstado] = useState<'parado' | 'salvando' | 'salva'>('parado')
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (senha !== repetida) {
      setErro('As duas senhas não são iguais.')
      return
    }
    if (senha.length < 6) {
      setErro('Use pelo menos 6 caracteres.')
      return
    }
    setEstado('salvando')
    setErro(null)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setErro(error.message)
      setEstado('parado')
    } else {
      setSenha('')
      setRepetida('')
      setEstado('salva')
    }
  }

  return (
    <div className="mx-auto max-w-lg p-5 md:max-w-xl">
      <button onClick={() => navegar('/')} className="mb-4 text-sm text-suave">
        ← Hoje
      </button>

      <h1 className="text-2xl font-bold">{perfil?.nome}</h1>
      <p className="mt-0.5 text-sm text-suave">{sessao?.user.email}</p>
      <p className="mt-1 text-sm text-fraco">
        {perfil?.papel === 'personal' ? 'Personal' : 'Aluno'}
      </p>

      <form onSubmit={salvar} className="mt-6 flex flex-col gap-3">
        <h2 className="text-sm font-medium text-texto">Definir uma senha</h2>
        <p className="-mt-1 text-xs text-fraco">
          Com senha você entra mesmo quando o e-mail do link não chega.
        </p>

        <input
          type="password"
          autoComplete="new-password"
          placeholder="nova senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="rounded-xl border border-borda bg-superficie px-4 py-3.5 text-base outline-none focus:border-acento"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="repita a senha"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          className="rounded-xl border border-borda bg-superficie px-4 py-3.5 text-base outline-none focus:border-acento"
        />

        <button
          type="submit"
          disabled={estado === 'salvando'}
          className="rounded-xl bg-acento py-3.5 font-semibold active:bg-acento-forte disabled:opacity-50"
        >
          {estado === 'salvando' ? 'Salvando…' : 'Salvar senha'}
        </button>

        {estado === 'salva' && (
          <p className="rounded-xl border border-feito/30 bg-feito/10 px-3 py-2.5 text-sm text-feito">
            Senha salva. Já dá para entrar com ela.
          </p>
        )}
        {erro && (
          <p className="rounded-xl border border-erro/30 bg-erro/10 px-3 py-2.5 text-sm text-erro">
            {erro}
          </p>
        )}
      </form>

      <button
        onClick={() => void sair()}
        className="mt-8 w-full rounded-xl border border-borda py-3 text-sm text-suave"
      >
        Sair
      </button>
    </div>
  )
}
