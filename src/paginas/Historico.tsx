import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  buscarAtividades, buscarExercicios, buscarFaltas, buscarPerfis, buscarProgressao,
  buscarRegistrosDeAtividade, buscarSessoes, desmarcarFalta, marcarAtividade, marcarFalta,
  perfisEmCache,
} from '../lib/db'
import { chaveDia } from '../lib/datas'
import GraficoCarga from '../componentes/GraficoCarga'
import type {
  Atividade, AtividadeRegistro, Exercicio, Falta, Perfil, PontoProgressao, Sessao,
} from '../lib/tipos'

export default function Historico() {
  const { perfil, ehPersonal } = useAuth()
  const [perfis, setPerfis] = useState<Perfil[]>(perfisEmCache())
  const [vendo, setVendo] = useState<string>(perfil?.id ?? '')
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [extras, setExtras] = useState<AtividadeRegistro[]>([])
  const [faltas, setFaltas] = useState<Falta[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [exercicioId, setExercicioId] = useState('')
  const [progressao, setProgressao] = useState<PontoProgressao[]>([])
  // O dia aberto para edicao retroativa. Esqueceu de marcar o jiu-jitsu
  // de ontem, ou a falta de quinta: e aqui que se conserta.
  const [diaAberto, setDiaAberto] = useState<Date | null>(null)
  const [mes, setMes] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  useEffect(() => {
    void buscarPerfis().then(setPerfis).catch(console.error)
    void buscarExercicios().then(setExercicios).catch(console.error)
  }, [])

  useEffect(() => {
    if (!vendo) return
    // Um ano inteiro de uma vez: sao tres pessoas, o volume e minusculo,
    // e assim navegar entre meses nao vai a rede.
    void buscarSessoes(vendo, new Date(Date.now() - 400 * 864e5))
      .then(setSessoes)
      .catch(console.error)
    void buscarAtividades(vendo).then(setAtividades).catch(console.error)
    void buscarRegistrosDeAtividade(vendo, new Date(Date.now() - 400 * 864e5))
      .then(setExtras)
      .catch(console.error)
    void buscarFaltas(vendo, new Date(Date.now() - 400 * 864e5))
      .then(setFaltas)
      .catch(console.error)
  }, [vendo])

  useEffect(() => {
    if (!vendo || !exercicioId) {
      setProgressao([])
      return
    }
    void buscarProgressao(vendo, exercicioId).then(setProgressao).catch(console.error)
  }, [vendo, exercicioId])

  /**
   * Marcar falta em dia passado.
   *
   * So no proprio calendario: a RLS nao deixa registrar falta de outra
   * pessoa, e nao seria papel do personal fazer isso.
   */
  async function alternarFalta(dia: Date) {
    if (!perfil || vendo !== perfil.id) return
    const chave = chaveDia(dia)
    const jaFaltou = faltas.some((f) => f.dia === chave)

    setFaltas((fs) =>
      jaFaltou
        ? fs.filter((f) => f.dia !== chave)
        : [...fs, { perfil_id: perfil.id, dia: chave, motivo: null }],
    )
    try {
      if (jaFaltou) await desmarcarFalta(perfil.id, chave)
      else await marcarFalta(perfil.id, chave, null)
    } catch (e) {
      console.error(e)
      await buscarFaltas(perfil.id, new Date(Date.now() - 400 * 864e5))
        .then(setFaltas)
        .catch(console.error)
    }
  }

  /** Marca ou desmarca uma atividade num dia qualquer, nao so hoje. */
  async function alternarAtividade(atividadeId: string, dia: Date) {
    if (!perfil || vendo !== perfil.id) return
    const chave = chaveDia(dia)
    const feito = extras.some((r) => r.atividade_id === atividadeId && r.dia === chave)

    setExtras((rs) =>
      feito
        ? rs.filter((r) => !(r.atividade_id === atividadeId && r.dia === chave))
        : [...rs, { atividade_id: atividadeId, perfil_id: perfil.id, dia: chave, duracao_min: null }],
    )
    try {
      await marcarAtividade(atividadeId, perfil.id, chave, !feito)
    } catch (e) {
      console.error(e)
      await buscarRegistrosDeAtividade(perfil.id, new Date(Date.now() - 400 * 864e5))
        .then(setExtras)
        .catch(console.error)
    }
  }

  const alunos = perfis.filter((p) => p.papel === 'aluno')
  const sequencia = useMemo(() => calculaSequencia(sessoes), [sessoes])

  return (
    <div className="mx-auto max-w-lg p-5 md:max-w-3xl">
      <h1 className="mb-5 text-[26px] font-extrabold">Histórico</h1>

      {ehPersonal && alunos.length > 0 && (
        <div className="mb-5 flex gap-2">
          {alunos.map((a) => (
            <button
              key={a.id}
              onClick={() => setVendo(a.id)}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-medium ${
                vendo === a.id ? 'border-acento bg-acento/15 text-acento-texto' : 'border-borda text-suave'
              }`}
            >
              {a.nome}
            </button>
          ))}
        </div>
      )}

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Numero rotulo={mesCurto(mes)} valor={contaNoMes(sessoes, mes)} />
        <Numero rotulo="sequência" valor={sequencia} sufixo="sem" />
        <Numero rotulo="total" valor={sessoes.length} />
      </div>

      <section className="mb-6 rounded-2xl border border-borda bg-superficie p-4">
        <Calendario
          mes={mes}
          sessoes={sessoes}
          atividades={atividades}
          extras={extras}
          faltas={faltas}
          editavel={vendo === perfil?.id}
          diaAberto={diaAberto}
          aoAbrirDia={(d) => setDiaAberto((a) => (a && +a === +d ? null : d))}
          aoMudarMes={(delta) =>
            setMes((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
          }
        />
        {diaAberto && (
          <PainelDoDia
            dia={diaAberto}
            atividades={atividades}
            extras={extras}
            treinou={sessoes.some((x) => x.iniciada_em.slice(0, 10) === chaveDia(diaAberto))}
            faltou={faltas.some((f) => f.dia === chaveDia(diaAberto))}
            aoAlternarAtividade={(id) => void alternarAtividade(id, diaAberto)}
            aoAlternarFalta={() => void alternarFalta(diaAberto)}
            aoFechar={() => setDiaAberto(null)}
          />
        )}
      </section>

      <section className="rounded-2xl border border-borda bg-superficie p-4">
        <h2 className="rotulo mb-3">Evolução de carga</h2>
        <select
          value={exercicioId}
          onChange={(e) => setExercicioId(e.target.value)}
          className="mb-4 w-full rounded-xl border border-borda bg-elevado px-3 py-3 text-base outline-none focus:border-acento"
        >
          <option value="">escolha um exercício</option>
          {exercicios.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>

        {exercicioId && progressao.length === 0 && (
          <p className="text-sm text-fraco">Sem registros desse exercício.</p>
        )}
        {progressao.length > 0 && <GraficoCarga pontos={progressao} />}
      </section>

      {sessoes.length === 0 && (
        <p className="mt-4 text-center text-sm text-fraco">
          Nenhum treino registrado ainda. Assim que você finalizar o primeiro, os dias
          acendem no calendário com a letra do treino.
        </p>
      )}
    </div>
  )
}

function Numero({ rotulo, valor, sufixo }: { rotulo: string; valor: number; sufixo?: string }) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-3 text-center">
      <p className="valor text-3xl">
        {valor}
        {sufixo && <span className="ml-0.5 text-xs font-normal text-fraco">{sufixo}</span>}
      </p>
      <p className="rotulo mt-1">{rotulo}</p>
    </div>
  )
}

/**
 * Um mes por vez, com o numero certo de dias e a letra do treino
 * concluido em cada um. Mes a mes, nao "ultimos 30 dias": e assim que
 * se enxerga constancia.
 */
function Calendario({
  mes, sessoes, atividades, extras, faltas, editavel, diaAberto, aoAbrirDia, aoMudarMes,
}: {
  mes: Date
  sessoes: Sessao[]
  atividades: Atividade[]
  extras: AtividadeRegistro[]
  faltas: Falta[]
  editavel: boolean
  diaAberto: Date | null
  aoAbrirDia: (d: Date) => void
  aoMudarMes: (delta: number) => void
}) {
  const ano = mes.getFullYear()
  const m = mes.getMonth()
  const diasNoMes = new Date(ano, m + 1, 0).getDate()
  // Semana comecando na segunda, como o plano de treino.
  const deslocamento = (new Date(ano, m, 1).getDay() + 6) % 7

  // Um dia pode ter mais de uma sessao; guarda a letra da primeira.
  const doDia = new Map<number, string>()
  for (const s of sessoes) {
    const d = new Date(s.iniciada_em)
    if (d.getFullYear() === ano && d.getMonth() === m) {
      if (!doDia.has(d.getDate())) doDia.set(d.getDate(), s.treino_nome.trim()[0] ?? '✓')
    }
  }

  // Extras do mes, agrupados por dia — um dia pode ter mais de um.
  const emojiDe = new Map(atividades.map((a) => [a.id, a.emoji ?? '•']))
  const extrasDoDia = new Map<number, string[]>()
  for (const r of extras) {
    const [a, mm, dd] = r.dia.split('-').map(Number)
    if (a === ano && mm === m + 1) {
      const lista = extrasDoDia.get(dd) ?? []
      lista.push(emojiDe.get(r.atividade_id) ?? '•')
      extrasDoDia.set(dd, lista)
    }
  }
  const totalExtras = [...extrasDoDia.values()].reduce((n, l) => n + l.length, 0)

  const faltasDoMes = new Map<number, string | null>()
  for (const f of faltas) {
    const [a, mm, dd] = f.dia.split('-').map(Number)
    if (a === ano && mm === m + 1) faltasDoMes.set(dd, f.motivo)
  }

  const hoje = new Date()
  const ehMesAtual = hoje.getFullYear() === ano && hoje.getMonth() === m
  const futuro = new Date(ano, m, 1) > hoje

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => aoMudarMes(-1)}
          aria-label="Mês anterior"
          className="h-9 w-9 rounded-lg text-suave active:bg-elevado"
        >
          ‹
        </button>
        <div className="text-center">
          <p className="text-sm font-bold">{mesPorExtenso(mes)}</p>
          <p className="rotulo mt-0.5">
            {doDia.size} treino{doDia.size === 1 ? '' : 's'}
            {totalExtras > 0 && ` · ${totalExtras} extra${totalExtras === 1 ? '' : 's'}`}
            {faltasDoMes.size > 0 && ` · ${faltasDoMes.size} falta${faltasDoMes.size === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          onClick={() => aoMudarMes(1)}
          disabled={futuro}
          aria-label="Próximo mês"
          className="h-9 w-9 rounded-lg text-suave active:bg-elevado disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
          <span key={d} className="text-center text-[10px] font-semibold uppercase text-fraco">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: deslocamento }, (_, i) => <div key={`v${i}`} />)}
        {Array.from({ length: diasNoMes }, (_, i) => i + 1).map((dia) => {
          const letra = doDia.get(dia)
          const marcas = extrasDoDia.get(dia)
          const falta = !letra && faltasDoMes.has(dia)
          const motivo = faltasDoMes.get(dia)
          const ehHoje = ehMesAtual && hoje.getDate() === dia
          const data = new Date(ano, m, dia)
          // Dia futuro ainda nao aconteceu; o resto se edita.
          const podeAbrir =
            editavel && data <= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
          const aberto = diaAberto != null && +diaAberto === +data
          const Celula = podeAbrir ? 'button' : 'div'
          return (
            <Celula
              key={dia}
              onClick={podeAbrir ? () => aoAbrirDia(data) : undefined}
              title={falta ? `Falta${motivo ? `: ${motivo}` : ''}` : undefined}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg ${
                aberto ? 'ring-2 ring-acento ring-offset-2 ring-offset-superficie ' : ''
              }${
                letra
                  ? 'bg-feito text-fundo'
                  : falta
                    ? 'border border-dashed border-alerta/60 bg-alerta/5'
                    : marcas
                      ? 'border border-acento/40 bg-elevado'
                      : ehHoje
                        ? 'border-2 border-acento'
                        : 'bg-elevado/40'
              }`}
            >
              <span
                className={`text-[10px] leading-none ${
                  letra ? 'font-semibold opacity-70' : falta ? 'text-alerta/70' : 'text-fraco'
                }`}
              >
                {dia}
              </span>
              {falta && <span className="text-sm font-bold leading-tight text-alerta/80">×</span>}
              {letra && <span className="text-sm font-extrabold leading-tight">{letra}</span>}
              {marcas && !letra && (
                <span className="text-sm leading-tight">{marcas.join('')}</span>
              )}
              {marcas && letra && (
                <span className="absolute right-0.5 top-0.5 text-[9px] leading-none">
                  {marcas.join('')}
                </span>
              )}
            </Celula>
          )
        })}
      </div>

      {editavel && (
        <p className="mt-3 text-xs text-fraco">
          Toque num dia para marcar um extra que você esqueceu, ou uma falta.
        </p>
      )}
    </div>
  )
}

/**
 * O dia aberto para conserto.
 *
 * Esquecer de marcar acontece — foi por isso que a falta virou registro,
 * e vale igual para os extras. Sem isto, o jiu-jitsu de ontem se perde e
 * a meta semanal passa a mentir.
 */
function PainelDoDia({
  dia, atividades, extras, treinou, faltou,
  aoAlternarAtividade, aoAlternarFalta, aoFechar,
}: {
  dia: Date
  atividades: Atividade[]
  extras: AtividadeRegistro[]
  treinou: boolean
  faltou: boolean
  aoAlternarAtividade: (id: string) => void
  aoAlternarFalta: () => void
  aoFechar: () => void
}) {
  const chave = chaveDia(dia)
  const feito = (id: string) => extras.some((r) => r.atividade_id === id && r.dia === chave)

  return (
    <div className="mt-4 rounded-xl border border-acento/40 bg-elevado p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold">
          {dia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </p>
        <button onClick={aoFechar} className="text-xs text-suave underline">
          fechar
        </button>
      </div>

      {treinou && (
        <p className="mb-2 text-xs text-feito">Treino registrado neste dia.</p>
      )}

      <div className="flex flex-col gap-1.5">
        {atividades.map((a) => (
          <Alternador
            key={a.id}
            rotulo={`${a.emoji ?? '•'}  ${a.nome}`}
            ativo={feito(a.id)}
            aoClicar={() => aoAlternarAtividade(a.id)}
          />
        ))}

        {/* Dia treinado nao vira falta: seria contraditorio. */}
        {!treinou && (
          <Alternador
            rotulo="Não treinei"
            ativo={faltou}
            alerta
            aoClicar={aoAlternarFalta}
          />
        )}
      </div>
    </div>
  )
}

function Alternador({
  rotulo, ativo, alerta, aoClicar,
}: {
  rotulo: string
  ativo: boolean
  alerta?: boolean
  aoClicar: () => void
}) {
  // Classes escritas por extenso: o Tailwind varre o codigo em busca de
  // nomes literais, entao `border-${cor}/40` nao geraria estilo nenhum.
  const ligado = alerta ? 'border-alerta/40 bg-alerta/10' : 'border-feito/40 bg-feito/10'
  return (
    <button
      onClick={aoClicar}
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm ${
        ativo ? ligado : 'border-borda active:bg-superficie'
      }`}
    >
      <span className="min-w-0 truncate">{rotulo}</span>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
          ativo
            ? alerta
              ? 'bg-alerta text-fundo'
              : 'bg-feito text-fundo'
            : 'border border-borda text-fraco'
        }`}
      >
        ✓
      </span>
    </button>
  )
}

/** "Setembro de 2026" — so a primeira letra sobe; `capitalize` do CSS
 *  subiria tambem o "de". */
function mesPorExtenso(d: Date) {
  const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** "set/26" para o rotulo do contador. */
function mesCurto(d: Date) {
  const m = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${m}/${String(d.getFullYear()).slice(2)}`
}

function contaNoMes(sessoes: Sessao[], ref: Date) {
  const dias = new Set(
    sessoes
      .filter((s) => {
        const d = new Date(s.iniciada_em)
        return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
      })
      .map((s) => new Date(s.iniciada_em).getDate()),
  )
  return dias.size
}

/** Semanas seguidas com pelo menos um treino, contando de tras para frente. */
function calculaSequencia(sessoes: Sessao[]) {
  if (sessoes.length === 0) return 0
  const semanas = new Set(sessoes.map((s) => chaveSemana(new Date(s.iniciada_em))))
  let n = 0
  const cursor = new Date()
  // A semana corrente so quebra a sequencia depois que ela termina.
  if (!semanas.has(chaveSemana(cursor))) cursor.setDate(cursor.getDate() - 7)
  while (semanas.has(chaveSemana(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 7)
  }
  return n
}

function chaveSemana(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay()) // domingo como inicio
  return x.toISOString().slice(0, 10)
}

