import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  buscarSemanaAtual, buscarSessaoAberta, buscarSessoes, buscarTreinos, iniciarSessao,
  semanaEmCache, treinosEmCache,
} from '../lib/db'
import type { SemanaCiclo, Sessao, TreinoCompleto } from '../lib/tipos'

export default function Hoje() {
  const { perfil, ehPersonal } = useAuth()
  const navegar = useNavigate()
  const [treinos, setTreinos] = useState<TreinoCompleto[]>(treinosEmCache())
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [aberta, setAberta] = useState<Sessao | null>(null)
  const [semana, setSemana] = useState<SemanaCiclo | null>(semanaEmCache())

  useEffect(() => {
    if (!perfil) return
    const trintaDias = new Date(Date.now() - 30 * 864e5)
    void buscarTreinos().then(setTreinos).catch(console.error)
    void buscarSessoes(perfil.id, trintaDias).then(setSessoes).catch(console.error)
    void buscarSessaoAberta(perfil.id).then(setAberta).catch(console.error)
    void buscarSemanaAtual().then(setSemana).catch(console.error)

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

  // Com uma sessao em andamento, nada disputa atencao com ela: todos os
  // treinos viram linha.
  const principal = aberta ? null : sugerido
  const resto = meusTreinos.filter((t) => t.id !== principal?.id)

  async function comecar(treino: TreinoCompleto) {
    if (!perfil) return
    const nova = await iniciarSessao(perfil.id, treino.id, treino.nome)
    navegar(`/executar/${nova.id}`)
  }

  return (
    <div className="mx-auto max-w-lg p-5 md:max-w-3xl">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-sm text-suave">{saudacao()},</p>
          <h1 className="text-[26px] font-extrabold leading-tight">{perfil?.nome}</h1>
        </div>
        <button
          onClick={() => navegar('/conta')}
          className="mt-1 text-xs text-fraco underline"
        >
          conta
        </button>
      </header>

      <div className="md:grid md:grid-cols-2 md:items-start md:gap-4">
        {semana && <FaixaDoCiclo semana={semana} />}
        <FaixaDaSemana sessoes={sessoes} />
      </div>

      {aberta && (
        <button
          onClick={() => navegar(`/executar/${aberta.id}`)}
          className="mb-6 w-full rounded-2xl border border-alerta/40 bg-alerta/10 p-4 text-left"
        >
          <p className="rotulo text-alerta">Treino em andamento</p>
          <p className="mt-1 text-lg font-bold">{aberta.treino_nome}</p>
          <p className="text-sm text-suave">Toque para continuar de onde parou</p>
        </button>
      )}

      {meusTreinos.length === 0 ? (
        <p className="rounded-2xl border border-borda bg-superficie p-6 text-center text-sm text-suave">
          Nenhum treino atribuído ainda.
          {ehPersonal ? ' Monte o primeiro na aba Treinos.' : ' Fale com o personal.'}
        </p>
      ) : (
        <>
          {principal && (
            <CartaoPrincipal
              treino={principal}
              perfilId={perfil?.id ?? ''}
              ultima={sessoes.find((s) => s.treino_id === principal.id)}
              aoComecar={() => void comecar(principal)}
            />
          )}
          <div className="flex flex-col gap-2 md:grid md:grid-cols-2">
            {resto.map((t) => (
              <LinhaTreino
                key={t.id}
                treino={t}
                perfilId={perfil?.id ?? ''}
                ultima={sessoes.find((s) => s.treino_id === t.id)}
                aoComecar={() => void comecar(t)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Quanto custa este treino: numero de exercicios, series e uma estimativa
 * de duracao (45s por serie + o descanso prescrito). Ajuda a decidir se
 * da tempo antes de sair de casa.
 */
function custo(treino: TreinoCompleto, perfilId: string) {
  const meus = treino.itens.filter((i) => i.perfil_id === null || i.perfil_id === perfilId)
  const series = meus.reduce((n, i) => n + i.series, 0)
  const minutos = Math.round(
    meus.reduce((s, i) => s + i.series * (45 + i.descanso_seg), 0) / 60,
  )
  return { exercicios: meus.length, series, minutos }
}

/** O treino da vez. Unico com botao grande — um alvo obvio por tela. */
function CartaoPrincipal({
  treino, perfilId, ultima, aoComecar,
}: {
  treino: TreinoCompleto
  perfilId: string
  ultima?: Sessao
  aoComecar: () => void
}) {
  const c = custo(treino, perfilId)
  return (
    <div className="mb-3 rounded-2xl border border-acento/60 bg-superficie p-4">
      <p className="rotulo text-acento">Próximo treino</p>
      <h2 className="mt-1.5 text-xl font-extrabold leading-tight">{treino.nome}</h2>
      <p className="mt-1.5 text-sm text-suave">
        <span className="font-bold text-texto">{c.exercicios}</span> exercícios ·{' '}
        <span className="font-bold text-texto">{c.series}</span> séries ·{' '}
        <span className="font-bold text-texto">~{c.minutos}</span> min
      </p>
      {ultima && (
        <p className="text-sm text-fraco">última vez {diasAtras(ultima.iniciada_em)}</p>
      )}
      <button
        onClick={aoComecar}
        className="mt-3 w-full rounded-xl bg-acento py-4 text-base font-semibold active:bg-acento-forte"
      >
        Iniciar
      </button>
    </div>
  )
}

/** Os outros treinos: a linha inteira e o botao. */
function LinhaTreino({
  treino, perfilId, ultima, aoComecar,
}: {
  treino: TreinoCompleto
  perfilId: string
  ultima?: Sessao
  aoComecar: () => void
}) {
  const c = custo(treino, perfilId)
  return (
    <button
      onClick={aoComecar}
      className="flex w-full items-center gap-3 rounded-xl border border-borda bg-superficie px-4 py-3 text-left active:bg-elevado"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{treino.nome}</span>
        <span className="text-xs text-fraco">
          {c.exercicios} ex · {c.series} séries · ~{c.minutos} min
          {ultima && ` · ${diasAtras(ultima.iniciada_em)}`}
        </span>
      </span>
      <span className="shrink-0 text-lg text-fraco/70">›</span>
    </button>
  )
}

/**
 * A meta de repeticoes de hoje, vinda da periodizacao.
 * Fica no alto porque e a primeira coisa que muda o que voce vai fazer
 * na academia — antes ate de escolher o treino.
 */
function FaixaDoCiclo({ semana }: { semana: SemanaCiclo }) {
  return (
    <div className="mb-3 rounded-2xl border border-acento/30 bg-acento/10 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="rotulo text-acento">
          Semana {semana.semana} de {semana.total}
        </span>
        <span className="valor text-2xl text-texto">
          {semana.reps} <span className="text-xs font-semibold text-acento">reps</span>
        </span>
      </div>
      {semana.observacao && (
        <p className="mt-1.5 text-sm text-suave">{semana.observacao}</p>
      )}
      <p className="mt-1 text-xs text-fraco">
        {semana.diasParaProxima === 1
          ? 'muda amanhã'
          : `muda em ${semana.diasParaProxima} dias`}
      </p>
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
    <div className="mb-6 rounded-2xl border border-borda bg-superficie p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="rotulo">Últimos 7 dias</span>
        <span className="text-sm font-bold">
          {total} treino{total === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex justify-between">
        {dias.map((d) => {
          const fez = treinados.has(chaveDia(d))
          return (
            <div key={d.toISOString()} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase text-fraco">
                {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()]}
              </span>
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold ${
                  fez ? 'bg-feito text-fundo' : 'border border-borda text-fraco/70'
                }`}
              >
                {d.getDate()}
              </div>
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
