export type Papel = 'aluno' | 'personal'

export type Perfil = {
  id: string
  nome: string
  papel: Papel
  cor: string
}

export type Exercicio = {
  id: string
  nome: string
  grupo_muscular: string | null
  video_url: string | null
}

export type Treino = {
  id: string
  nome: string
  ordem: number
  observacoes: string | null
  ativo: boolean
  atualizado_em: string
}

/** `perfil_id: null` = o exercicio vale para os dois alunos. */
export type TreinoExercicio = {
  id: string
  treino_id: string
  exercicio_id: string
  perfil_id: string | null
  ordem: number
  series: number
  /** null = segue a periodizacao da semana; texto = excecao deste exercicio. */
  reps: string | null
  descanso_seg: number
  observacao: string | null
  /** Mesmo numero no mesmo treino = bi-set; null = exercicio solo. */
  grupo: number | null
  exercicios: Exercicio | null
}

export type Periodizacao = {
  semana: number
  reps: string
  observacao: string | null
}

/** Onde o ciclo esta hoje, ja resolvido para a tela. */
export type SemanaCiclo = {
  semana: number
  reps: string
  observacao: string | null
  /** quantas semanas tem o ciclo */
  total: number
  /** qual repeticao do ciclo estamos vivendo (1a, 2a, ...) */
  ciclo: number
  diasParaProxima: number
}

export type Sessao = {
  id: string
  perfil_id: string
  treino_id: string | null
  treino_nome: string
  iniciada_em: string
  finalizada_em: string | null
  observacao: string | null
}

export type SerieRegistro = {
  id: string
  sessao_id: string
  perfil_id: string
  exercicio_id: string | null
  exercicio_nome: string
  serie: number
  carga_kg: number | null
  reps: number | null
  /** 0 = falha; N = repeticoes em reserva; null = nao informado. */
  rir: number | null
  registrada_em: string
}

export type Atividade = {
  id: string
  nome: string
  emoji: string | null
  /** null = vale para todos os alunos. */
  perfil_id: string | null
  /** vezes por semana; null = sem meta, so registro. */
  meta_semanal: number | null
  ativa: boolean
  ordem: number
}

export type AtividadeRegistro = {
  atividade_id: string
  perfil_id: string
  dia: string
  duracao_min: number | null
}

export type Falta = {
  perfil_id: string
  dia: string
  motivo: string | null
}

export type PontoProgressao = {
  dia: string
  carga: number
  reps: number | null
}

export type UltimaCarga = {
  exercicio_id: string
  carga_kg: number | null
  reps: number | null
  /** 0 = falha; N = repeticoes em reserva; null = nao informado. */
  rir: number | null
  registrada_em: string
}

/** Treino com tudo que a tela precisa, ja montado. */
export type TreinoCompleto = Treino & {
  alunos: string[]
  itens: TreinoExercicio[]
}

// --- nutricao ---------------------------------------------------------
// Nomes seguem a especificacao do modulo; conferir contra 0009 quando ela
// chegar.

export type TipoDia = 'normal' | 'jiu_jitsu'
export type TipoDiaRefeicao = TipoDia | 'ambos'
export type OrigemOpcao = 'nutricionista' | 'ajuste' | 'generico'
export type EstadoRefeicao = 'cumprida' | 'parcial' | 'fora_do_plano' | 'pulada'

export type PlanoAlimentar = {
  id: string
  perfil_id: string
  ativo: boolean
  /** getDay() do JS: 0 = domingo. */
  dias_jiu_jitsu: number[] | null
  atividade_jiu_jitsu_id: string | null
}

export type PlanoRefeicao = {
  id: string
  plano_id: string
  nome: string
  horario: string | null
  tipo_dia: TipoDiaRefeicao
  ordem: number
  /** false = nao entra na aderencia. */
  obrigatoria: boolean
}

export type PlanoOpcao = {
  id: string
  refeicao_id: string
  rotulo: string
  itens: unknown
  kcal: number | null
  proteina_g: number | null
  origem: OrigemOpcao
  padrao: boolean
  nota: string | null
}

export type RefeicaoRegistro = {
  id: string
  perfil_id: string
  dia: string
  /** null = extra fora do plano. */
  refeicao_id: string | null
  opcao_id: string | null
  estado: EstadoRefeicao
  /** Snapshot no momento do registro, como em series_registros. */
  refeicao_nome: string
  opcao_rotulo: string | null
  /** null = sem estimativa, que nao e zero. */
  kcal: number | null
  proteina_g: number | null
  observacao: string | null
}

export type Medida = {
  perfil_id: string
  dia: string
  peso_kg: number | null
  cintura_cm: number | null
  abdomen_cm: number | null
  agua_ml: number | null
  /** null = nao informado; 0 = nao bebeu. */
  alcool_doses: number | null
  dormiu_no_horario: boolean | null
  /** Escolha manual do dia; vence o dia da semana e a atividade. */
  tipo_dia: TipoDia | null
}
