import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  buscarAtividades, buscarExercicios, buscarPerfis, buscarProgressao,
  buscarRegistrosDeAtividade, buscarSessoes, perfisEmCache,
} from '../lib/db'
import GraficoCarga from '../componentes/GraficoCarga'
import type {
  Atividade, AtividadeRegistro, Exercicio, Perfil, PontoProgressao, Sessao,
} from '../lib/tipos'

export default function Historico() {
  const { perfil, ehPersonal } = useAuth()
  const [perfis, setPerfis] = useState<Perfil[]>(perfisEmCache())
  const [vendo, setVendo] = useState<string>(perfil?.id ?? '')
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [extras, setExtras] = useState<AtividadeRegistro[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [exercicioId, setExercicioId] = useState('')
  const [progressao, setProgressao] = useState<PontoProgressao[]>([])
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
  }, [vendo])

  useEffect(() => {
    if (!vendo || !exercicioId) {
      setProgressao([])
      return
    }
    void buscarProgressao(vendo, exercicioId).then(setProgressao).catch(console.error)
  }, [vendo, exercicioId])

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
                vendo === a.id ? 'border-acento bg-acento/15 text-acento' : 'border-borda text-suave'
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
          aoMudarMes={(delta) =>
            setMes((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
          }
        />
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
  mes, sessoes, atividades, extras, aoMudarMes,
}: {
  mes: Date
  sessoes: Sessao[]
  atividades: Atividade[]
  extras: AtividadeRegistro[]
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
          const ehHoje = ehMesAtual && hoje.getDate() === dia
          return (
            <div
              key={dia}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg ${
                letra
                  ? 'bg-feito text-fundo'
                  : marcas
                    ? 'border border-acento/40 bg-elevado'
                    : ehHoje
                      ? 'border-2 border-acento'
                      : 'bg-elevado/40'
              }`}
            >
              <span
                className={`text-[10px] leading-none ${
                  letra ? 'font-semibold opacity-70' : 'text-fraco'
                }`}
              >
                {dia}
              </span>
              {letra && <span className="text-sm font-extrabold leading-tight">{letra}</span>}
              {marcas && !letra && (
                <span className="text-sm leading-tight">{marcas.join('')}</span>
              )}
              {marcas && letra && (
                <span className="absolute right-0.5 top-0.5 text-[9px] leading-none">
                  {marcas.join('')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
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

