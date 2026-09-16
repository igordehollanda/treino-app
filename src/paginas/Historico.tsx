import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  buscarExercicios, buscarPerfis, buscarProgressao, buscarSessoes, perfisEmCache,
} from '../lib/db'
import type { Exercicio, Perfil, Sessao } from '../lib/tipos'

export default function Historico() {
  const { perfil, ehPersonal } = useAuth()
  const [perfis, setPerfis] = useState<Perfil[]>(perfisEmCache())
  const [vendo, setVendo] = useState<string>(perfil?.id ?? '')
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [exercicioId, setExercicioId] = useState('')
  const [progressao, setProgressao] = useState<{ dia: string; carga: number; reps: number | null }[]>([])

  useEffect(() => {
    void buscarPerfis().then(setPerfis).catch(console.error)
    void buscarExercicios().then(setExercicios).catch(console.error)
  }, [])

  useEffect(() => {
    if (!vendo) return
    void buscarSessoes(vendo, new Date(Date.now() - 180 * 864e5))
      .then(setSessoes)
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
  const porMes = useMemo(() => agrupaPorMes(sessoes), [sessoes])
  const sequencia = useMemo(() => calculaSequencia(sessoes), [sessoes])

  return (
    <div className="mx-auto max-w-lg p-5">
      <h1 className="mb-5 text-2xl font-bold">Histórico</h1>

      {ehPersonal && alunos.length > 0 && (
        <div className="mb-5 flex gap-2">
          {alunos.map((a) => (
            <button
              key={a.id}
              onClick={() => setVendo(a.id)}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-medium ${
                vendo === a.id ? 'border-blue-500 bg-blue-500/15 text-blue-300' : 'border-borda text-slate-400'
              }`}
            >
              {a.nome}
            </button>
          ))}
        </div>
      )}

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Numero rotulo="este mês" valor={contaNoMes(sessoes, new Date())} />
        <Numero rotulo="sequência" valor={sequencia} sufixo="sem" />
        <Numero rotulo="total" valor={sessoes.length} />
      </div>

      <section className="mb-6 rounded-2xl border border-borda bg-cartao p-4">
        <h2 className="mb-3 text-sm text-slate-400">Frequência</h2>
        <div className="flex flex-col gap-4">
          {porMes.slice(0, 3).map(([mes, dias]) => (
            <Mes key={mes} mes={mes} dias={dias} />
          ))}
          {porMes.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum treino registrado ainda.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-borda bg-cartao p-4">
        <h2 className="mb-3 text-sm text-slate-400">Evolução de carga</h2>
        <select
          value={exercicioId}
          onChange={(e) => setExercicioId(e.target.value)}
          className="mb-4 w-full rounded-xl border border-borda bg-slate-800 px-3 py-3 text-base outline-none focus:border-blue-500"
        >
          <option value="">escolha um exercício</option>
          {exercicios.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>

        {exercicioId && progressao.length === 0 && (
          <p className="text-sm text-slate-500">Sem registros desse exercício.</p>
        )}
        {progressao.length > 0 && <Grafico pontos={progressao} />}
      </section>
    </div>
  )
}

function Numero({ rotulo, valor, sufixo }: { rotulo: string; valor: number; sufixo?: string }) {
  return (
    <div className="rounded-2xl border border-borda bg-cartao p-3 text-center">
      <p className="text-2xl font-bold tabular-nums">
        {valor}
        {sufixo && <span className="ml-0.5 text-xs font-normal text-slate-500">{sufixo}</span>}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{rotulo}</p>
    </div>
  )
}

/** Calendario do mes: cada dia treinado acende. */
function Mes({ mes, dias }: { mes: string; dias: Set<number> }) {
  const [ano, m] = mes.split('-').map(Number)
  const totalDias = new Date(ano, m, 0).getDate()
  const primeiroDiaSemana = new Date(ano, m - 1, 1).getDay()

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        <span className="ml-2 text-slate-400">{dias.size} treinos</span>
      </p>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: primeiroDiaSemana }, (_, i) => <div key={`v${i}`} />)}
        {Array.from({ length: totalDias }, (_, i) => i + 1).map((d) => (
          <div
            key={d}
            className={`flex aspect-square items-center justify-center rounded-md text-[11px] ${
              dias.has(d) ? 'bg-emerald-500 font-semibold text-emerald-950' : 'bg-slate-800 text-slate-600'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Grafico de barras simples: cada dia, a carga mais pesada do exercicio. */
function Grafico({ pontos }: { pontos: { dia: string; carga: number; reps: number | null }[] }) {
  const ultimos = pontos.slice(-12)
  const maior = Math.max(...ultimos.map((p) => p.carga))
  const primeiro = ultimos[0]
  const atual = ultimos[ultimos.length - 1]
  const delta = atual.carga - primeiro.carga

  return (
    <div>
      <div className="flex h-32 items-end gap-1.5">
        {ultimos.map((p) => (
          <div key={p.dia} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[9px] tabular-nums text-slate-400">{p.carga}</span>
            <div
              className="w-full rounded-t bg-blue-500"
              style={{ height: `${Math.max(6, (p.carga / maior) * 100)}%` }}
              title={`${p.dia}: ${p.carga}kg${p.reps ? ` x ${p.reps}` : ''}`}
            />
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-400">
        {delta > 0 && <span className="text-emerald-400">+{arredonda(delta)}kg</span>}
        {delta < 0 && <span className="text-amber-400">{arredonda(delta)}kg</span>}
        {delta === 0 && <span>mesma carga</span>}
        <span className="ml-1">
          desde {new Date(`${primeiro.dia}T12:00:00`).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit',
          })}
        </span>
      </p>
    </div>
  )
}

function agrupaPorMes(sessoes: Sessao[]) {
  const mapa = new Map<string, Set<number>>()
  for (const s of sessoes) {
    const d = new Date(s.iniciada_em)
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!mapa.has(chave)) mapa.set(chave, new Set())
    mapa.get(chave)!.add(d.getDate())
  }
  return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]))
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

const arredonda = (n: number) => Math.round(n * 10) / 10
