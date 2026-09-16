import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  buscarPerfis, buscarSemanaAtual, buscarTreinos, perfisEmCache, salvarTreino,
  semanaEmCache, treinosEmCache,
} from '../lib/db'
import { repsDoDia } from '../lib/periodizacao'
import type { Perfil, SemanaCiclo, TreinoCompleto } from '../lib/tipos'

export default function Treinos() {
  const { perfil, ehPersonal } = useAuth()
  const navegar = useNavigate()
  const [treinos, setTreinos] = useState<TreinoCompleto[]>(treinosEmCache())
  const [perfis, setPerfis] = useState<Perfil[]>(perfisEmCache())
  const [semana, setSemana] = useState<SemanaCiclo | null>(semanaEmCache())

  useEffect(() => {
    void buscarTreinos().then(setTreinos).catch(console.error)
    void buscarPerfis().then(setPerfis).catch(console.error)
    void buscarSemanaAtual().then(setSemana).catch(console.error)
  }, [])

  async function novo() {
    const treino = await salvarTreino({
      nome: `Treino ${String.fromCharCode(65 + treinos.length)}`,
      ordem: treinos.length,
      observacoes: null,
    })
    navegar(`/treinos/${treino.id}`)
  }

  return (
    <div className="mx-auto max-w-lg p-5 md:max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Treinos</h1>
        {ehPersonal && (
          <button
            onClick={() => void novo()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold active:bg-blue-700"
          >
            + Novo
          </button>
        )}
      </div>

      {treinos.length === 0 ? (
        <p className="rounded-2xl border border-borda bg-cartao p-6 text-center text-sm text-slate-400">
          {ehPersonal ? 'Monte o primeiro treino.' : 'O personal ainda não montou nada.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {treinos.map((t) => (
            <Cartao
              key={t.id}
              treino={t}
              perfis={perfis}
              semana={semana}
              meuId={perfil?.id ?? ''}
              editavel={ehPersonal}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Cartao({
  treino, perfis, semana, meuId, editavel,
}: {
  treino: TreinoCompleto
  perfis: Perfil[]
  semana: SemanaCiclo | null
  meuId: string
  editavel: boolean
}) {
  // Aberto por padrao: esta tela existe para consultar o treino. Fechada,
  // ela so mostrava um titulo e um numero que nao era de ninguem.
  const [aberto, setAberto] = useState(true)
  const nomeDe = (id: string) => perfis.find((p) => p.id === id)?.nome ?? '?'

  // O aluno ve o treino dele. O personal ve os dois lados, que e o ponto
  // de manter um treino so com variacoes.
  const meus = editavel
    ? treino.itens
    : treino.itens.filter((i) => i.perfil_id === null || i.perfil_id === meuId)
  const doOutro = editavel
    ? []
    : treino.itens.filter((i) => i.perfil_id !== null && i.perfil_id !== meuId)
  const series = meus.reduce((n, i) => n + i.series, 0)

  return (
    <div className="overflow-hidden rounded-2xl border border-borda bg-cartao">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            {treino.nome}
            {!treino.ativo && <span className="ml-2 text-xs text-slate-500">(inativo)</span>}
          </h2>
          <p className="text-sm text-slate-400">
            {meus.length} exercícios · {series} séries
            {editavel && ` · ${treino.alunos.map(nomeDe).join(' e ') || 'sem alunos'}`}
          </p>
        </div>
        <span className="text-lg text-slate-500">{aberto ? '−' : '+'}</span>
      </button>

      {aberto && (
        <div className="border-t border-borda px-4 pb-4 pt-3">
          {treino.observacoes && (
            <p className="mb-3 rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
              {treino.observacoes}
            </p>
          )}

          <ul className="flex flex-col">
            {meus.map((i, n) => (
              <li
                key={i.id}
                className="flex items-baseline justify-between gap-3 border-b border-borda/50 py-2 text-sm last:border-0"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-4 shrink-0 text-xs text-slate-600">{n + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{i.exercicios?.nome}</span>
                    {i.observacao && (
                      <span className="text-xs text-amber-400/80">{i.observacao}</span>
                    )}
                  </span>
                  {i.grupo != null && (
                    <span className="shrink-0 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                      bi-set
                    </span>
                  )}
                  {editavel && i.perfil_id && (
                    <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-300">
                      só {nomeDe(i.perfil_id)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {i.series} × {repsDoDia(i, semana)}
                </span>
              </li>
            ))}
          </ul>

          {doOutro.length > 0 && (
            <p className="mt-3 text-xs text-slate-600">
              {nomeDe(doOutro[0].perfil_id!)} faz {doOutro.length}{' '}
              {doOutro.length === 1 ? 'exercício diferente' : 'exercícios diferentes'} neste treino.
            </p>
          )}

          {editavel && (
            <Link
              to={`/treinos/${treino.id}`}
              className="mt-4 block rounded-xl bg-slate-700 py-2.5 text-center text-sm font-medium"
            >
              Editar
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
