# Treino

App privado de musculação para **três pessoas**: dois alunos (um casal) e o
personal que monta os treinos. Sem cadastro público, sem planos, sem outros
usuários — e isso é uma restrição de projeto, não uma limitação temporária.

O foco é **registro e praticidade**: anotar carga entre uma série e outra, no
celular, com a mão suada e o sinal ruim da academia.

Em produção: <https://treino-app-six.vercel.app>

---

## Rodar

```bash
npm install
cp .env.example .env    # preencha com o projeto Supabase
npm run dev
```

A configuração do Supabase (criar o projeto, rodar as migrations, fechar o
cadastro, criar as três pessoas) está em **[supabase/SETUP.md](supabase/SETUP.md)**.

Deploy: Vercel, a partir da branch `main`. `vercel.json` traz o rewrite de SPA,
sem o qual recarregar `/historico` dá 404.

---

## Decisões que não devem ser desfeitas

Estas escolhas parecem arbitrárias de fora e custaram caro para chegar até
aqui. Desfazer qualquer uma quebra algo que hoje funciona.

### Um treino, variações por pessoa

O casal treina junto com pequenas diferenças. `treino_exercicios.perfil_id`
com `null` vale para os dois; preenchido, é a variação de um só. O personal
edita **um** treino, não dois.

Quando ordem ou número de séries divergem entre as duas pessoas, o exercício
vira **duas linhas**, uma de cada. A sequência prescrita é intencional e vale
mais que economizar uma linha.

### O treino E são dois treinos

O E da aluna é Inferior + Ombro; o do aluno é Peito / Ombro / Tríceps. **Não
têm um exercício em comum.** Unificar exigiria marcar cada linha como
exclusiva — dois treinos usando um nome só. Por isso são dois registros
distintos, cada um atribuído a uma pessoa.

### Repetições pertencem à semana, não ao exercício

O ciclo tem 4 semanas (8-10, 8-10, 5-6, 12-15) e se repete indefinidamente a
partir de `config.ciclo_inicio`. `treino_exercicios.reps` é **opcional**:
`null` significa "segue a semana"; texto é exceção daquele exercício.

Gravar "8-10" fixo em cada linha obrigaria o personal a editar dezenas de
exercícios toda segunda-feira.

`semanaDoCiclo()` ancora as datas ao meio-dia dos dois lados, para não
escorregar com fuso nem horário de verão.

### O histórico é imune à edição do treino

`series_registros` guarda `exercicio_nome` e `exercicio_id` **no momento do
registro**. O personal pode trocar todos os exercícios do treino que o
passado continua contando a verdade do dia em que foi feito.

É também o que faz a troca de exercício na sessão funcionar de graça.

### Escrita offline

Academia tem sinal ruim, e marcar série não pode esperar rede. Toda sessão e
toda série nascem com **id gerado no cliente**, vão para o `localStorage` e
sobem por uma fila (`src/lib/fila.ts`) de upserts **idempotentes** — reenviar
é inofensivo.

Corolário: a sessão existe localmente antes de existir no servidor. A tela de
execução lê `sessaoLocal()` primeiro; sem isso, iniciar um treino sem sinal
trava esperando uma linha que o servidor ainda não tem.

### O app é fechado por construção

- cadastro público desligado no painel; o app ainda manda `shouldCreateUser: false`
- allowlist na tabela `perfis`: quem não está lá não lê uma linha
- RLS em todas as tabelas, **mais** grants explícitos por tabela e `revoke` de
  `anon` — o projeto não depende da opção "expose new tables" do painel
- verificado em produção: requisição anônima com a chave publicável devolve
  `42501 permission denied`

### Senha é o login padrão

Link mágico continua disponível, mas **não** como principal. Dois motivos, os
dois aprendidos doendo:

1. O serviço de e-mail do Supabase no plano gratuito é fortemente limitado.
   Estourado o limite, `POST /auth/v1/otp` devolve **429** e ninguém entra.
2. No iPhone o link do e-mail abre sempre no navegador padrão, nunca no app da
   tela de início — que tem armazenamento próprio. Logar no navegador **não**
   loga no ícone.

Por isso, aberto pelo ícone, a tela de login mostra só a senha.

### Descanso é 90s em tudo

A prescrição usa 90 segundos uniformemente. O app permite ajustar
exercício por exercício no editor, e exercício novo nasce com 90.

### Bi-set

`treino_exercicios.grupo`: mesmo número no mesmo treino = executados
alternando as séries. O descanso dispara **só no fim da rodada**, com o maior
valor do grupo. Séries desiguais funcionam (3x + 4x: a quarta rodada mostra só
um). Grupo que sobra com um membro só volta a ser exercício normal.

### RIR: `null` não é zero

`series_registros.rir`: `0` = foi à falha; `N` = sobraram N repetições;
`null` = não informado. São três estados, não dois.

### Atividades ≠ treinos

Jiu-jitsu e cardio não têm série, repetição nem periodização. Modelar como
treino faria o app anunciar "0 séries" e misturaria, no calendário, duas
leituras diferentes: constância de musculação e constância de atividade extra.
Por isso `atividades` + `atividade_registros`, com registro binário por dia.

### Falta é um registro, não ausência de registro

Dia em branco é ambíguo: pode ser falta ou esquecimento de anotar. `faltas`
separa as duas coisas. O motivo é **opcional** de propósito — exigir
justificativa faria as pessoas simplesmente não marcarem.

---

## Modelo de dados

13 tabelas, todas com RLS.

| Tabela | Papel |
|---|---|
| `perfis` | allowlist + papel (`aluno` / `personal`) |
| `exercicios` | catálogo compartilhado |
| `treinos`, `treino_alunos` | o treino e a quem foi atribuído |
| `treino_exercicios` | itens: `perfil_id` null = ambos; `reps` null = segue a semana; `grupo` = bi-set |
| `sessoes` | uma ida à academia; `treino_nome` é snapshot |
| `series_registros` | cada série, com snapshot do exercício e `rir` |
| `ultimas_cargas` (view) | última carga por pessoa e exercício — pré-preenche os campos |
| `periodizacao`, `config` | o ciclo de repetições e sua data de início |
| `plano_semanal` | que treino em que dia, **por pessoa** (o E difere) |
| `atividades`, `atividade_registros` | extras, com meta semanal opcional |
| `faltas` | ausência assumida, com motivo opcional |

Funções `SECURITY DEFINER` (`eh_membro`, `eh_personal`, `vejo_treino`) existem
para consultar `perfis` de dentro das policies sem recursão de RLS.

---

## Telas

| Rota | O que faz |
|---|---|
| `/` **Hoje** | meta de repetições da semana, a semana com a letra de cada dia, o treino de hoje pelo plano, extras com um toque, e "não vou treinar hoje" |
| `/executar/:id` **Execução** | série a série: carga, reps, ✓, timer de descanso, bi-set, RIR, progressão do exercício, troca de exercício |
| `/treinos` **Treinos** | consulta do treino; o aluno alterna entre o dele e o do parceiro |
| `/treinos/:id` **Editor** | só o personal: exercícios, séries, descanso, para quem, bi-set |
| `/historico` **Histórico** | calendário mês a mês com a letra do treino, extras e faltas; evolução de carga |
| `/conta` **Conta** | plano da semana, extras, trocar senha |

---

## Estrutura

```
src/
  lib/
    supabase.ts     cliente
    auth.tsx        sessão + perfil
    db.ts           todas as consultas e escritas, com cache local
    fila.ts         fila de escrita offline
    periodizacao.ts semana do ciclo e repetição do dia
    datas.ts        chaveDia, inicioDaSemana (semana começa na segunda)
    execucao.ts     link de demonstração do exercício
    tipos.ts        tipos do domínio
  paginas/          Login, Hoje, Execucao, Treinos, EditorTreino, Historico, Conta
  componentes/      Layout, GraficoCarga, SeletorExercicio
supabase/
  migrations/       0001 a 0008, rodar em ordem
  treinos_camila_igor.sql   os treinos reais (dados, não schema)
  SETUP.md          passo a passo da configuração
```

---

## Convenções

- **Código e comentários em português.** O dono do app lê o código.
- **Comentário explica o porquê**, não o quê. Se não houver porquê, não há
  comentário.
- **Cores só por token** (`bg-superficie`, `text-suave`, `bg-acento`…),
  definidos em `src/index.css`. Nada de `bg-slate-800` solto.
  `acento` é fundo de botão; para texto use `acento-texto` — o tom de fundo
  reprova em contraste quando aplicado a texto pequeno.
- **Contraste medido, não estimado.** Todos os pares texto/fundo passam em
  WCAG AA (4.5:1). `fraco` é a cor dos textos de 10–12px; foi calibrada para
  4.51:1 na superfície mais clara.
- **Escrita otimista** onde o toque precisa responder na hora: marcar série,
  marcar extra, marcar falta, plano da semana.
- **Cache antes da rede**: as telas abrem com o que está no `localStorage` e
  corrigem quando a resposta chega. Academia tem sinal ruim.
- **Alvo de toque ≥ 48px**; o ✓ de concluir série tem 56.

---

## Verificar uma mudança

```bash
npm run build      # tsc -b && vite build; o typecheck é o primeiro filtro
npm run preview    # serve o build em :4173
```

Não há suíte de testes. As mudanças de tela foram verificadas rodando o build
num Chromium headless (Playwright) com as respostas do Supabase simuladas por
`page.route`, em viewport de celular (390×844) — marcando séries, trocando
exercício, navegando meses. É um harness descartável, não versionado; vale
recriá-lo quando mexer em fluxo, porque é fácil quebrar a execução sem que o
TypeScript reclame.

Ao mexer no visual, olhe **no tamanho de celular**. O desktop é secundário: o
app é usado na academia.
