import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  buscarPerfis, buscarSemanaAtual, buscarTreinos, perfisEmCache, salvarTreino,
  semanaEmCache, treinosEmCache,
} from '../lib/db'
import { repsDoDia } from '../lib/periodizacao'
import { linkDeExecucao } from '../lib/execucao'
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
        <h1 className="text-[26px] font-extrabold">Treinos</h1>
        {ehPersonal && (
          <button
            onClick={() => void novo()}
            className="rounded-xl bg-acento px-4 py-2 text-sm font-semibold active:bg-acento-forte"
          >
            + Novo
          </button>
        )}
      </div>

      {treinos.length === 0 ? (
        <p className="rounded-2xl border border-borda bg-superficie p-6 text-center text-sm text-suave">
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
  // Voces treinam juntos: ver o que o outro faz neste mesmo treino e
  // util na hora de dividir aparelho, nao e bisbilhotice.
  const [vendo, setVendo] = useState(meuId)
  const nomeDe = (id: string) => perfis.find((p) => p.id === id)?.nome ?? '?'

  const parceiros = treino.alunos.filter((a) => a !== meuId)
  const alvo = editavel ? meuId : vendo

  // O aluno ve o treino de quem escolheu. O personal ve os dois lados,
  // que e o ponto de manter um treino so com variacoes.
  const meus = editavel
    ? treino.itens
    : treino.itens.filter((i) => i.perfil_id === null || i.perfil_id === alvo)
  const series = meus.reduce((n, i) => n + i.series, 0)

  return (
    <div className="overflow-hidden rounded-2xl border border-borda bg-superficie">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            {treino.nome}
            {!treino.ativo && <span className="ml-2 text-xs text-fraco">(inativo)</span>}
          </h2>
          <p className="text-sm text-suave">
            <span className="font-bold text-texto">{meus.length}</span> exercícios ·{' '}
            <span className="font-bold text-texto">{series}</span> séries
            {editavel && ` · ${treino.alunos.map(nomeDe).join(' e ') || 'sem alunos'}`}
          </p>
        </div>
        <span className="text-lg text-fraco">{aberto ? '−' : '+'}</span>
      </button>

      {aberto && (
        <div className="border-t border-borda px-4 pb-4 pt-3">
          {!editavel && parceiros.length > 0 && (
            <div className="mb-3 flex gap-1 rounded-xl border border-borda p-1">
              {[meuId, ...parceiros].map((id) => (
                <button
                  key={id}
                  onClick={() => setVendo(id)}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
                    alvo === id ? 'bg-acento text-white' : 'text-suave'
                  }`}
                >
                  {id === meuId ? 'meu treino' : nomeDe(id)}
                </button>
              ))}
            </div>
          )}

          {treino.observacoes && (
            <p className="mb-3 rounded-lg bg-elevado/60 px-3 py-2 text-sm text-texto">
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
                  <span className="w-4 shrink-0 text-xs text-fraco/70">{n + 1}</span>
                  <span className="min-w-0">
                    <a
                      href={linkDeExecucao(
                        i.exercicios?.nome ?? '',
                        i.exercicios?.video_url ?? null,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate underline decoration-borda-forte underline-offset-4"
                    >
                      {i.exercicios?.nome}
                    </a>
                    {i.observacao && (
                      <span className="text-xs text-alerta/80">{i.observacao}</span>
                    )}
                  </span>
                  {i.grupo != null && (
                    <span className="shrink-0 rounded-full bg-biset/15 px-1.5 py-0.5 text-[10px] text-biset">
                      bi-set
                    </span>
                  )}
                  {editavel && i.perfil_id && (
                    <span className="shrink-0 rounded-full bg-acento/15 px-2 py-0.5 text-[10px] text-acento">
                      só {nomeDe(i.perfil_id)}
                    </span>
                  )}
                </span>
                <span className="valor shrink-0 text-sm text-suave">
                  {i.series} × {repsDoDia(i, semana)}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-fraco/70">
            Toque no nome do exercício para ver como executar.
          </p>

          {editavel && (
            <Link
              to={`/treinos/${treino.id}`}
              className="mt-4 block rounded-xl bg-borda py-2.5 text-center text-sm font-medium"
            >
              Editar
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
