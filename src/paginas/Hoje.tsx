import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  atividadesEmCache, buscarAtividades, buscarFaltas, buscarPlano,
  buscarRegistrosDeAtividade, buscarSemanaAtual, buscarSessaoAberta, buscarSessoes,
  buscarTreinos, descartarSessao, desmarcarFalta, iniciarSessao, marcarAtividade,
  marcarFalta, planoEmCache, semanaEmCache, treinosEmCache,
} from '../lib/db'
import { chaveDia, inicioDaSemana } from '../lib/datas'
import CartaoAlimentacao from '../componentes/CartaoAlimentacao'
import type { Atividade, AtividadeRegistro, Falta } from '../lib/tipos'
import type { SemanaCiclo, Sessao, TreinoCompleto } from '../lib/tipos'

export default function Hoje() {
  const { perfil, ehPersonal } = useAuth()
  const navegar = useNavigate()
  const [treinos, setTreinos] = useState<TreinoCompleto[]>(treinosEmCache())
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [aberta, setAberta] = useState<Sessao | null>(null)
  const [semana, setSemana] = useState<SemanaCiclo | null>(semanaEmCache())
  const [plano, setPlano] = useState<Record<number, string>>(
    perfil ? planoEmCache(perfil.id) : {},
  )
  const [atividades, setAtividades] = useState<Atividade[]>(
    perfil ? atividadesEmCache(perfil.id) : [],
  )
  const [registros, setRegistros] = useState<AtividadeRegistro[]>([])
  const [faltas, setFaltas] = useState<Falta[]>([])

  useEffect(() => {
    if (!perfil) return
    const trintaDias = new Date(Date.now() - 30 * 864e5)
    void buscarTreinos().then(setTreinos).catch(console.error)
    void buscarSessoes(perfil.id, trintaDias).then(setSessoes).catch(console.error)
    void buscarSessaoAberta(perfil.id).then(setAberta).catch(console.error)
    void buscarSemanaAtual().then(setSemana).catch(console.error)
    void buscarPlano(perfil.id).then(setPlano).catch(console.error)
    void buscarAtividades(perfil.id).then(setAtividades).catch(console.error)
    void buscarRegistrosDeAtividade(perfil.id, inicioDaSemana())
      .then(setRegistros)
      .catch(console.error)
    void buscarFaltas(perfil.id, new Date(Date.now() - 60 * 864e5))
      .then(setFaltas)
      .catch(console.error)

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

  // O plano manda. Sem plano, cai na heuristica antiga.
  const doPlano = useMemo(
    () => meusTreinos.find((t) => t.id === plano[new Date().getDay()]) ?? null,
    [meusTreinos, plano],
  )
  const temPlano = Object.keys(plano).length > 0
  const descansoHoje = temPlano && !doPlano

  // Sem plano: o treino que voce fez ha mais tempo.
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
  const principal = aberta ? null : (doPlano ?? (temPlano ? null : sugerido))
  const resto = meusTreinos.filter((t) => t.id !== principal?.id)

  const hojeChave = chaveDia(new Date())

  // Quais atividades foram marcadas hoje. Quem decide se isso torna o dia
  // "de jiu-jitsu" e o proprio plano alimentar, pelo atividade_jiu_jitsu_id
  // — casar por nome aqui quebraria no dia em que a atividade mudar de nome.
  const atividadesDeHoje = useMemo(
    () => registros.filter((r) => r.dia === hojeChave).map((r) => r.atividade_id),
    [registros, hojeChave],
  )
  const faltouHoje = faltas.some((f) => f.dia === hojeChave)

  /** Iniciou por engano: apaga a sessao e devolve o dia ao normal. */
  async function descartar() {
    if (!aberta) return
    if (!confirm('Descartar este treino? As séries já marcadas nele serão apagadas.')) return
    const id = aberta.id
    setAberta(null)
    try {
      await descartarSessao(id)
      if (perfil) await buscarSessoes(perfil.id, new Date(Date.now() - 30 * 864e5)).then(setSessoes)
    } catch (e) {
      console.error(e)
    }
  }

  async function alternarFalta(motivo: string | null = null) {
    if (!perfil) return
    if (faltouHoje) {
      setFaltas((fs) => fs.filter((f) => f.dia !== hojeChave))
      await desmarcarFalta(perfil.id, hojeChave).catch(console.error)
    } else {
      setFaltas((fs) => [...fs, { perfil_id: perfil.id, dia: hojeChave, motivo }])
      await marcarFalta(perfil.id, hojeChave, motivo).catch(console.error)
    }
  }

  async function anotarMotivo(motivo: string) {
    if (!perfil) return
    setFaltas((fs) =>
      fs.map((f) => (f.dia === hojeChave ? { ...f, motivo: motivo || null } : f)),
    )
    await marcarFalta(perfil.id, hojeChave, motivo || null).catch(console.error)
  }

  /** Marcar e desmarcar e otimista: o toque responde antes da rede. */
  async function alternarAtividade(a: Atividade) {
    if (!perfil) return
    const hoje = chaveDia(new Date())
    const feito = registros.some((r) => r.atividade_id === a.id && r.dia === hoje)

    setRegistros((rs) =>
      feito
        ? rs.filter((r) => !(r.atividade_id === a.id && r.dia === hoje))
        : [...rs, { atividade_id: a.id, perfil_id: perfil.id, dia: hoje, duracao_min: null }],
    )
    try {
      await marcarAtividade(a.id, perfil.id, hoje, !feito)
    } catch (e) {
      console.error(e)
      await buscarRegistrosDeAtividade(perfil.id, inicioDaSemana())
        .then(setRegistros)
        .catch(console.error)
    }
  }

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
        <Semana plano={plano} treinos={meusTreinos} sessoes={sessoes} faltas={faltas} />
      </div>

      {aberta && (
        <div className="mb-6 rounded-2xl border border-alerta/40 bg-alerta/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="rotulo text-alerta">Treino em andamento</p>
            <button
              onClick={() => void descartar()}
              className="shrink-0 text-xs text-suave underline"
            >
              descartar
            </button>
          </div>
          <button
            onClick={() => navegar(`/executar/${aberta.id}`)}
            className="mt-1 w-full text-left"
          >
            <p className="text-lg font-bold">{aberta.treino_nome}</p>
            <p className="text-sm text-suave">Toque para continuar de onde parou</p>
          </button>
        </div>
      )}

      {meusTreinos.length === 0 ? (
        <p className="rounded-2xl border border-borda bg-superficie p-6 text-center text-sm text-suave">
          Nenhum treino atribuído ainda.
          {ehPersonal ? ' Monte o primeiro na aba Treinos.' : ' Fale com o personal.'}
        </p>
      ) : (
        <>
          {descansoHoje && !aberta && (
            <div className="mb-3 rounded-2xl border border-borda bg-superficie p-4">
              <p className="rotulo text-feito">{diaPorExtenso(new Date())} · descanso</p>
              <p className="mt-1.5 text-sm text-suave">
                Hoje não tem treino no plano. Se quiser adiantar algum, é só escolher abaixo.
              </p>
            </div>
          )}

          {faltouHoje && !aberta && (
            <CartaoFalta
              dia={diaPorExtenso(new Date())}
              motivo={faltas.find((f) => f.dia === hojeChave)?.motivo ?? ''}
              aoAnotar={(m) => void anotarMotivo(m)}
              aoDesfazer={() => void alternarFalta()}
            />
          )}

          {principal && !faltouHoje && (
            <CartaoPrincipal
              treino={principal}
              perfilId={perfil?.id ?? ''}
              hoje={principal.id === doPlano?.id}
              ultima={sessoes.find((s) => s.treino_id === principal.id)}
              aoComecar={() => void comecar(principal)}
            />
          )}

          {principal && !faltouHoje && !aberta && (
            <button
              onClick={() => void alternarFalta()}
              className="mb-3 w-full rounded-xl border border-borda py-2.5 text-sm text-fraco active:bg-elevado"
            >
              não vou treinar hoje
            </button>
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

      {atividades.length > 0 && (
        <Extras
          atividades={atividades}
          registros={registros}
          aoAlternar={(a) => void alternarAtividade(a)}
        />
      )}

      {/* O personal nao ve nada de nutricao — nem aqui, nem no menu, nem
          no banco (RLS por eh_aluno()). */}
      {!ehPersonal && perfil && (
        <CartaoAlimentacao perfilId={perfil.id} atividadesDeHoje={atividadesDeHoje} />
      )}
    </div>
  )
}

/**
 * Jiu-jitsu, cardio: um toque marca o dia.
 *
 * Fora dos treinos de propósito — nao tem serie nem carga, e misturar
 * estragaria as contagens. Quem tem meta semanal mostra o placar; quem
 * nao tem, so o registro.
 */
function Extras({
  atividades, registros, aoAlternar,
}: {
  atividades: Atividade[]
  registros: AtividadeRegistro[]
  aoAlternar: (a: Atividade) => void
}) {
  const hoje = chaveDia(new Date())
  const inicio = chaveDia(inicioDaSemana())

  return (
    <section className="mt-6">
      <p className="rotulo mb-2">Extras</p>
      <div className="flex flex-col gap-2 md:grid md:grid-cols-2">
        {atividades.map((a) => {
          const feitoHoje = registros.some((r) => r.atividade_id === a.id && r.dia === hoje)
          const naSemana = registros.filter(
            (r) => r.atividade_id === a.id && r.dia >= inicio,
          ).length
          const bateuMeta = a.meta_semanal != null && naSemana >= a.meta_semanal

          return (
            <button
              key={a.id}
              onClick={() => aoAlternar(a)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                feitoHoje
                  ? 'border-feito/40 bg-feito/10'
                  : 'border-borda bg-superficie active:bg-elevado'
              }`}
            >
              <span className="text-xl leading-none">{a.emoji ?? '•'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.nome}</span>
                {a.meta_semanal != null && (
                  <span
                    className={`text-xs ${bateuMeta ? 'text-feito' : 'text-fraco'}`}
                  >
                    <span className="font-bold">{naSemana}</span>/{a.meta_semanal} esta semana
                    {bateuMeta && ' · meta batida'}
                  </span>
                )}
                {a.meta_semanal == null && naSemana > 0 && (
                  <span className="text-xs text-fraco">
                    <span className="font-bold">{naSemana}</span>× esta semana
                  </span>
                )}
              </span>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${
                  feitoHoje ? 'bg-feito text-fundo' : 'border border-borda text-fraco'
                }`}
              >
                ✓
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-fraco">
        Um toque marca hoje, outro desmarca. Esqueceu um dia? Toque nele no Histórico.
      </p>
    </section>
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
  treino, perfilId, hoje, ultima, aoComecar,
}: {
  treino: TreinoCompleto
  perfilId: string
  hoje: boolean
  ultima?: Sessao
  aoComecar: () => void
}) {
  const c = custo(treino, perfilId)
  return (
    <div className="mb-3 rounded-2xl border border-acento/60 bg-superficie p-4">
      <p className="rotulo text-acento-texto">
        {hoje ? `${diaPorExtenso(new Date())} · treino de hoje` : 'Próximo treino'}
      </p>
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

/** Dia assumido como falta: o calendario para de mentir por omissao. */
function CartaoFalta({
  dia, motivo, aoAnotar, aoDesfazer,
}: {
  dia: string
  motivo: string
  aoAnotar: (m: string) => void
  aoDesfazer: () => void
}) {
  const [texto, setTexto] = useState(motivo)

  return (
    <div className="mb-3 rounded-2xl border border-alerta/40 bg-alerta/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="rotulo text-alerta">{dia} · não treinei</p>
          <p className="mt-1 text-sm text-suave">
            Fica registrado como falta, não como esquecimento.
          </p>
        </div>
        <button onClick={aoDesfazer} className="shrink-0 text-xs text-suave underline">
          desfazer
        </button>
      </div>

      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => aoAnotar(texto.trim())}
        placeholder="motivo (opcional): viagem, doente, trabalho…"
        className="mt-3 w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm outline-none focus:border-acento"
      />
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
      <span className="shrink-0 text-lg text-fraco">›</span>
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
        <span className="rotulo text-acento-texto">
          Semana {semana.semana} de {semana.total}
        </span>
        <span className="valor text-2xl text-texto">
          {semana.reps} <span className="text-xs font-semibold text-acento-texto">reps</span>
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

/**
 * A semana de verdade: segunda a domingo, com a letra do treino
 * planejado em cada dia e o que ja foi feito.
 *
 * Substitui a faixa anterior de "ultimos 7 dias", que mostrava sete
 * circulos sem dizer o que era para ter acontecido em cada um.
 */
function Semana({
  plano, treinos, sessoes, faltas,
}: {
  plano: Record<number, string>
  treinos: TreinoCompleto[]
  sessoes: Sessao[]
  faltas: Falta[]
}) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  // Semana comecando na segunda: e como o plano de treino e pensado.
  const segunda = inicioDaSemana(hoje)

  const feitos = new Set(sessoes.map((s) => s.iniciada_em.slice(0, 10)))
  const faltou = new Set(faltas.map((f) => f.dia))
  const letraDe = (treinoId?: string) =>
    treinos.find((t) => t.id === treinoId)?.nome.trim()[0] ?? null

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda)
    d.setDate(segunda.getDate() + i)
    return d
  })
  const total = dias.filter((d) => feitos.has(chaveDia(d))).length
  const previstos = dias.filter((d) => plano[d.getDay()]).length

  return (
    <div className="mb-3 rounded-2xl border border-borda bg-superficie p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="rotulo">Esta semana</span>
        <span className="text-sm font-bold">
          {total}
          {previstos > 0 && <span className="font-medium text-suave">/{previstos}</span>}
        </span>
      </div>

      <div className="flex justify-between gap-1">
        {dias.map((d) => {
          const letra = letraDe(plano[d.getDay()])
          const fez = feitos.has(chaveDia(d))
          const ausente = !fez && faltou.has(chaveDia(d))
          const ehHoje = chaveDia(d) === chaveDia(hoje)
          const passou = d < hoje

          return (
            <div key={d.toISOString()} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={`text-[10px] font-semibold uppercase ${
                  ehHoje ? 'text-acento-texto' : 'text-fraco'
                }`}
              >
                {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][(d.getDay() + 6) % 7]}
              </span>
              <div
                className={`flex h-9 w-full items-center justify-center rounded-lg text-sm font-extrabold ${
                  fez
                    ? 'bg-feito text-fundo'
                    : ausente
                      ? 'border border-dashed border-alerta/60 text-alerta/80'
                      : ehHoje
                        ? 'border-2 border-acento text-acento-texto'
                        : letra
                          ? passou
                            ? 'border border-borda text-fraco'
                            : 'border border-borda-forte text-suave'
                          : 'text-fraco'
                }`}
              >
                {letra ?? '–'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** "Terça-feira", com maiuscula, para abrir a frase do cartao. */
function diaPorExtenso(d: Date) {
  const nome = d.toLocaleDateString('pt-BR', { weekday: 'long' })
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

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
