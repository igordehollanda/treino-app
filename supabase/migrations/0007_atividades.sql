-- =====================================================================
-- Atividades complementares
--
-- Jiu-jitsu, cardio, corrida: coisas que voce faz e quer marcar, mas que
-- nao tem serie, repeticao nem periodizacao. Modelar como treino
-- estragaria as contagens ("0 séries") e a leitura do calendario.
--
-- Aqui o registro e binario por dia: fez ou nao fez. A duracao e
-- opcional, para quem quiser anotar.
-- =====================================================================

create table atividades (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  emoji        text,
  -- null = vale para todos os alunos; preenchido = so daquela pessoa
  perfil_id    uuid references perfis (id) on delete cascade,
  -- quantas vezes por semana e a meta; null = sem meta, so registro
  meta_semanal smallint check (meta_semanal is null or meta_semanal between 1 and 14),
  ativa        boolean not null default true,
  ordem        int not null default 0,
  criada_em    timestamptz not null default now()
);

create table atividade_registros (
  id           uuid primary key default gen_random_uuid(),
  atividade_id uuid not null references atividades (id) on delete cascade,
  perfil_id    uuid not null references perfis (id) on delete cascade,
  dia          date not null default current_date,
  duracao_min  smallint check (duracao_min is null or duracao_min > 0),
  observacao   text,
  criada_em    timestamptz not null default now(),
  -- Um registro por atividade por dia: marcar de novo nao duplica.
  unique (atividade_id, perfil_id, dia)
);

create index on atividade_registros (perfil_id, dia desc);

-- --- RLS --------------------------------------------------------------

alter table atividades          enable row level security;
alter table atividade_registros enable row level security;

create policy "membros leem as atividades" on atividades
  for select to authenticated using (eh_membro());

create policy "cuido das minhas atividades" on atividades
  for all to authenticated
  using (perfil_id = auth.uid() or perfil_id is null or eh_personal())
  with check (perfil_id = auth.uid() or perfil_id is null or eh_personal());

create policy "leio registros meus ou de aluno se sou personal" on atividade_registros
  for select to authenticated using (perfil_id = auth.uid() or eh_personal());

create policy "registro as minhas atividades" on atividade_registros
  for all to authenticated
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid());

grant select, insert, update, delete on atividades          to authenticated;
grant select, insert, update, delete on atividade_registros to authenticated;
revoke all on atividades, atividade_registros from anon;

alter publication supabase_realtime add table atividades;

-- --- As atividades de voces -------------------------------------------

insert into atividades (nome, emoji, perfil_id, meta_semanal, ordem)
select 'Jiu-jitsu', '🥋', id, 3, 0 from perfis where nome = 'Igor Hollanda';

insert into atividades (nome, emoji, perfil_id, meta_semanal, ordem)
select 'Cardio', '🏃', id, null, 1 from perfis where nome = 'Camila Cabral';
