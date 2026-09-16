import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  buscarExercicios, buscarPerfis, buscarProgressao, buscarSessoes, perfisEmCache,
} from '../lib/db'
import GraficoCarga from '../componentes/GraficoCarga'
import type { Exercicio, Perfil, PontoProgressao, Sessao } from '../lib/tipos'

export default function Historico() {
  const { perfil, ehPersonal } = useAuth()
  const [perfis, setPerfis] = useState<Perfil[]>(perfisEmCache())
  const [vendo, setVendo] = useState<string>(perfil?.id ?? '')
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [exercicioId, setExercicioId] = useState('')
  const [progressao, setProgressao] = useState<PontoProgressao[]>([])

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

      {sessoes.length === 0 ? (
        <div className="rounded-2xl border border-borda bg-superficie p-6 text-center">
          <p className="font-medium text-texto">Nenhum treino registrado ainda.</p>
          <p className="mt-1 text-sm text-fraco">
            Assim que você finalizar o primeiro, aparecem aqui a frequência do mês, a
            sequência de semanas e a evolução de carga de cada exercício.
          </p>
        </div>
      ) : (
      <>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Numero rotulo="este mês" valor={contaNoMes(sessoes, new Date())} />
        <Numero rotulo="sequência" valor={sequencia} sufixo="sem" />
        <Numero rotulo="total" valor={sessoes.length} />
      </div>

      <section className="mb-6 rounded-2xl border border-borda bg-superficie p-4">
        <h2 className="rotulo mb-3">Frequência</h2>
        <div className="flex flex-col gap-4">
          {porMes.slice(0, 3).map(([mes, dias]) => (
            <Mes key={mes} mes={mes} dias={dias} />
          ))}
          {porMes.length === 0 && (
            <p className="text-sm text-fraco">Nenhum treino registrado ainda.</p>
          )}
        </div>
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
      </>
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

/** Calendario do mes: cada dia treinado acende. */
function Mes({ mes, dias }: { mes: string; dias: Set<number> }) {
  const [ano, m] = mes.split('-').map(Number)
  const totalDias = new Date(ano, m, 0).getDate()
  const primeiroDiaSemana = new Date(ano, m - 1, 1).getDay()

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fraco">
        {new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        <span className="ml-2 text-suave">{dias.size} treinos</span>
      </p>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: primeiroDiaSemana }, (_, i) => <div key={`v${i}`} />)}
        {Array.from({ length: totalDias }, (_, i) => i + 1).map((d) => (
          <div
            key={d}
            className={`flex aspect-square items-center justify-center rounded-md text-[11px] ${
              dias.has(d) ? 'bg-feito font-semibold text-fundo' : 'bg-elevado text-fraco/70'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
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

