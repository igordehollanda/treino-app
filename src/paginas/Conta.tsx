import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  buscarPlano, buscarTreinos, definirDiaDoPlano, planoEmCache, treinosEmCache,
} from '../lib/db'
import type { TreinoCompleto } from '../lib/tipos'

// Segunda primeiro: e como uma semana de treino e pensada.
const DIAS: [number, string][] = [
  [1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'],
  [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo'],
]

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

      <PlanoDaSemana perfilId={perfil?.id ?? ''} ehPersonal={perfil?.papel === 'personal'} />

      <button
        onClick={() => void sair()}
        className="mt-8 w-full rounded-xl border border-borda py-3 text-sm text-suave"
      >
        Sair
      </button>
    </div>
  )
}

/** Que treino em cada dia. Dia sem treino e descanso. */
function PlanoDaSemana({ perfilId, ehPersonal }: { perfilId: string; ehPersonal: boolean }) {
  const [treinos, setTreinos] = useState<TreinoCompleto[]>(treinosEmCache())
  const [plano, setPlano] = useState<Record<number, string>>(planoEmCache(perfilId))
  const [salvando, setSalvando] = useState<number | null>(null)

  useEffect(() => {
    if (!perfilId) return
    void buscarTreinos().then(setTreinos).catch(console.error)
    void buscarPlano(perfilId).then(setPlano).catch(console.error)
  }, [perfilId])

  const meus = treinos.filter(
    (t) => t.ativo && (ehPersonal || t.alunos.includes(perfilId)),
  )

  async function mudar(dia: number, treinoId: string) {
    setSalvando(dia)
    const alvo = treinoId || null
    // Otimista: o select responde na hora, a rede confirma depois.
    setPlano((p) => {
      const novo = { ...p }
      if (alvo) novo[dia] = alvo
      else delete novo[dia]
      return novo
    })
    try {
      await definirDiaDoPlano(perfilId, dia, alvo)
    } catch (e) {
      console.error(e)
      await buscarPlano(perfilId).then(setPlano).catch(console.error)
    } finally {
      setSalvando(null)
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-texto">Plano da semana</h2>
      <p className="mt-1 text-xs text-fraco">
        É daqui que a tela Hoje sabe qual é o treino do dia.
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {DIAS.map(([dia, nome]) => (
          <label key={dia} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-suave">{nome}</span>
            <select
              value={plano[dia] ?? ''}
              disabled={salvando === dia}
              onChange={(e) => void mudar(dia, e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-borda bg-superficie px-3 py-2.5 text-sm outline-none focus:border-acento disabled:opacity-50"
            >
              <option value="">descanso</option>
              {meus.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  )
}
