import { useState } from 'react'
import type { Exercicio } from '../lib/tipos'

/** Busca no catalogo, com a opcao de cadastrar um exercicio novo na hora. */
export default function SeletorExercicio({
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
          className="flex-1 rounded-xl border border-borda bg-superficie px-4 py-3 text-base outline-none focus:border-acento"
        />
        <button onClick={aoFechar} className="text-sm text-suave">cancelar</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {busca.trim() && filtrados.length === 0 && (
          <button
            onClick={async () => {
              const id = await aoCriar(busca.trim(), null)
              await aoEscolher(id)
            }}
            className="mb-3 w-full rounded-xl bg-acento py-3 text-sm font-semibold"
          >
            Criar "{busca.trim()}"
          </button>
        )}
        <ul className="flex flex-col gap-1">
          {filtrados.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => void aoEscolher(e.id)}
                className="w-full rounded-xl px-3 py-3 text-left active:bg-superficie"
              >
                <span className="block">{e.nome}</span>
                {e.grupo_muscular && (
                  <span className="text-xs text-fraco">{e.grupo_muscular}</span>
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
