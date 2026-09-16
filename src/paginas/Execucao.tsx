import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  apagarSerie, buscarSemanaAtual, buscarSeriesDaSessao, buscarTreinos, buscarUltimasCargas,
  cargasEmCache, finalizarSessao, registrarSerie, semanaEmCache, sessaoLocal, treinosEmCache,
} from '../lib/db'
import { repsDoDia } from '../lib/periodizacao'
import type {
  SemanaCiclo, Sessao, SerieRegistro, TreinoCompleto, TreinoExercicio, UltimaCarga,
} from '../lib/tipos'

type Marcada = { carga: string; reps: string; feita: boolean }
const chave = (nome: string, serie: number) => `${nome}::${serie}`

export default function Execucao() {
  const { sessaoId } = useParams()
  const { perfil } = useAuth()
  const navegar = useNavigate()

  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [treino, setTreino] = useState<TreinoCompleto | null>(null)
  const [cargas, setCargas] = useState<Record<string, UltimaCarga>>(
    perfil ? cargasEmCache(perfil.id) : {},
  )
  const [marcadas, setMarcadas] = useState<Record<string, Marcada>>({})
  const [semana, setSemana] = useState<SemanaCiclo | null>(semanaEmCache())
  const [descanso, setDescanso] = useState<number | null>(null)
  const [reabertos, setReabertos] = useState<Set<string>>(new Set())
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const [finalizando, setFinalizando] = useState(false)

  // 1. Carrega a sessao e o que ja foi registrado nela.
  useEffect(() => {
    if (!sessaoId || !perfil) return

    // O local responde na hora; o servidor so corrige se ja tiver a linha.
    setSessao(sessaoLocal(sessaoId))
    void supabase
      .from('sessoes').select('*').eq('id', sessaoId).maybeSingle()
      .then(({ data }) => {
        if (data) setSessao(data as Sessao)
      })

    void buscarUltimasCargas(perfil.id).then(setCargas).catch(console.error)
    void buscarSemanaAtual().then(setSemana).catch(console.error)

    void buscarSeriesDaSessao(sessaoId)
      .then((series) => setMarcadas(reidratar(series)))
      .catch(console.error)
  }, [sessaoId, perfil])

  // 2. Com a sessao em maos, acha o treino dela. O cache responde primeiro
  //    para a tela abrir na hora; a rede corrige em seguida, se houver.
  useEffect(() => {
    const alvo = sessao?.treino_id
    if (!alvo) return
    setTreino(treinosEmCache().find((t) => t.id === alvo) ?? null)
    void buscarTreinos()
      .then((ts) => {
        const t = ts.find((x) => x.id === alvo)
        if (t) setTreino(t)
      })
      .catch(console.error)
  }, [sessao])

  // Contagem regressiva do descanso.
  useEffect(() => {
    if (descanso === null) return
    if (descanso <= 0) {
      setDescanso(null)
      vibrar()
      return
    }
    const t = setTimeout(() => setDescanso((s) => (s === null ? null : s - 1)), 1000)
    return () => clearTimeout(t)
  }, [descanso])

  const meusItens = useMemo(
    () =>
      (treino?.itens ?? []).filter(
        (i) => i.perfil_id === null || i.perfil_id === perfil?.id,
      ),
    [treino, perfil],
  )

  const totalSeries = meusItens.reduce((n, i) => n + i.series, 0)
  const feitas = Object.values(marcadas).filter((m) => m.feita).length

  const concluido = useCallback(
    (item: TreinoExercicio) => {
      const nome = item.exercicios?.nome ?? 'Exercício'
      return Array.from({ length: item.series }, (_, i) => i + 1).every(
        (n) => marcadas[chave(nome, n)]?.feita,
      )
    },
    [marcadas],
  )

  /**
   * Leva o proximo exercicio pendente para o topo da tela.
   * E o que evita procurar "onde eu estava" rolando a lista inteira com
   * a mao suada depois de cada serie.
   */
  const irParaProximo = useCallback(
    (atual: TreinoExercicio) => {
      const i = meusItens.findIndex((x) => x.id === atual.id)
      const proximo = meusItens.slice(i + 1).find((x) => !concluido(x))
      const alvo = refs.current[proximo?.id ?? '']
      if (alvo) {
        setTimeout(() => alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350)
      }
    },
    [meusItens, concluido],
  )

  const alterar = useCallback((k: string, campo: 'carga' | 'reps', valor: string) => {
    setMarcadas((m) => {
      const atual = m[k] ?? { carga: '', reps: '', feita: false }
      return { ...m, [k]: { ...atual, [campo]: valor } }
    })
  }, [])

  const alternar = useCallback(
    async (item: TreinoExercicio, serie: number, padraoCarga: string, padraoReps: string) => {
      if (!perfil || !sessaoId) return
      const nome = item.exercicios?.nome ?? 'Exercício'
      const k = chave(nome, serie)
      const atual = marcadas[k]

      if (atual?.feita) {
        setMarcadas((m) => ({ ...m, [k]: { ...atual, feita: false } }))
        await apagarSerie(sessaoId, nome, serie).catch(console.error)
        return
      }

      const carga = atual?.carga || padraoCarga
      const reps = atual?.reps || padraoReps
      setMarcadas((m) => ({ ...m, [k]: { carga, reps, feita: true } }))
      vibrar()
      if (item.descanso_seg > 0) setDescanso(item.descanso_seg)
      if (serie === item.series) irParaProximo(item)

      await registrarSerie({
        sessao_id: sessaoId,
        perfil_id: perfil.id,
        exercicio_id: item.exercicio_id,
        exercicio_nome: nome,
        serie,
        carga_kg: carga === '' ? null : Number(carga.replace(',', '.')),
        reps: reps === '' ? null : Number(reps),
        registrada_em: new Date().toISOString(),
      })
    },
    [marcadas, perfil, sessaoId, irParaProximo],
  )

  async function terminar() {
    if (!sessao) return
    setFinalizando(true)
    await finalizarSessao(sessao, null)
    navegar('/', { replace: true })
  }

  if (!treino || !sessao) {
    return <div className="p-8 text-center text-slate-400">carregando treino…</div>
  }

  // A barra de descanso flutua por cima: o espaco extra embaixo evita que
  // ela cubra o botao de finalizar.
  return (
    <div className={descanso !== null ? 'min-h-dvh pb-44' : 'min-h-dvh pb-24'}>
      <header className="sticky top-0 z-10 border-b border-borda bg-fundo/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{treino.nome}</h1>
            <p className="text-xs text-slate-400">
              {feitas} de {totalSeries} séries
              {semana && (
                <>
                  {' · '}
                  <span className="text-slate-300">
                    semana {semana.semana} · {semana.reps} reps
                  </span>
                </>
              )}
            </p>
          </div>
          <button
            onClick={() => navegar('/')}
            className="shrink-0 text-sm text-slate-400"
          >
            voltar
          </button>
        </div>
        <div className="mx-auto mt-2 h-1 max-w-lg overflow-hidden rounded-full bg-borda">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${totalSeries ? (feitas / totalSeries) * 100 : 0}%` }}
          />
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-4 p-5">
        {meusItens.map((item) => (
          <CartaoExercicio
            key={item.id}
            ref={(el) => {
              refs.current[item.id] = el
            }}
            item={item}
            semana={semana}
            ultima={cargas[item.exercicio_id]}
            marcadas={marcadas}
            concluido={concluido(item)}
            reaberto={reabertos.has(item.id)}
            aoReabrir={() =>
              setReabertos((r) => {
                const novo = new Set(r)
                if (novo.has(item.id)) novo.delete(item.id)
                else novo.add(item.id)
                return novo
              })
            }
            aoAlterar={alterar}
            aoAlternar={alternar}
          />
        ))}

        <button
          onClick={() => void terminar()}
          disabled={finalizando}
          className="mt-2 rounded-2xl bg-emerald-600 py-4 text-base font-semibold active:bg-emerald-700 disabled:opacity-50"
        >
          {finalizando ? 'Salvando...' : 'Finalizar treino'}
        </button>
      </div>

      {descanso !== null && (
        <BarraDescanso
          segundos={descanso}
          aoPular={() => setDescanso(null)}
          aoSomar={() => setDescanso((s) => (s ?? 0) + 30)}
        />
      )}
    </div>
  )
}

function CartaoExercicio({
  ref, item, semana, ultima, marcadas, concluido, reaberto, aoReabrir, aoAlterar, aoAlternar,
}: {
  ref?: React.Ref<HTMLElement>
  item: TreinoExercicio
  semana: SemanaCiclo | null
  ultima?: UltimaCarga
  marcadas: Record<string, Marcada>
  concluido: boolean
  reaberto: boolean
  aoReabrir: () => void
  aoAlterar: (k: string, campo: 'carga' | 'reps', v: string) => void
  aoAlternar: (i: TreinoExercicio, s: number, c: string, r: string) => Promise<void>
}) {
  const nome = item.exercicios?.nome ?? 'Exercício'
  const alvoReps = repsDoDia(item, semana)
  const padraoCarga = ultima?.carga_kg != null ? String(ultima.carga_kg) : ''
  // A meta da semana manda no chute inicial das repeticoes.
  const padraoReps = primeiroNumero(alvoReps)

  const series = Array.from({ length: item.series }, (_, i) => i + 1)

  // Exercicio concluido vira uma linha. Sete exercicios abertos viram uma
  // rolagem de 25 linhas de input; conforme o treino anda, a tela encolhe
  // e o que falta fica na mao.
  if (concluido && !reaberto) {
    return (
      <section ref={ref as React.Ref<HTMLElement>}>
        <button
          onClick={aoReabrir}
          className="flex w-full items-center gap-3 rounded-2xl border border-emerald-600/30 bg-emerald-950/20 px-4 py-3 text-left"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold">
            ✓
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-300">{nome}</span>
            <span className="text-xs text-slate-500">{resumo(nome, series, marcadas)}</span>
          </span>
          <span className="shrink-0 text-xs text-slate-600">editar</span>
        </button>
      </section>
    )
  }

  return (
    <section
      ref={ref as React.Ref<HTMLElement>}
      className="scroll-mt-24 rounded-2xl border border-borda bg-cartao p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold leading-tight">{nome}</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {item.series} × {alvoReps}
            {item.descanso_seg > 0 && ` · ${item.descanso_seg}s`}
            {item.reps && <span className="ml-1.5 text-amber-400/80">fixo</span>}
          </p>
        </div>
        {concluido && (
          <button onClick={aoReabrir} className="shrink-0 text-xs text-slate-500">
            fechar
          </button>
        )}
      </div>

      {item.observacao && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {item.observacao}
        </p>
      )}

      {ultima && (
        <p className="mt-2 text-xs text-slate-500">
          última vez: {ultima.carga_kg}kg
          {ultima.reps ? ` × ${ultima.reps}` : ''} · {dataCurta(ultima.registrada_em)}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {series.map((serie) => {
          const k = chave(nome, serie)
          const m = marcadas[k]
          const feita = m?.feita ?? false
          return (
            <div key={serie} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-sm text-slate-500">{serie}</span>

              <Campo
                valor={m?.carga ?? ''}
                placeholder={padraoCarga || '—'}
                sufixo="kg"
                feita={feita}
                aoMudar={(v) => aoAlterar(k, 'carga', v)}
              />
              <Campo
                valor={m?.reps ?? ''}
                placeholder={padraoReps || '—'}
                sufixo="reps"
                feita={feita}
                aoMudar={(v) => aoAlterar(k, 'reps', v)}
              />

              <button
                onClick={() => void aoAlternar(item, serie, padraoCarga, padraoReps)}
                aria-label={feita ? `Desmarcar série ${serie}` : `Concluir série ${serie}`}
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl font-bold transition-colors ${
                  feita
                    ? 'bg-emerald-600 text-white'
                    : 'border border-borda bg-slate-800 text-slate-500 active:bg-slate-700'
                }`}
              >
                ✓
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** "3 × 8 · 32kg" — o que foi de fato registrado, nao o prescrito. */
function resumo(nome: string, series: number[], marcadas: Record<string, Marcada>) {
  const feitas = series
    .map((n) => marcadas[chave(nome, n)])
    .filter((m): m is Marcada => Boolean(m?.feita))
  if (feitas.length === 0) return ''

  const cargas = [...new Set(feitas.map((m) => m.carga).filter(Boolean))]
  const reps = [...new Set(feitas.map((m) => m.reps).filter(Boolean))]
  const partes = [`${feitas.length} série${feitas.length > 1 ? 's' : ''}`]
  if (reps.length > 0) partes.push(`${reps.join('/')} reps`)
  if (cargas.length > 0) partes.push(`${cargas.join('/')}kg`)
  return partes.join(' · ')
}

function Campo({
  valor, placeholder, sufixo, feita, aoMudar,
}: {
  valor: string
  placeholder: string
  sufixo: string
  feita: boolean
  aoMudar: (v: string) => void
}) {
  return (
    <div className="relative flex-1">
      <input
        inputMode="decimal"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => aoMudar(e.target.value)}
        // O teclado do celular cobre metade da tela: sem isto, o campo
        // que voce acabou de tocar some atras dele.
        onFocus={(e) => {
          const alvo = e.target
          setTimeout(() => alvo.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
        }}
        className={`w-full rounded-xl border py-3 pl-3 pr-9 text-base outline-none focus:border-blue-500 ${
          feita ? 'border-emerald-600/40 bg-emerald-950/30' : 'border-borda bg-slate-800'
        }`}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
        {sufixo}
      </span>
    </div>
  )
}

function BarraDescanso({
  segundos, aoPular, aoSomar,
}: {
  segundos: number
  aoPular: () => void
  aoSomar: () => void
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-cartao px-5 py-3"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-slate-400">Descanso</p>
          <p className="font-mono text-2xl font-bold tabular-nums">
            {String(Math.floor(segundos / 60)).padStart(2, '0')}:
            {String(segundos % 60).padStart(2, '0')}
          </p>
        </div>
        <button onClick={aoSomar} className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium">
          +30s
        </button>
        <button onClick={aoPular} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium">
          Pular
        </button>
      </div>
    </div>
  )
}

function reidratar(series: SerieRegistro[]) {
  const m: Record<string, Marcada> = {}
  for (const s of series) {
    m[chave(s.exercicio_nome, s.serie)] = {
      carga: s.carga_kg != null ? String(s.carga_kg) : '',
      reps: s.reps != null ? String(s.reps) : '',
      feita: true,
    }
  }
  return m
}

/** "10-12" -> "10". Da um chute util quando nao ha historico. */
function primeiroNumero(reps: string) {
  return reps.match(/\d+/)?.[0] ?? ''
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function vibrar() {
  try {
    navigator.vibrate?.(40)
  } catch {
    /* navegador sem vibracao */
  }
}

