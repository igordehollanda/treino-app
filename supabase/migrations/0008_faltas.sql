-- =====================================================================
-- Faltas
--
-- Sem isto, um dia em branco no calendario e ambiguo: nao da para saber
-- se a pessoa faltou ou so esqueceu de registrar. Marcar a ausencia
-- separa as duas coisas e torna a leitura de constancia confiavel.
--
-- O motivo e opcional de proposito: exigir justificativa faria as
-- pessoas simplesmente nao marcarem.
-- =====================================================================

create table faltas (
  perfil_id uuid not null references perfis (id) on delete cascade,
  dia       date not null,
  motivo    text,
  criada_em timestamptz not null default now(),
  primary key (perfil_id, dia)
);

alter table faltas enable row level security;

-- Faltar e assunto de quem faltou; o personal le, para acompanhar.
create policy "leio faltas minhas ou de aluno se sou personal" on faltas
  for select to authenticated using (perfil_id = auth.uid() or eh_personal());

create policy "registro as minhas faltas" on faltas
  for all to authenticated
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid());

grant select, insert, update, delete on faltas to authenticated;
revoke all on faltas from anon;
