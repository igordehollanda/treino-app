# Treino

App privado de treinos para **tres pessoas**: dois alunos (o casal) e o
personal. Sem cadastro publico, sem planos, sem outros usuarios.

O foco e **registro e praticidade**: anotar carga entre uma serie e outra,
no celular, com a mao suada e o sinal ruim da academia.

## Como funciona

**Um treino, duas variacoes.** Voces treinam juntos com pequenas
diferencas, entao o personal monta **um** treino e marca cada exercicio
como *Ambos*, *So ele* ou *So ela*. Cada um abre o app e ve so o que e
seu. O personal edita uma vez, nao duas.

**A carga anterior ja vem preenchida.** Ao abrir a serie, o campo mostra
o que voce levantou da ultima vez naquele exercicio. Se repetiu, e um
toque no ✓. Se mudou, voce corrige o numero.

**O historico nao muda quando o treino muda.** Cada serie registrada
guarda o nome do exercicio e a carga daquele dia. O personal pode trocar
tudo no treino que o passado continua contando a verdade.

**Funciona sem sinal.** Marcar serie grava no aparelho na hora e sobe
quando a conexao voltar. Uma tarja amarela avisa quando ha algo na fila.

**O personal edita e voces veem na hora.** Mudanca no treino chega por
realtime, sem precisar fechar e abrir.

## Telas

| Tela | Para que serve |
|---|---|
| **Hoje** | Frequencia dos ultimos 7 dias, treino sugerido (o que voce fez ha mais tempo) e o botao de iniciar |
| **Execucao** | Serie a serie: carga, reps, ✓ e timer de descanso automatico |
| **Treinos** | Lista dos treinos. O personal cria, edita, reordena e define quem faz o que |
| **Historico** | Calendario de frequencia, sequencia de semanas e evolucao de carga por exercicio |

## Stack

Vite + React + TypeScript + Tailwind, Supabase (Auth por magic link,
Postgres, Realtime, RLS) e PWA instalavel na tela inicial.

Toda a permissao mora na RLS do Postgres, nunca so no front — ver
`supabase/migrations/0002_rls.sql`.

## Rodar

```bash
npm install
cp .env.example .env   # preencha com o seu projeto Supabase
npm run dev
```

A configuracao do Supabase (criar o projeto, rodar as migrations, fechar
o cadastro publico e criar as tres pessoas) esta em
**[supabase/SETUP.md](supabase/SETUP.md)**.

## Estrutura

```
src/
  lib/
    supabase.ts   cliente
    auth.tsx      sessao + perfil do usuario logado
    db.ts         consultas e escritas, com cache local
    fila.ts       fila de escrita offline
    tipos.ts      tipos do dominio
  paginas/        Login, Hoje, Execucao, Treinos, EditorTreino, Historico
  componentes/    Layout (abas + aviso de offline)
supabase/
  migrations/     schema, RLS e catalogo inicial de exercicios
  SETUP.md        passo a passo da configuracao inicial
```
