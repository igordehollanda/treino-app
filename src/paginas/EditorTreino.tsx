import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  apagarItem, apagarTreino, buscarExercicios, buscarPerfis, buscarTreinos,
  criarExercicio, definirAlunos, salvarItem, salvarTreino,
} from '../lib/db'
import type { Exercicio, Perfil, TreinoCompleto, TreinoExercicio } from '../lib/tipos'

export default function EditorTreino() {
  const { treinoId } = useParams()
  const { ehPersonal } = useAuth()
  const navegar = useNavigate()

  const [treino, setTreino] = useState<TreinoCompleto | null>(null)
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [adicionando, setAdicionando] = useState(false)

  const alunos = useMemo(() => perfis.filter((p) => p.papel === 'aluno'), [perfis])

  const recarregar = async () => {
    const ts = await buscarTreinos()
    setTreino(ts.find((t) => t.id === treinoId) ?? null)
  }

  useEffect(() => {
    void recarregar().catch(console.error)
    void buscarPerfis().then(setPerfis).catch(console.error)
    void buscarExercicios().then(setExercicios).catch(console.error)
     
  }, [treinoId])

  if (!ehPersonal) {
    return <p className="p-8 text-center text-slate-400">Só o personal edita treinos.</p>
  }
  if (!treino) return <p className="p-8 text-center text-slate-400">carregando...</p>

  async function renomear(nome: string) {
    if (!treino) return
    setTreino({ ...treino, nome })
    await salvarTreino({
      id: treino.id, nome, ordem: treino.ordem, observacoes: treino.observacoes,
    })
  }

  async function alternarAluno(perfilId: string) {
    if (!treino) return
    const novos = treino.alunos.includes(perfilId)
      ? treino.alunos.filter((a) => a !== perfilId)
      : [...treino.alunos, perfilId]
    setTreino({ ...treino, alunos: novos })
    await definirAlunos(treino.id, novos)
  }

  async function mover(item: TreinoExercicio, delta: number) {
    if (!treino) return
    const lista = [...treino.itens]
    const i = lista.findIndex((x) => x.id === item.id)
    const j = i + delta
    if (j < 0 || j >= lista.length) return
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
    setTreino({ ...treino, itens: lista })
    await Promise.all(
      lista.map((x, ordem) =>
        salvarItem({
          id: x.id, treino_id: treino.id, exercicio_id: x.exercicio_id,
          perfil_id: x.perfil_id, ordem, series: x.series, reps: x.reps,
          descanso_seg: x.descanso_seg, observacao: x.observacao,
        }),
      ),
    )
    await recarregar()
  }

  async function excluir() {
    if (!treino) return
    if (!confirm(`Apagar "${treino.nome}"? O histórico já registrado continua salvo.`)) return
    await apagarTreino(treino.id)
    navegar('/treinos', { replace: true })
  }

  return (
    <div className="mx-auto max-w-lg p-5">
      <button onClick={() => navegar('/treinos')} className="mb-4 text-sm text-slate-400">
        ← Treinos
      </button>

      <input
        value={treino.nome}
        onChange={(e) => void renomear(e.target.value)}
        className="mb-5 w-full rounded-xl border border-borda bg-cartao px-4 py-3 text-xl font-bold outline-none focus:border-blue-500"
      />

      <section className="mb-5 rounded-2xl border border-borda bg-cartao p-4">
        <p className="mb-3 text-sm text-slate-400">Quem faz este treino</p>
        <div className="flex gap-2">
          {alunos.map((a) => {
            const marcado = treino.alunos.includes(a.id)
            return (
              <button
                key={a.id}
                onClick={() => void alternarAluno(a.id)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-medium ${
                  marcado ? 'border-blue-500 bg-blue-500/15 text-blue-300' : 'border-borda text-slate-400'
                }`}
              >
                {a.nome}
              </button>
            )
          })}
        </div>
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Exercícios</h2>
        <button
          onClick={() => setAdicionando(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium"
        >
          + Adicionar
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {treino.itens.map((item, i) => (
          <LinhaItem
            key={item.id}
            item={item}
            alunos={alunos}
            primeiro={i === 0}
            ultimo={i === treino.itens.length - 1}
            aoMover={(d) => void mover(item, d)}
            aoSalvar={async (campos) => {
              await salvarItem({
                id: item.id, treino_id: treino.id, exercicio_id: item.exercicio_id,
                ordem: item.ordem, ...campos,
              })
              await recarregar()
            }}
            aoApagar={async () => {
              await apagarItem(item.id)
              await recarregar()
            }}
          />
        ))}
      </div>

      <button
        onClick={() => void excluir()}
        className="mt-8 w-full rounded-xl border border-rose-900 py-2.5 text-sm text-rose-400"
      >
        Apagar treino
      </button>

      {adicionando && (
        <SeletorExercicio
          exercicios={exercicios}
          aoFechar={() => setAdicionando(false)}
          aoEscolher={async (exercicioId) => {
            await salvarItem({
              treino_id: treino.id, exercicio_id: exercicioId, perfil_id: null,
              ordem: treino.itens.length, series: 3, reps: '10-12',
              descanso_seg: 60, observacao: null,
            })
            setAdicionando(false)
            await recarregar()
          }}
          aoCriar={async (nome, grupo) => {
            const novo = await criarExercicio(nome, grupo)
            setExercicios((xs) => [...xs, novo])
            return novo.id
          }}
        />
      )}
    </div>
  )
}

function LinhaItem({
  item, alunos, primeiro, ultimo, aoMover, aoSalvar, aoApagar,
}: {
  item: TreinoExercicio
  alunos: Perfil[]
  primeiro: boolean
  ultimo: boolean
  aoMover: (delta: number) => void
  aoSalvar: (campos: {
    perfil_id: string | null; series: number; reps: string | null
    descanso_seg: number; observacao: string | null
  }) => Promise<void>
  aoApagar: () => Promise<void>
}) {
  const [series, setSeries] = useState(String(item.series))
  const [reps, setReps] = useState(item.reps ?? '')
  const [descanso, setDescanso] = useState(String(item.descanso_seg))
  const [observacao, setObservacao] = useState(item.observacao ?? '')
  const [perfilId, setPerfilId] = useState<string | null>(item.perfil_id)

  const salvar = (sobrescreve: Partial<{ perfil_id: string | null }> = {}) =>
    void aoSalvar({
      perfil_id: perfilId,
      series: Math.max(1, Number(series) || 1),
      // Vazio = segue a periodizacao da semana. E o caso normal.
      reps: reps.trim() || null,
      descanso_seg: Math.max(0, Number(descanso) || 0),
      observacao: observacao.trim() || null,
      ...sobrescreve,
    })

  return (
    <div className="rounded-2xl border border-borda bg-cartao p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate font-medium">{item.exercicios?.nome}</h3>
        <div className="flex shrink-0 gap-1 text-slate-500">
          <button onClick={() => aoMover(-1)} disabled={primeiro} className="px-2 disabled:opacity-25">↑</button>
          <button onClick={() => aoMover(1)} disabled={ultimo} className="px-2 disabled:opacity-25">↓</button>
          <button onClick={() => void aoApagar()} className="px-2 text-rose-400">×</button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini rotulo="séries" valor={series} aoMudar={setSeries} aoSair={() => salvar()} />
        <Mini
          rotulo="reps"
          valor={reps}
          aoMudar={setReps}
          aoSair={() => salvar()}
          texto
          placeholder="periodização"
        />
        <Mini rotulo="descanso (s)" valor={descanso} aoMudar={setDescanso} aoSair={() => salvar()} />
      </div>

      {/* O coracao do "treinamos juntos com pequenas diferencas". */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs text-slate-500">Para quem</p>
        <div className="flex gap-2">
          <Opcao
            ativa={perfilId === null}
            rotulo="Ambos"
            aoClicar={() => {
              setPerfilId(null)
              salvar({ perfil_id: null })
            }}
          />
          {alunos.map((a) => (
            <Opcao
              key={a.id}
              ativa={perfilId === a.id}
              rotulo={`So ${a.nome}`}
              aoClicar={() => {
                setPerfilId(a.id)
                salvar({ perfil_id: a.id })
              }}
            />
          ))}
        </div>
      </div>

      <input
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        onBlur={() => salvar()}
        placeholder="observação (ex: pegada aberta)"
        className="mt-3 w-full rounded-lg border border-borda bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
      />
    </div>
  )
}

function Mini({
  rotulo, valor, aoMudar, aoSair, texto, placeholder,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  aoSair: () => void
  texto?: boolean
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{rotulo}</span>
      <input
        inputMode={texto ? 'text' : 'numeric'}
        value={valor}
        placeholder={placeholder}
        onChange={(e) => aoMudar(e.target.value)}
        onBlur={aoSair}
        className="w-full rounded-lg border border-borda bg-slate-800 px-3 py-2 text-base outline-none focus:border-blue-500"
      />
    </label>
  )
}

function Opcao({ ativa, rotulo, aoClicar }: { ativa: boolean; rotulo: string; aoClicar: () => void }) {
  return (
    <button
      onClick={aoClicar}
      className={`flex-1 rounded-lg border py-2 text-xs font-medium ${
        ativa ? 'border-blue-500 bg-blue-500/15 text-blue-300' : 'border-borda text-slate-400'
      }`}
    >
      {rotulo}
    </button>
  )
}

function SeletorExercicio({
  exercicios, aoFechar, aoEscolher, aoCriar,
}: {
  exercicios: Exercicio[]
  aoFechar: () => void
  aoEscolher: (id: string) => Promise<void>
  aoCriar: (nome: string, grupo: string | null) => Promise<string>
}) {
  const [busca, setBusca] = useState('')
  const filtrados = exercicios.filter((e) =>
    normalizar(e.nome).includes(normalizar(busca)),
  )

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-fundo">
      <div className="flex items-center gap-3 border-b border-borda p-4">
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="buscar exercício"
          className="flex-1 rounded-xl border border-borda bg-cartao px-4 py-3 text-base outline-none focus:border-blue-500"
        />
        <button onClick={aoFechar} className="text-sm text-slate-400">cancelar</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {busca.trim() && filtrados.length === 0 && (
          <button
            onClick={async () => {
              const id = await aoCriar(busca.trim(), null)
              await aoEscolher(id)
            }}
            className="mb-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold"
          >
            Criar "{busca.trim()}"
          </button>
        )}
        <ul className="flex flex-col gap-1">
          {filtrados.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => void aoEscolher(e.id)}
                className="w-full rounded-xl px-3 py-3 text-left active:bg-cartao"
              >
                <span className="block">{e.nome}</span>
                {e.grupo_muscular && (
                  <span className="text-xs text-slate-500">{e.grupo_muscular}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
