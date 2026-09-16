-- =====================================================================
-- RLS - a permissao mora no Postgres, nunca so no front.
-- Regra base: se o seu uid nao esta em `perfis`, voce nao le uma linha.
-- =====================================================================

-- Funcoes SECURITY DEFINER para consultar `perfis` de dentro das policies
-- sem cair em recursao infinita de RLS.
create function eh_membro () returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid());
$$;

create function eh_personal () returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'personal');
$$;

-- Aluno enxerga um treino se ele foi atribuido a ele. Personal enxerga todos.
create function vejo_treino (t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_personal()
      or exists (select 1 from treino_alunos
                 where treino_id = t and perfil_id = auth.uid());
$$;

alter table perfis             enable row level security;
alter table exercicios         enable row level security;
alter table treinos            enable row level security;
alter table treino_alunos      enable row level security;
alter table treino_exercicios  enable row level security;
alter table sessoes            enable row level security;
alter table series_registros   enable row level security;

-- --- perfis -----------------------------------------------------------
-- Sao tres pessoas que treinam juntas: todos se enxergam.
create policy "membros leem perfis" on perfis
  for select to authenticated using (eh_membro());

create policy "edito meu perfil" on perfis
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Ninguem cria nem apaga perfil pelo app. Os tres sao inseridos a mao,
-- uma vez, no painel do Supabase. E isso que mantem o app fechado.

-- --- exercicios -------------------------------------------------------
create policy "membros leem exercicios" on exercicios
  for select to authenticated using (eh_membro());

-- Alunos tambem podem cadastrar exercicio novo: na pratica o personal
-- manda "faz supino inclinado hoje" e voce precisa registrar na hora.
create policy "membros criam exercicios" on exercicios
  for insert to authenticated with check (eh_membro());

create policy "personal edita exercicios" on exercicios
  for update to authenticated using (eh_personal()) with check (eh_personal());

-- --- treinos ----------------------------------------------------------
create policy "leio meus treinos" on treinos
  for select to authenticated using (vejo_treino(id));

create policy "personal cria treinos" on treinos
  for insert to authenticated with check (eh_personal());

create policy "personal edita treinos" on treinos
  for update to authenticated using (eh_personal()) with check (eh_personal());

create policy "personal apaga treinos" on treinos
  for delete to authenticated using (eh_personal());

-- --- treino_alunos ----------------------------------------------------
create policy "leio atribuicoes dos meus treinos" on treino_alunos
  for select to authenticated using (vejo_treino(treino_id));

create policy "personal atribui treinos" on treino_alunos
  for all to authenticated using (eh_personal()) with check (eh_personal());

-- --- treino_exercicios ------------------------------------------------
-- Aluno le o treino inteiro (inclusive a variacao do conjuge: vocês
-- treinam juntos, ver o que o outro faz e util, nao vazamento).
create policy "leio exercicios dos meus treinos" on treino_exercicios
  for select to authenticated using (vejo_treino(treino_id));

create policy "personal monta o treino" on treino_exercicios
  for all to authenticated using (eh_personal()) with check (eh_personal());

-- --- sessoes ----------------------------------------------------------
-- Cada aluno escreve so as proprias sessoes. O personal le as dos dois
-- (e o ponto de acompanhar frequencia), mas nao treina por voce.
create policy "leio sessoes minhas ou de aluno se sou personal" on sessoes
  for select to authenticated using (perfil_id = auth.uid() or eh_personal());

create policy "crio minhas sessoes" on sessoes
  for insert to authenticated with check (perfil_id = auth.uid());

create policy "edito minhas sessoes" on sessoes
  for update to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

create policy "apago minhas sessoes" on sessoes
  for delete to authenticated using (perfil_id = auth.uid());

-- --- series_registros -------------------------------------------------
create policy "leio series minhas ou de aluno se sou personal" on series_registros
  for select to authenticated using (perfil_id = auth.uid() or eh_personal());

create policy "registro minhas series" on series_registros
  for insert to authenticated with check (perfil_id = auth.uid());

create policy "corrijo minhas series" on series_registros
  for update to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

create policy "apago minhas series" on series_registros
  for delete to authenticated using (perfil_id = auth.uid());

-- Realtime: o personal edita no celular dele e o treino muda no de voces.
alter publication supabase_realtime add table treinos;
alter publication supabase_realtime add table treino_exercicios;
