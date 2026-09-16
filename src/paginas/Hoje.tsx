import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  buscarSessaoAberta, buscarSessoes, buscarTreinos, iniciarSessao, treinosEmCache,
} from '../lib/db'
import type { Sessao, TreinoCompleto } from '../lib/tipos'

export default function Hoje() {
  const { perfil, ehPersonal, sair } = useAuth()
  const navegar = useNavigate()
  const [treinos, setTreinos] = useState<TreinoCompleto[]>(treinosEmCache())
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [aberta, setAberta] = useState<Sessao | null>(null)

  useEffect(() => {
    if (!perfil) return
    const trintaDias = new Date(Date.now() - 30 * 864e5)
    void buscarTreinos().then(setTreinos).catch(console.error)
    void buscarSessoes(perfil.id, trintaDias).then(setSessoes).catch(console.error)
    void buscarSessaoAberta(perfil.id).then(setAberta).catch(console.error)

    // O personal edita no celular dele; aqui a lista se atualiza sozinha.
    const canal = supabase
      .channel('treinos-ao-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'treino_exercicios' },
        () => void buscarTreinos().then(setTreinos).catch(console.error))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'treinos' },
        () => void buscarTreinos().then(setTreinos).catch(console.error))
      .subscribe()
    return () => void supabase.removeChannel(canal)
  }, [perfil])

  const meusTreinos = useMemo(
    () => treinos.filter((t) => t.ativo && (ehPersonal || t.alunos.includes(perfil?.id ?? ''))),
    [treinos, ehPersonal, perfil],
  )

  // Sugestao simples e util: o treino que voce fez ha mais tempo.
  const sugerido = useMemo(() => {
    if (meusTreinos.length === 0) return null
    const ultimaVez = new Map<string, number>()
    for (const s of sessoes) {
      if (s.treino_id && !ultimaVez.has(s.treino_id)) {
        ultimaVez.set(s.treino_id, new Date(s.iniciada_em).getTime())
      }
    }
    return [...meusTreinos].sort(
      (a, b) => (ultimaVez.get(a.id) ?? 0) - (ultimaVez.get(b.id) ?? 0),
    )[0]
  }, [meusTreinos, sessoes])

  async function comecar(treino: TreinoCompleto) {
    if (!perfil) return
    const nova = await iniciarSessao(perfil.id, treino.id, treino.nome)
    navegar(`/executar/${nova.id}`)
  }

  return (
    <div className="mx-auto max-w-lg p-5">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{saudacao()},</p>
          <h1 className="text-2xl font-bold">{perfil?.nome}</h1>
        </div>
        <button onClick={() => void sair()} className="mt-1 text-xs text-slate-500">
          sair
        </button>
      </header>

      <FaixaDaSemana sessoes={sessoes} />

      {aberta && (
        <button
          onClick={() => navegar(`/executar/${aberta.id}`)}
          className="mb-6 w-full rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-left"
        >
          <p className="text-xs font-medium text-amber-400">TREINO EM ANDAMENTO</p>
          <p className="mt-1 text-lg font-semibold">{aberta.treino_nome}</p>
          <p className="text-sm text-slate-400">Toque para continuar de onde parou</p>
        </button>
      )}

      {meusTreinos.length === 0 ? (
        <p className="rounded-2xl border border-borda bg-cartao p-6 text-center text-sm text-slate-400">
          Nenhum treino atribuido ainda.
          {ehPersonal ? ' Monte o primeiro na aba Treinos.' : ' Fale com o personal.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {meusTreinos.map((t) => (
            <CartaoTreino
              key={t.id}
              treino={t}
              perfilId={perfil?.id ?? ''}
              sugerido={t.id === sugerido?.id && !aberta}
              ultima={sessoes.find((s) => s.treino_id === t.id)}
              aoComecar={() => void comecar(t)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CartaoTreino({
  treino, perfilId, sugerido, ultima, aoComecar,
}: {
  treino: TreinoCompleto
  perfilId: string
  sugerido: boolean
  ultima?: Sessao
  aoComecar: () => void
}) {
  // Conta so o que e seu: compartilhado + a sua variacao.
  const meus = treino.itens.filter((i) => i.perfil_id === null || i.perfil_id === perfilId)
  return (
    <div
      className={`rounded-2xl border bg-cartao p-4 ${
        sugerido ? 'border-blue-500' : 'border-borda'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{treino.nome}</h2>
          <p className="text-sm text-slate-400">
            {meus.length} exercicio{meus.length === 1 ? '' : 's'}
            {ultima && ` · ultima vez ${diasAtras(ultima.iniciada_em)}`}
          </p>
        </div>
        {sugerido && (
          <span className="shrink-0 rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-400">
            sugerido
          </span>
        )}
      </div>
      <button
        onClick={aoComecar}
        className="mt-3 w-full rounded-xl bg-blue-600 py-3 font-semibold active:bg-blue-700"
      >
        Iniciar
      </button>
    </div>
  )
}

/** Sete dias, com bolinha cheia no que treinou. Frequencia de relance. */
function FaixaDaSemana({ sessoes }: { sessoes: Sessao[] }) {
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (6 - i))
    return d
  })
  const treinados = new Set(sessoes.map((s) => s.iniciada_em.slice(0, 10)))
  const total = dias.filter((d) => treinados.has(chaveDia(d))).length

  return (
    <div className="mb-6 rounded-2xl border border-borda bg-cartao p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm text-slate-400">Ultimos 7 dias</span>
        <span className="text-sm font-semibold">
          {total} treino{total === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex justify-between">
        {dias.map((d) => {
          const fez = treinados.has(chaveDia(d))
          return (
            <div key={d.toISOString()} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] uppercase text-slate-500">
                {['d', 's', 't', 'q', 'q', 's', 's'][d.getDay()]}
              </span>
              <div
                className={`h-8 w-8 rounded-full ${
                  fez ? 'bg-emerald-500' : 'border border-borda bg-transparent'
                }`}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const chaveDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function diasAtras(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `ha ${dias} dias`
}
