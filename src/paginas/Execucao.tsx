import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  apagarSerie, buscarProgressao, buscarSemanaAtual, buscarSeriesDaSessao, buscarTreinos,
  buscarUltimasCargas, cargasEmCache, finalizarSessao, registrarSerie, semanaEmCache,
  sessaoLocal, treinosEmCache,
} from '../lib/db'
import { repsDoDia } from '../lib/periodizacao'
import { linkDeExecucao } from '../lib/execucao'
import GraficoCarga from '../componentes/GraficoCarga'
import type {
  PontoProgressao, SemanaCiclo, Sessao, SerieRegistro, TreinoCompleto, TreinoExercicio,
  UltimaCarga,
} from '../lib/tipos'

type Marcada = { carga: string; reps: string; rir: number | null; feita: boolean }
const vazia: Marcada = { carga: '', reps: '', rir: null, feita: false }
const chave = (nome: string, serie: number) => `${nome}::${serie}`

/** Exercicio solo ou um bi-set: a tela trata os dois pelo mesmo caminho. */
type Bloco = { id: string; biset: boolean; itens: TreinoExercicio[] }

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
  const [painel, setPainel] = useState<string | null>(null)
  const [finalizando, setFinalizando] = useState(false)
  const refs = useRef<Record<string, HTMLElement | null>>({})

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

  // 2. Com a sessao em maos, acha o treino dela.
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
      vibrar([60, 40, 60])
      return
    }
    const t = setTimeout(() => setDescanso((s) => (s === null ? null : s - 1)), 1000)
    return () => clearTimeout(t)
  }, [descanso])

  const meusItens = useMemo(
    () => (treino?.itens ?? []).filter((i) => i.perfil_id === null || i.perfil_id === perfil?.id),
    [treino, perfil],
  )
  const blocos = useMemo(() => agrupar(meusItens), [meusItens])

  const totalSeries = meusItens.reduce((n, i) => n + i.series, 0)
  const feitas = Object.values(marcadas).filter((m) => m.feita).length

  const blocoConcluido = useCallback(
    (bloco: Bloco) =>
      bloco.itens.every((item) =>
        Array.from({ length: item.series }, (_, i) => i + 1).every(
          (n) => marcadas[chave(nomeDe(item), n)]?.feita,
        ),
      ),
    [marcadas],
  )

  /**
   * Leva o proximo bloco pendente para o topo. E o que evita procurar
   * "onde eu estava" rolando a lista com a mao suada apos cada serie.
   */
  const irParaProximo = useCallback(
    (atual: Bloco) => {
      const i = blocos.findIndex((b) => b.id === atual.id)
      const proximo = blocos.slice(i + 1).find((b) => !blocoConcluido(b))
      const alvo = refs.current[proximo?.id ?? '']
      if (alvo) setTimeout(() => alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350)
    },
    [blocos, blocoConcluido],
  )

  const alterar = useCallback((k: string, campo: 'carga' | 'reps', valor: string) => {
    setMarcadas((m) => ({ ...m, [k]: { ...(m[k] ?? vazia), [campo]: valor } }))
  }, [])

  const gravar = useCallback(
    async (item: TreinoExercicio, serie: number, m: Marcada) => {
      if (!perfil || !sessaoId) return
      await registrarSerie({
        sessao_id: sessaoId,
        perfil_id: perfil.id,
        exercicio_id: item.exercicio_id,
        exercicio_nome: nomeDe(item),
        serie,
        carga_kg: m.carga === '' ? null : Number(m.carga.replace(',', '.')),
        reps: m.reps === '' ? null : Number(m.reps),
        rir: m.rir,
        registrada_em: new Date().toISOString(),
      })
    },
    [perfil, sessaoId],
  )

  const alternar = useCallback(
    async (
      item: TreinoExercicio,
      serie: number,
      padroes: { carga: string; reps: string },
      ctx: { descanso: number | null; avancarDe: Bloco | null },
    ) => {
      if (!sessaoId) return
      const nome = nomeDe(item)
      const k = chave(nome, serie)
      const atual = marcadas[k]

      if (atual?.feita) {
        setMarcadas((m) => ({ ...m, [k]: { ...atual, feita: false } }))
        await apagarSerie(sessaoId, nome, serie).catch(console.error)
        return
      }

      const nova: Marcada = {
        carga: atual?.carga || padroes.carga,
        reps: atual?.reps || padroes.reps,
        rir: atual?.rir ?? null,
        feita: true,
      }
      setMarcadas((m) => ({ ...m, [k]: nova }))
      vibrar([40])
      if (ctx.descanso && ctx.descanso > 0) setDescanso(ctx.descanso)
      if (ctx.avancarDe) irParaProximo(ctx.avancarDe)
      await gravar(item, serie, nova)
    },
    [marcadas, sessaoId, gravar, irParaProximo],
  )

  /** RIR pode ser marcado antes ou depois do ✓; se ja registrou, regrava. */
  const definirRir = useCallback(
    async (item: TreinoExercicio, serie: number, rir: number | null) => {
      const k = chave(nomeDe(item), serie)
      const atual = marcadas[k] ?? vazia
      const nova = { ...atual, rir: atual.rir === rir ? null : rir }
      setMarcadas((m) => ({ ...m, [k]: nova }))
      if (nova.feita) await gravar(item, serie, nova)
    },
    [marcadas, gravar],
  )

  async function terminar() {
    if (!sessao) return
    setFinalizando(true)
    await finalizarSessao(sessao, null)
    navegar('/', { replace: true })
  }

  if (!treino || !sessao) {
    return <div className="p-8 text-center text-suave">carregando treino…</div>
  }

  // A barra de descanso flutua por cima: o espaco extra embaixo evita que
  // ela cubra o botao de finalizar.
  return (
    <div className={descanso !== null ? 'min-h-dvh pb-44' : 'min-h-dvh pb-24'}>
      <header className="sticky top-0 z-10 border-b border-borda bg-fundo/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold">{treino.nome}</h1>
            <p className="text-xs text-suave">
              <span className="font-bold text-texto">{feitas}</span> de {totalSeries} séries
              {semana && (
                <span className="text-texto">
                  {' · '}semana {semana.semana} · {semana.reps} reps
                </span>
              )}
            </p>
          </div>
          <button onClick={() => navegar('/')} className="shrink-0 text-sm text-suave">
            voltar
          </button>
        </div>
        <div className="mx-auto mt-2 h-1 max-w-lg overflow-hidden rounded-full bg-borda">
          <div
            className="h-full bg-feito transition-all duration-300"
            style={{ width: `${totalSeries ? (feitas / totalSeries) * 100 : 0}%` }}
          />
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-4 p-5">
        {blocos.map((bloco) => (
          <CartaoBloco
            key={bloco.id}
            ref={(el) => {
              refs.current[bloco.id] = el
            }}
            bloco={bloco}
            semana={semana}
            cargas={cargas}
            marcadas={marcadas}
            perfilId={perfil?.id ?? ''}
            concluido={blocoConcluido(bloco)}
            reaberto={reabertos.has(bloco.id)}
            painel={painel}
            aoAbrirPainel={setPainel}
            aoReabrir={() =>
              setReabertos((r) => {
                const novo = new Set(r)
                if (novo.has(bloco.id)) novo.delete(bloco.id)
                else novo.add(bloco.id)
                return novo
              })
            }
            aoAlterar={alterar}
            aoDefinirRir={definirRir}
            aoAlternar={(item, serie, padroes, ctx) =>
              alternar(item, serie, padroes, { ...ctx, avancarDe: ctx.avancar ? bloco : null })
            }
          />
        ))}

        <button
          onClick={() => void terminar()}
          disabled={finalizando}
          className="mt-2 rounded-2xl bg-feito py-4 text-base font-semibold active:bg-feito/80 disabled:opacity-50"
        >
          {finalizando ? 'Salvando…' : 'Finalizar treino'}
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

type Padroes = { carga: string; reps: string }
type Contexto = { descanso: number | null; avancar: boolean }

function CartaoBloco({
  ref, bloco, semana, cargas, marcadas, perfilId, concluido, reaberto, painel,
  aoAbrirPainel, aoReabrir, aoAlterar, aoDefinirRir, aoAlternar,
}: {
  ref?: React.Ref<HTMLElement>
  bloco: Bloco
  semana: SemanaCiclo | null
  cargas: Record<string, UltimaCarga>
  marcadas: Record<string, Marcada>
  perfilId: string
  concluido: boolean
  reaberto: boolean
  painel: string | null
  aoAbrirPainel: (k: string | null) => void
  aoReabrir: () => void
  aoAlterar: (k: string, campo: 'carga' | 'reps', v: string) => void
  aoDefinirRir: (i: TreinoExercicio, s: number, rir: number | null) => Promise<void>
  aoAlternar: (i: TreinoExercicio, s: number, p: Padroes, c: Contexto) => Promise<void>
}) {
  const [progressaoDe, setProgressaoDe] = useState<string | null>(null)

  const maxSeries = Math.max(...bloco.itens.map((i) => i.series))
  // No bi-set o descanso e um so, no fim da rodada: vale o maior prescrito.
  const descansoDoBloco = Math.max(...bloco.itens.map((i) => i.descanso_seg))

  // Bloco concluido vira uma linha. Sete exercicios abertos somam 25
  // linhas de input; conforme o treino anda, a tela encolhe.
  if (concluido && !reaberto) {
    return (
      <section ref={ref as React.Ref<HTMLElement>}>
        <button
          onClick={aoReabrir}
          className="flex w-full items-center gap-3 rounded-2xl border border-feito/30 bg-feito/10 px-4 py-3 text-left"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-feito text-sm font-bold">
            ✓
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-texto">
              {bloco.itens.map(nomeDe).join(' + ')}
            </span>
            <span className="text-xs text-fraco">
              {bloco.itens.map((i) => resumo(i, marcadas)).filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="shrink-0 text-xs text-fraco/70">editar</span>
        </button>
      </section>
    )
  }

  return (
    <section
      ref={ref as React.Ref<HTMLElement>}
      className="scroll-mt-24 rounded-2xl border border-borda bg-superficie p-4"
    >
      {bloco.biset && (
        <p className="mb-2 inline-block rounded-full bg-biset/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-biset">
          Bi-set · sem descanso entre eles
        </p>
      )}

      {bloco.itens.map((item) => (
        <div key={item.id} className={bloco.biset ? 'mb-1' : ''}>
          <button
            onClick={() =>
              setProgressaoDe((a) => (a === item.exercicio_id ? null : item.exercicio_id))
            }
            className="flex w-full items-baseline justify-between gap-2 text-left"
          >
            <span className="min-w-0">
              <span className="font-semibold leading-tight">{nomeDe(item)}</span>
              <span className="ml-1.5 text-xs text-fraco/70">
                {progressaoDe === item.exercicio_id ? '▴' : '▾'}
              </span>
            </span>
            <span className="shrink-0 text-sm text-suave">
              {item.series} × {repsDoDia(item, semana)}
              {item.reps && <span className="ml-1 text-alerta/80">fixo</span>}
            </span>
          </button>

          {progressaoDe === item.exercicio_id && (
            <>
              <ProgressaoInline perfilId={perfilId} exercicioId={item.exercicio_id} />
              <a
                href={linkDeExecucao(nomeDe(item), item.exercicios?.video_url ?? null)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-borda py-2.5 text-sm font-medium text-suave active:bg-elevado"
              >
                ▶ ver execução
              </a>
            </>
          )}

          {item.observacao && (
            <p className="mt-2 rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta">
              {item.observacao}
            </p>
          )}
        </div>
      ))}

      {!bloco.biset && bloco.itens[0].descanso_seg > 0 && (
        <p className="mt-0.5 text-sm text-suave">
          descanso {bloco.itens[0].descanso_seg}s
        </p>
      )}

      {(() => {
        const item = bloco.itens[0]
        const u = cargas[item.exercicio_id]
        return !bloco.biset && u ? (
          <p className="mt-1 text-xs text-fraco">
            última vez: {u.carga_kg}kg{u.reps ? ` × ${u.reps}` : ''} ·{' '}
            {dataCurta(u.registrada_em)}
          </p>
        ) : null
      })()}

      <div className="mt-3 flex flex-col gap-2">
        {Array.from({ length: maxSeries }, (_, i) => i + 1).map((serie) => {
          const participantes = bloco.itens.filter((i) => serie <= i.series)
          return (
            <div key={serie} className={bloco.biset ? 'rounded-xl bg-elevado/40 p-2' : ''}>
              {bloco.biset && (
                <p className="rotulo mb-1.5 px-1">Série {serie}</p>
              )}
              {participantes.map((item, j) => {
                const ultimo = j === participantes.length - 1
                const alvoReps = repsDoDia(item, semana)
                const u = cargas[item.exercicio_id]
                const padroes: Padroes = {
                  carga: u?.carga_kg != null ? String(u.carga_kg) : '',
                  reps: primeiroNumero(alvoReps),
                }
                const k = chave(nomeDe(item), serie)
                return (
                  <LinhaSerie
                    key={item.id}
                    rotulo={bloco.biset ? nomeCurto(nomeDe(item)) : String(serie)}
                    compacto={bloco.biset}
                    marcada={marcadas[k] ?? vazia}
                    padroes={padroes}
                    aberto={painel === k}
                    aoAbrir={() => aoAbrirPainel(painel === k ? null : k)}
                    aoAlterar={(campo, v) => aoAlterar(k, campo, v)}
                    aoDefinirRir={(rir) => void aoDefinirRir(item, serie, rir)}
                    aoAlternar={() =>
                      void aoAlternar(item, serie, padroes, {
                        descanso: ultimo ? (bloco.biset ? descansoDoBloco : item.descanso_seg) : null,
                        avancar: ultimo && serie === maxSeries,
                      })
                    }
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const DELTAS = [-5, -2.5, -1, 1, 2.5, 5]
const OPCOES_RIR = [
  { valor: 0, rotulo: 'falha' },
  { valor: 1, rotulo: '1' },
  { valor: 2, rotulo: '2' },
  { valor: 3, rotulo: '3+' },
]

function LinhaSerie({
  rotulo, compacto, marcada, padroes, aberto, aoAbrir, aoAlterar, aoDefinirRir, aoAlternar,
}: {
  rotulo: string
  compacto: boolean
  marcada: Marcada
  padroes: Padroes
  aberto: boolean
  aoAbrir: () => void
  aoAlterar: (campo: 'carga' | 'reps', v: string) => void
  aoDefinirRir: (rir: number | null) => void
  aoAlternar: () => void
}) {
  const feita = marcada.feita
  return (
    <div className={compacto ? 'mb-1 last:mb-0' : ''}>
      <div className="flex items-center gap-2">
        {/* O rotulo tambem abre o painel: nao ha espaco para mais um botao
            na linha, e a area ja existe. */}
        <button
          onClick={aoAbrir}
          aria-label={aberto ? 'Fechar ajustes' : 'Ajustar carga e RIR'}
          className={`h-12 shrink-0 truncate rounded-lg text-center ${
            compacto ? 'w-[4.5rem] px-1 text-[11px]' : 'w-9 text-sm'
          } ${aberto ? 'bg-borda text-texto' : 'text-fraco'}`}
        >
          {rotulo}
        </button>

        <Campo
          valor={marcada.carga}
          placeholder={padroes.carga || '—'}
          sufixo="kg"
          feita={feita}
          aoMudar={(v) => aoAlterar('carga', v)}
          aoFocar={aoAbrir}
        />
        <Campo
          valor={marcada.reps}
          placeholder={padroes.reps || '—'}
          sufixo="reps"
          feita={feita}
          aoMudar={(v) => aoAlterar('reps', v)}
        />

        <button
          onClick={aoAlternar}
          aria-label={feita ? 'Desmarcar série' : 'Concluir série'}
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl font-bold transition-colors ${
            feita
              ? marcada.rir === 0
                ? 'bg-alerta text-white'
                : 'bg-feito text-white'
              : 'border border-borda bg-elevado text-fraco active:bg-borda-forte'
          }`}
        >
          ✓
          {feita && marcada.rir !== null && (
            <span className="absolute bottom-0.5 text-[9px] font-semibold leading-none opacity-90">
              {marcada.rir === 0 ? 'falha' : `RIR ${marcada.rir}`}
            </span>
          )}
        </button>
      </div>

      {aberto && (
        <PainelSerie
          marcada={marcada}
          padroes={padroes}
          aoAlterar={aoAlterar}
          aoDefinirRir={aoDefinirRir}
        />
      )}
    </div>
  )
}

/**
 * Ajuste rapido de carga e RIR.
 * Nao cabe na linha da serie sem espremer os campos abaixo do tamanho
 * usavel, entao abre embaixo, so quando pedido.
 */
function PainelSerie({
  marcada, padroes, aoAlterar, aoDefinirRir,
}: {
  marcada: Marcada
  padroes: Padroes
  aoAlterar: (campo: 'carga' | 'reps', v: string) => void
  aoDefinirRir: (rir: number | null) => void
}) {
  // preventDefault no mousedown: sem isso o toque tira o foco do campo e
  // o teclado do celular pisca a cada ajuste.
  const semRoubarFoco = (e: React.MouseEvent) => e.preventDefault()

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-borda bg-elevado/60 p-2">
      <div className="grid grid-cols-6 gap-1">
        {DELTAS.map((d) => (
          <button
            key={d}
            onMouseDown={semRoubarFoco}
            onClick={() => aoAlterar('carga', somarCarga(marcada.carga || padroes.carga, d))}
            className="h-11 rounded-lg bg-borda text-xs font-semibold tabular-nums active:bg-borda-forte"
          >
            {d > 0 ? '+' : '−'}
            {String(Math.abs(d)).replace('.', ',')}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="w-9 shrink-0 text-center text-[11px] font-medium text-fraco">
          RIR
        </span>
        {OPCOES_RIR.map((o) => (
          <button
            key={o.valor}
            onMouseDown={semRoubarFoco}
            onClick={() => aoDefinirRir(o.valor)}
            className={`h-11 flex-1 rounded-lg text-xs font-semibold ${
              marcada.rir === o.valor
                ? o.valor === 0
                  ? 'bg-alerta text-white'
                  : 'bg-acento text-white'
                : 'bg-borda text-texto active:bg-borda-forte'
            }`}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

function Campo({
  valor, placeholder, sufixo, feita, aoMudar, aoFocar,
}: {
  valor: string
  placeholder: string
  sufixo: string
  feita: boolean
  aoMudar: (v: string) => void
  aoFocar?: () => void
}) {
  return (
    <div className="relative flex-1">
      <input
        inputMode="decimal"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => aoMudar(e.target.value)}
        onFocus={(e) => {
          aoFocar?.()
          // O teclado cobre metade da tela: sem isto o campo recem tocado
          // some atras dele.
          const alvo = e.target
          setTimeout(() => alvo.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
        }}
        className={`w-full rounded-xl border py-3 pl-2.5 pr-8 text-base outline-none focus:border-acento ${
          feita ? 'border-feito/40 bg-feito/10' : 'border-borda bg-elevado'
        }`}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-fraco">
        {sufixo}
      </span>
    </div>
  )
}

/** Historico de carga do exercicio, sem sair da tela de treino. */
function ProgressaoInline({
  perfilId, exercicioId,
}: {
  perfilId: string
  exercicioId: string
}) {
  const [pontos, setPontos] = useState<PontoProgressao[] | null>(null)

  useEffect(() => {
    let vivo = true
    void buscarProgressao(perfilId, exercicioId)
      .then((p) => vivo && setPontos(p))
      .catch(() => vivo && setPontos([]))
    return () => {
      vivo = false
    }
  }, [perfilId, exercicioId])

  return (
    <div className="mt-2 rounded-xl border border-borda bg-elevado/40 p-3">
      {pontos === null && <p className="text-xs text-fraco">carregando…</p>}
      {pontos?.length === 0 && (
        <p className="text-xs text-fraco">Primeira vez neste exercício.</p>
      )}
      {pontos && pontos.length > 0 && <GraficoCarga pontos={pontos} altura="h-20" maximo={8} />}
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
      className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-superficie px-5 py-3"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="flex-1">
          <p className="rotulo">Descanso</p>
          <p className="valor text-3xl">
            {String(Math.floor(segundos / 60)).padStart(2, '0')}:
            {String(segundos % 60).padStart(2, '0')}
          </p>
        </div>
        <button onClick={aoSomar} className="rounded-xl bg-borda px-4 py-2.5 text-sm font-medium">
          +30s
        </button>
        <button onClick={aoPular} className="rounded-xl bg-acento px-4 py-2.5 text-sm font-medium">
          Pular
        </button>
      </div>
    </div>
  )
}

// --- helpers ---------------------------------------------------------

const nomeDe = (item: TreinoExercicio) => item.exercicios?.nome ?? 'Exercício'

/** "Tríceps testa unilateral na polia" -> "Tríceps testa…" na linha do bi-set. */
function nomeCurto(nome: string) {
  const palavras = nome.split(' ')
  return palavras.length <= 2 ? nome : `${palavras.slice(0, 2).join(' ')}…`
}

/** Exercicios do mesmo `grupo` viram um bloco; grupo de um so vira solo. */
function agrupar(itens: TreinoExercicio[]): Bloco[] {
  const blocos: Bloco[] = []
  const posicao = new Map<number, number>()

  for (const item of itens) {
    if (item.grupo == null) {
      blocos.push({ id: item.id, biset: false, itens: [item] })
      continue
    }
    const i = posicao.get(item.grupo)
    if (i === undefined) {
      posicao.set(item.grupo, blocos.length)
      blocos.push({ id: `grupo-${item.grupo}`, biset: true, itens: [item] })
    } else {
      blocos[i].itens.push(item)
    }
  }

  // Um bi-set em que a pessoa faz so um dos exercicios e um exercicio normal.
  return blocos.map((b) =>
    b.biset && b.itens.length === 1 ? { id: b.itens[0].id, biset: false, itens: b.itens } : b,
  )
}

/** "3 séries · 8 reps · 32kg" — o que foi registrado, nao o prescrito. */
function resumo(item: TreinoExercicio, marcadas: Record<string, Marcada>) {
  const feitas = Array.from({ length: item.series }, (_, i) => i + 1)
    .map((n) => marcadas[chave(nomeDe(item), n)])
    .filter((m): m is Marcada => Boolean(m?.feita))
  if (feitas.length === 0) return ''

  const cargas = [...new Set(feitas.map((m) => m.carga).filter(Boolean))]
  const reps = [...new Set(feitas.map((m) => m.reps).filter(Boolean))]
  const partes = [`${feitas.length}×`]
  if (reps.length > 0) partes.push(reps.join('/'))
  if (cargas.length > 0) partes.push(`${cargas.join('/')}kg`)
  if (feitas.some((m) => m.rir === 0)) partes.push('falha')
  return partes.join(' · ')
}

function somarCarga(valor: string, delta: number) {
  const base = Number((valor || '0').replace(',', '.')) || 0
  const novo = Math.max(0, Math.round((base + delta) * 100) / 100)
  return String(novo).replace('.', ',')
}

function reidratar(series: SerieRegistro[]) {
  const m: Record<string, Marcada> = {}
  for (const s of series) {
    m[chave(s.exercicio_nome, s.serie)] = {
      carga: s.carga_kg != null ? String(s.carga_kg) : '',
      reps: s.reps != null ? String(s.reps) : '',
      rir: s.rir ?? null,
      feita: true,
    }
  }
  return m
}

/** "8-10" -> "8". Da a meta da semana como chute inicial. */
function primeiroNumero(reps: string) {
  return reps.match(/\d+/)?.[0] ?? ''
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function vibrar(padrao: number[]) {
  try {
    navigator.vibrate?.(padrao)
  } catch {
    /* navegador sem vibracao */
  }
}
