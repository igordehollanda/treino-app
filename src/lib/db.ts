import { supabase } from './supabase'
import { enfileirar } from './fila'
import type {
  Exercicio, Perfil, Periodizacao, SemanaCiclo, SerieRegistro, Sessao,
  TreinoCompleto, UltimaCarga,
} from './tipos'
import { semanaDoCiclo } from './periodizacao'

// --- cache local ------------------------------------------------------
// A academia tem sinal ruim. O ultimo treino carregado fica no
// localStorage para a tela abrir instantaneamente, mesmo sem rede.

function cacheLer<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(`treino:cache:${chave}`)
    return bruto ? (JSON.parse(bruto) as T) : null
  } catch {
    return null
  }
}

function cacheGravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(`treino:cache:${chave}`, JSON.stringify(valor))
  } catch {
    /* cota cheia: seguir sem cache */
  }
}

// --- sessoes locais ---------------------------------------------------
// A sessao nasce no cliente e sobe pela fila. Ate subir, ela existe SO
// aqui — sem isto, iniciar um treino sem sinal deixa a tela de execucao
// esperando para sempre por uma linha que o servidor ainda nao tem.

const CHAVE_SESSOES = 'treino:sessoes'

function sessoesLocais(): Record<string, Sessao> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SESSOES) ?? '{}') as Record<string, Sessao>
  } catch {
    return {}
  }
}

export function guardarSessaoLocal(sessao: Sessao) {
  const todas = sessoesLocais()
  todas[sessao.id] = sessao
  // Guarda pouca coisa: sessao fechada ha mais de 2 dias ja subiu.
  const limite = Date.now() - 2 * 864e5
  for (const [id, s] of Object.entries(todas)) {
    if (s.finalizada_em && new Date(s.finalizada_em).getTime() < limite) delete todas[id]
  }
  try {
    localStorage.setItem(CHAVE_SESSOES, JSON.stringify(todas))
  } catch {
    /* cota cheia: a fila ainda garante a subida */
  }
}

export function sessaoLocal(id: string): Sessao | null {
  return sessoesLocais()[id] ?? null
}

export function sessaoAbertaLocal(perfilId: string): Sessao | null {
  return (
    Object.values(sessoesLocais())
      .filter((s) => s.perfil_id === perfilId && !s.finalizada_em)
      .sort((a, b) => b.iniciada_em.localeCompare(a.iniciada_em))[0] ?? null
  )
}

// --- leitura ----------------------------------------------------------

export async function buscarPerfis(): Promise<Perfil[]> {
  const { data, error } = await supabase.from('perfis').select('*').order('nome')
  if (error) throw error
  cacheGravar('perfis', data)
  return data as Perfil[]
}

export function perfisEmCache() {
  return cacheLer<Perfil[]>('perfis') ?? []
}

// Quatro telas pedem a semana do ciclo; ela muda uma vez por semana.
// Sem isto, trocar de aba dispara duas queries a toa, toda vez.
const emVoo = new Map<string, { em: number; promessa: Promise<unknown> }>()

function umaVezPor<T>(chave: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const anterior = emVoo.get(chave)
  if (anterior && Date.now() - anterior.em < ms) return anterior.promessa as Promise<T>
  const promessa = fn().catch((erro) => {
    emVoo.delete(chave) // falhou: a proxima tentativa vai a rede de novo
    throw erro
  })
  emVoo.set(chave, { em: Date.now(), promessa })
  return promessa
}

/**
 * A semana do ciclo em que voces estao hoje.
 * Fica em cache porque a tela de treino nao pode esperar rede para saber
 * quantas repeticoes fazer.
 */
export function buscarSemanaAtual(): Promise<SemanaCiclo | null> {
  return umaVezPor('semana', 60_000, carregarSemanaAtual)
}

async function carregarSemanaAtual(): Promise<SemanaCiclo | null> {
  const [{ data: cfg }, { data: semanas }] = await Promise.all([
    supabase.from('config').select('ciclo_inicio').maybeSingle(),
    supabase.from('periodizacao').select('semana, reps, observacao').order('semana'),
  ])

  const atual = semanaDoCiclo(
    (cfg as { ciclo_inicio: string } | null)?.ciclo_inicio ?? null,
    (semanas ?? []) as Periodizacao[],
  )
  if (atual) cacheGravar('semana', atual)
  return atual
}

export function semanaEmCache() {
  return cacheLer<SemanaCiclo>('semana')
}

export async function buscarExercicios(): Promise<Exercicio[]> {
  const { data, error } = await supabase
    .from('exercicios')
    .select('id, nome, grupo_muscular, video_url')
    .order('grupo_muscular')
    .order('nome')
  if (error) throw error
  return data as Exercicio[]
}

/** Treinos visiveis para quem esta logado, com itens e alunos montados. */
export async function buscarTreinos(): Promise<TreinoCompleto[]> {
  const { data, error } = await supabase
    .from('treinos')
    .select(`
      id, nome, ordem, observacoes, ativo, atualizado_em,
      treino_alunos ( perfil_id ),
      treino_exercicios (
        id, treino_id, exercicio_id, perfil_id, ordem, series, reps,
        descanso_seg, observacao,
        exercicios ( id, nome, grupo_muscular, video_url )
      )
    `)
    .order('ordem')
  if (error) throw error

  const treinos = (data ?? []).map((t) => {
    const bruto = t as unknown as TreinoCompleto & {
      treino_alunos: { perfil_id: string }[]
      treino_exercicios: TreinoCompleto['itens']
    }
    return {
      id: bruto.id,
      nome: bruto.nome,
      ordem: bruto.ordem,
      observacoes: bruto.observacoes,
      ativo: bruto.ativo,
      atualizado_em: bruto.atualizado_em,
      alunos: bruto.treino_alunos.map((a) => a.perfil_id),
      itens: [...bruto.treino_exercicios].sort((a, b) => a.ordem - b.ordem),
    }
  })

  cacheGravar('treinos', treinos)
  return treinos
}

export function treinosEmCache() {
  return cacheLer<TreinoCompleto[]>('treinos') ?? []
}

/** Ultima carga levantada em cada exercicio: o que pre-preenche os campos. */
export async function buscarUltimasCargas(perfilId: string) {
  const { data, error } = await supabase
    .from('ultimas_cargas')
    .select('exercicio_id, carga_kg, reps, registrada_em')
    .eq('perfil_id', perfilId)
  if (error) throw error

  const mapa: Record<string, UltimaCarga> = {}
  for (const u of (data ?? []) as UltimaCarga[]) mapa[u.exercicio_id] = u
  cacheGravar(`cargas:${perfilId}`, mapa)
  return mapa
}

export function cargasEmCache(perfilId: string) {
  return cacheLer<Record<string, UltimaCarga>>(`cargas:${perfilId}`) ?? {}
}

export async function buscarSessoes(perfilId: string, desde: Date): Promise<Sessao[]> {
  const { data, error } = await supabase
    .from('sessoes')
    .select('*')
    .eq('perfil_id', perfilId)
    .gte('iniciada_em', desde.toISOString())
    .order('iniciada_em', { ascending: false })
  if (error) throw error
  return data as Sessao[]
}

/** Sessao em aberto, local ou no servidor — o local tem prioridade. */
export async function buscarSessaoAberta(perfilId: string): Promise<Sessao | null> {
  const local = sessaoAbertaLocal(perfilId)
  if (local) return local

  const { data, error } = await supabase
    .from('sessoes')
    .select('*')
    .eq('perfil_id', perfilId)
    .is('finalizada_em', null)
    .order('iniciada_em', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data?.[0] as Sessao) ?? null
}

export async function buscarSeriesDaSessao(sessaoId: string): Promise<SerieRegistro[]> {
  const { data, error } = await supabase
    .from('series_registros')
    .select('*')
    .eq('sessao_id', sessaoId)
  if (error) throw error
  return data as SerieRegistro[]
}

/** Progressao de carga de um exercicio: a melhor serie de cada dia. */
export async function buscarProgressao(perfilId: string, exercicioId: string) {
  const { data, error } = await supabase
    .from('series_registros')
    .select('carga_kg, reps, registrada_em')
    .eq('perfil_id', perfilId)
    .eq('exercicio_id', exercicioId)
    .not('carga_kg', 'is', null)
    .order('registrada_em')
  if (error) throw error

  const porDia = new Map<string, { dia: string; carga: number; reps: number | null }>()
  for (const r of data ?? []) {
    const dia = (r.registrada_em as string).slice(0, 10)
    const atual = porDia.get(dia)
    const carga = Number(r.carga_kg)
    if (!atual || carga > atual.carga) {
      porDia.set(dia, { dia, carga, reps: r.reps as number | null })
    }
  }
  return [...porDia.values()]
}

// --- escrita ----------------------------------------------------------
// Tudo passa pela fila: id gerado no cliente, upsert idempotente.

export async function iniciarSessao(
  perfilId: string, treinoId: string, treinoNome: string,
): Promise<Sessao> {
  const sessao: Sessao = {
    id: crypto.randomUUID(),
    perfil_id: perfilId,
    treino_id: treinoId,
    treino_nome: treinoNome,
    iniciada_em: new Date().toISOString(),
    finalizada_em: null,
    observacao: null,
  }
  guardarSessaoLocal(sessao)
  await enfileirar({ tabela: 'sessoes', dados: sessao, conflito: 'id' })
  return sessao
}

export async function finalizarSessao(sessao: Sessao, observacao: string | null) {
  const atualizada = {
    ...sessao,
    finalizada_em: new Date().toISOString(),
    observacao,
  }
  guardarSessaoLocal(atualizada)
  await enfileirar({ tabela: 'sessoes', dados: atualizada, conflito: 'id' })
  return atualizada
}

export async function registrarSerie(registro: Omit<SerieRegistro, 'id'>) {
  await enfileirar({
    tabela: 'series_registros',
    dados: { ...registro, id: crypto.randomUUID() },
    conflito: 'sessao_id,exercicio_nome,serie',
  })
}

export async function apagarSerie(sessaoId: string, exercicioNome: string, serie: number) {
  await supabase
    .from('series_registros')
    .delete()
    .eq('sessao_id', sessaoId)
    .eq('exercicio_nome', exercicioNome)
    .eq('serie', serie)
}

// --- edicao do treino (personal) --------------------------------------

export async function salvarTreino(treino: {
  id?: string; nome: string; ordem: number; observacoes: string | null
}) {
  const { data, error } = await supabase
    .from('treinos')
    .upsert({ ...treino, id: treino.id ?? crypto.randomUUID() })
    .select()
    .single()
  if (error) throw error
  return data as TreinoCompleto
}

export async function apagarTreino(id: string) {
  const { error } = await supabase.from('treinos').delete().eq('id', id)
  if (error) throw error
}

export async function definirAlunos(treinoId: string, perfis: string[]) {
  const { error: erroApagar } = await supabase
    .from('treino_alunos').delete().eq('treino_id', treinoId)
  if (erroApagar) throw erroApagar
  if (perfis.length === 0) return
  const { error } = await supabase
    .from('treino_alunos')
    .insert(perfis.map((perfil_id) => ({ treino_id: treinoId, perfil_id })))
  if (error) throw error
}

export async function salvarItem(item: {
  id?: string; treino_id: string; exercicio_id: string; perfil_id: string | null
  ordem: number; series: number; reps: string | null; descanso_seg: number
  observacao: string | null
}) {
  const { error } = await supabase
    .from('treino_exercicios')
    .upsert({ ...item, id: item.id ?? crypto.randomUUID() })
  if (error) throw error
}

export async function apagarItem(id: string) {
  const { error } = await supabase.from('treino_exercicios').delete().eq('id', id)
  if (error) throw error
}

export async function criarExercicio(nome: string, grupo: string | null) {
  const { data, error } = await supabase
    .from('exercicios')
    .insert({ nome, grupo_muscular: grupo })
    .select()
    .single()
  if (error) throw error
  return data as Exercicio
}
