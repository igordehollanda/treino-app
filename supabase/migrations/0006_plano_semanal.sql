-- =====================================================================
-- Plano da semana
--
-- Sem isto, "Hoje" sugeria o treino que voce fez ha mais tempo — um
-- chute razoavel, mas chute. Com o plano, a tela diz "hoje e terca:
-- treino B", que e a informacao que voce realmente quer ao acordar.
--
-- O plano e POR PESSOA, e nao global, porque o treino E sao dois
-- treinos distintos: na sexta cada um cai no seu.
-- =====================================================================

create table plano_semanal (
  perfil_id  uuid     not null references perfis (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  treino_id  uuid     not null references treinos (id) on delete cascade,
  primary key (perfil_id, dia_semana)
);

comment on table plano_semanal is
  'dia_semana segue o getDay() do JS: 0 = domingo. Dia sem linha = descanso';

alter table plano_semanal enable row level security;

-- Cada um cuida da propria semana; o personal cuida da de todos.
create policy "leio o plano meu ou dos alunos se sou personal" on plano_semanal
  for select to authenticated using (perfil_id = auth.uid() or eh_personal());

create policy "edito o plano meu ou dos alunos se sou personal" on plano_semanal
  for all to authenticated
  using (perfil_id = auth.uid() or eh_personal())
  with check (perfil_id = auth.uid() or eh_personal());

grant select, insert, update, delete on plano_semanal to authenticated;
revoke all on plano_semanal from anon;

alter publication supabase_realtime add table plano_semanal;
