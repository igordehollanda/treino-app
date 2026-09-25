// Fila de escrita para o sinal ruim da academia.
//
// Marcar uma serie NUNCA pode travar esperando a rede: o registro vai para
// o localStorage na hora e sobe quando der. Por isso todo id e gerado no
// cliente e toda escrita e um upsert idempotente - reenviar e inofensivo.

import { supabase } from './supabase'

type Pendente = {
  id: string
  tabela: 'sessoes' | 'series_registros' | 'refeicao_registros' | 'medidas_diarias'
  dados: Record<string, unknown>
  conflito?: string
}

const CHAVE = 'treino:fila'
const ouvintes = new Set<(n: number) => void>()

function ler(): Pendente[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as Pendente[]
  } catch {
    return []
  }
}

function gravar(fila: Pendente[]) {
  localStorage.setItem(CHAVE, JSON.stringify(fila))
  ouvintes.forEach((f) => f(fila.length))
}

export function pendentes() {
  return ler().length
}

export function observarFila(f: (n: number) => void) {
  ouvintes.add(f)
  f(pendentes())
  return () => {
    ouvintes.delete(f)
  }
}

/** Enfileira e ja tenta subir. Nao lanca: a UI segue em frente. */
export async function enfileirar(item: Omit<Pendente, 'id'>) {
  gravar([...ler(), { ...item, id: crypto.randomUUID() }])
  await escoar()
}

let escoando = false

/** Sobe tudo que da, na ordem. Para no primeiro erro de rede. */
export async function escoar() {
  if (escoando || !navigator.onLine) return
  escoando = true
  try {
    let fila = ler()
    while (fila.length > 0) {
      const item = fila[0]
      const { error } = await supabase
        .from(item.tabela)
        .upsert(item.dados, item.conflito ? { onConflict: item.conflito } : undefined)

      // Erro de permissao ou dado invalido nao melhora com repeticao:
      // descarta para a fila nao entupir. Erro de rede: para e tenta depois.
      if (error && !ehErroDeRede(error)) {
        console.error('descartado da fila', item, error)
      } else if (error) {
        break
      }

      fila = ler().filter((p) => p.id !== item.id)
      gravar(fila)
    }
  } finally {
    escoando = false
  }
}

function ehErroDeRede(erro: { message?: string; code?: string }) {
  const m = (erro.message ?? '').toLowerCase()
  return m.includes('fetch') || m.includes('network') || m.includes('timeout')
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void escoar())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void escoar()
  })
}
