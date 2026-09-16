-- =====================================================================
-- App de treinos - schema
-- Uso privado: 3 pessoas (2 alunos + 1 personal). Sem cadastro publico.
-- =====================================================================

create type papel_usuario as enum ('aluno', 'personal');

-- Allowlist. Quem nao esta aqui nao enxerga nada (ver 0002_rls.sql).
create table perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  papel      papel_usuario not null default 'aluno',
  cor        text not null default '#2563eb', -- identifica a pessoa na UI
  criado_em  timestamptz not null default now()
);

-- Catalogo de exercicios, compartilhado.
create table exercicios (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null unique,
  grupo_muscular text,
  video_url      text,
  criado_em      timestamptz not null default now()
);

-- Um treino ("Treino A - Peito e Triceps"). O personal monta UM treino
-- para o casal; as diferencas moram nos itens (ver treino_exercicios).
create table treinos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  ordem         int  not null default 0,
  observacoes   text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Quem faz esse treino.
create table treino_alunos (
  treino_id uuid not null references treinos (id) on delete cascade,
  perfil_id uuid not null references perfis (id) on delete cascade,
  primary key (treino_id, perfil_id)
);

-- Item do treino.
-- perfil_id NULL  -> o exercicio vale para os dois alunos
-- perfil_id setado -> variacao exclusiva daquela pessoa
-- E assim que "treinamos juntos com pequenas diferencas" vira dado:
-- o personal edita um treino so, e marca o que e de quem.
create table treino_exercicios (
  id           uuid primary key default gen_random_uuid(),
  treino_id    uuid not null references treinos (id) on delete cascade,
  exercicio_id uuid not null references exercicios (id) on delete restrict,
  perfil_id    uuid references perfis (id) on delete cascade,
  ordem        int  not null default 0,
  series       int  not null default 3 check (series between 1 and 20),
  reps         text not null default '10-12',
  descanso_seg int  not null default 60 check (descanso_seg between 0 and 600),
  observacao   text
);

create index on treino_exercicios (treino_id, ordem);

-- Uma ida a academia. E daqui que sai a frequencia.
create table sessoes (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid not null references perfis (id) on delete cascade,
  treino_id      uuid references treinos (id) on delete set null,
  treino_nome    text not null, -- snapshot: o treino pode ser renomeado depois
  iniciada_em    timestamptz not null default now(),
  finalizada_em  timestamptz,
  observacao     text
);

create index on sessoes (perfil_id, iniciada_em desc);

-- Uma serie registrada. Guarda SNAPSHOT do nome do exercicio de proposito:
-- quando o personal trocar os exercicios do treino, o historico ja feito
-- continua contando a verdade do dia em que foi feito.
create table series_registros (
  id             uuid primary key default gen_random_uuid(),
  sessao_id      uuid not null references sessoes (id) on delete cascade,
  perfil_id      uuid not null references perfis (id) on delete cascade,
  exercicio_id   uuid references exercicios (id) on delete set null,
  exercicio_nome text not null,
  serie          int  not null check (serie > 0),
  carga_kg       numeric(6,2) check (carga_kg >= 0),
  reps           int check (reps >= 0),
  registrada_em  timestamptz not null default now(),
  unique (sessao_id, exercicio_nome, serie)
);

create index on series_registros (perfil_id, exercicio_id, registrada_em desc);

-- Ultima carga de cada exercicio, por pessoa.
-- E o que faz o app ser pratico: ao abrir a serie, o campo ja vem
-- preenchido com o que voce levantou da ultima vez.
create view ultimas_cargas
with (security_invoker = on) as
select distinct on (perfil_id, exercicio_id)
       perfil_id,
       exercicio_id,
       carga_kg,
       reps,
       registrada_em
from series_registros
where exercicio_id is not null
  and carga_kg is not null
order by perfil_id, exercicio_id, registrada_em desc;

-- Mantem treinos.atualizado_em em dia (usado para avisar "treino mudou").
create function toca_treino () returns trigger
language plpgsql as $$
begin
  update treinos set atualizado_em = now()
  where id = coalesce(new.treino_id, old.treino_id);
  return coalesce(new, old);
end;
$$;

create trigger trg_toca_treino
after insert or update or delete on treino_exercicios
for each row execute function toca_treino ();
