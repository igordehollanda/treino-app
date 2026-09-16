-- =====================================================================
-- Periodizacao
--
-- As repeticoes nao pertencem ao exercicio: pertencem a semana do ciclo.
-- O personal define o ciclo uma vez e o app calcula sozinho em que
-- semana voces estao. Sem isto, mudar de semana significaria editar
-- dezenas de linhas na mao toda segunda-feira.
-- =====================================================================

create table periodizacao (
  semana     int primary key check (semana > 0),
  reps       text not null,
  observacao text
);

-- Tabela de uma linha so: o truque do boolean garante que nunca exista
-- uma segunda configuracao para discordar da primeira.
create table config (
  id            boolean primary key default true check (id),
  ciclo_inicio  date not null,
  atualizado_em timestamptz not null default now()
);

-- reps do exercicio passa a ser OPCIONAL.
--   null  -> usa a repeticao da semana atual (o caso normal)
--   texto -> excecao daquele exercicio, ignora a periodizacao
alter table treino_exercicios alter column reps drop not null;
alter table treino_exercicios alter column reps drop default;

comment on column treino_exercicios.reps is
  'null = segue a periodizacao da semana; texto = excecao deste exercicio';

-- --- RLS --------------------------------------------------------------

alter table periodizacao enable row level security;
alter table config       enable row level security;

create policy "membros leem a periodizacao" on periodizacao
  for select to authenticated using (eh_membro());

create policy "personal define a periodizacao" on periodizacao
  for all to authenticated using (eh_personal()) with check (eh_personal());

create policy "membros leem a config" on config
  for select to authenticated using (eh_membro());

create policy "personal define a config" on config
  for all to authenticated using (eh_personal()) with check (eh_personal());

grant select                         on periodizacao to authenticated;
grant insert, update, delete         on periodizacao to authenticated;
grant select                         on config       to authenticated;
grant insert, update, delete         on config       to authenticated;
revoke all on periodizacao, config from anon;

-- O aluno precisa ver a semana mudar sem fechar o app.
alter publication supabase_realtime add table periodizacao;
alter publication supabase_realtime add table config;
