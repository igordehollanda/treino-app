import { supabase } from './supabase'
import { enfileirar } from './fila'
import type {
  Atividade, AtividadeRegistro, Exercicio, Falta, Perfil, Periodizacao, PontoProgressao,
  SemanaCiclo, SerieRegistro, Sessao, TreinoCompleto, UltimaCarga,
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
        descanso_seg, observacao, grupo,
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

// --- atividades complementares ---------------------------------------
// Jiu-jitsu, cardio: registro binario por dia, sem serie nem carga.

export async function buscarAtividades(perfilId: string): Promise<Atividade[]> {
  const { data, error } = await supabase
    .from('atividades')
    .select('*')
    .eq('ativa', true)
    .or(`perfil_id.is.null,perfil_id.eq.${perfilId}`)
    .order('ordem')
  if (error) throw error
  cacheGravar(`atividades:${perfilId}`, data)
  return data as Atividade[]
}

export function atividadesEmCache(perfilId: string) {
  return cacheLer<Atividade[]>(`atividades:${perfilId}`) ?? []
}

export async function buscarRegistrosDeAtividade(
  perfilId: string,
  desde: Date,
): Promise<AtividadeRegistro[]> {
  const { data, error } = await supabase
    .from('atividade_registros')
    .select('atividade_id, perfil_id, dia, duracao_min')
    .eq('perfil_id', perfilId)
    .gte('dia', desde.toISOString().slice(0, 10))
  if (error) throw error
  return data as AtividadeRegistro[]
}

/** Marcar de novo o mesmo dia nao duplica: a chave unica cuida disso. */
export async function marcarAtividade(
  atividadeId: string,
  perfilId: string,
  dia: string,
  feito: boolean,
) {
  if (!feito) {
    const { error } = await supabase
      .from('atividade_registros')
      .delete()
      .eq('atividade_id', atividadeId)
      .eq('perfil_id', perfilId)
      .eq('dia', dia)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('atividade_registros')
    .upsert(
      { atividade_id: atividadeId, perfil_id: perfilId, dia },
      { onConflict: 'atividade_id,perfil_id,dia' },
    )
  if (error) throw error
}

export async function salvarAtividade(a: {
  id?: string; nome: string; emoji: string | null; perfil_id: string | null
  meta_semanal: number | null; ordem: number
}) {
  const { error } = await supabase
    .from('atividades')
    .upsert({ ...a, id: a.id ?? crypto.randomUUID() })
  if (error) throw error
}

export async function apagarAtividade(id: string) {
  const { error } = await supabase.from('atividades').delete().eq('id', id)
  if (error) throw error
}

// --- faltas -----------------------------------------------------------
// Dia em branco e ambiguo: pode ser falta ou esquecimento de registrar.

export async function buscarFaltas(perfilId: string, desde: Date): Promise<Falta[]> {
  const { data, error } = await supabase
    .from('faltas')
    .select('perfil_id, dia, motivo')
    .eq('perfil_id', perfilId)
    .gte('dia', desde.toISOString().slice(0, 10))
  if (error) throw error
  return data as Falta[]
}

export async function marcarFalta(perfilId: string, dia: string, motivo: string | null) {
  const { error } = await supabase
    .from('faltas')
    .upsert({ perfil_id: perfilId, dia, motivo }, { onConflict: 'perfil_id,dia' })
  if (error) throw error
}

export async function desmarcarFalta(perfilId: string, dia: string) {
  const { error } = await supabase
    .from('faltas')
    .delete()
    .eq('perfil_id', perfilId)
    .eq('dia', dia)
  if (error) throw error
}

// --- plano da semana --------------------------------------------------
// dia_semana segue o getDay() do JS: 0 = domingo. Dia ausente = descanso.

export async function buscarPlano(perfilId: string): Promise<Record<number, string>> {
  const { data, error } = await supabase
    .from('plano_semanal')
    .select('dia_semana, treino_id')
    .eq('perfil_id', perfilId)
  if (error) throw error

  const plano: Record<number, string> = {}
  for (const r of data ?? []) plano[r.dia_semana as number] = r.treino_id as string
  cacheGravar(`plano:${perfilId}`, plano)
  return plano
}

export function planoEmCache(perfilId: string) {
  return cacheLer<Record<number, string>>(`plano:${perfilId}`) ?? {}
}

/** treinoId null = aquele dia vira descanso. */
export async function definirDiaDoPlano(
  perfilId: string,
  dia: number,
  treinoId: string | null,
) {
  if (treinoId === null) {
    const { error } = await supabase
      .from('plano_semanal')
      .delete()
      .eq('perfil_id', perfilId)
      .eq('dia_semana', dia)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('plano_semanal')
    .upsert(
      { perfil_id: perfilId, dia_semana: dia, treino_id: treinoId },
      { onConflict: 'perfil_id,dia_semana' },
    )
  if (error) throw error
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
export async function buscarProgressao(
  perfilId: string,
  exercicioId: string,
): Promise<PontoProgressao[]> {
  const { data, error } = await supabase
    .from('series_registros')
    .select('carga_kg, reps, registrada_em')
    .eq('perfil_id', perfilId)
    .eq('exercicio_id', exercicioId)
    .not('carga_kg', 'is', null)
    .order('registrada_em')
  if (error) throw error

  const porDia = new Map<string, PontoProgressao>()
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

/**
 * Descarta uma sessao inteira: iniciou por engano, ou desistiu antes de
 * comecar. Sem isto, uma sessao aberta trava a tela Hoje para sempre —
 * nao da para iniciar outro treino nem registrar falta no dia.
 */
export async function descartarSessao(sessaoId: string) {
  const todas = sessoesLocais()
  delete todas[sessaoId]
  try {
    localStorage.setItem(CHAVE_SESSOES, JSON.stringify(todas))
    localStorage.removeItem(`treino:trocas:${sessaoId}`)
  } catch {
    /* segue para o servidor de qualquer forma */
  }
  // As series saem junto, por cascade.
  const { error } = await supabase.from('sessoes').delete().eq('id', sessaoId)
  if (error) throw error
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
  observacao: string | null; grupo?: number | null
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
