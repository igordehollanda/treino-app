-- =====================================================================
-- Modulo de nutricao
--
-- AJUSTAR resolvidos contra 0001-0008:
--
-- 1. `meu_perfil_id()` foi removida. Em 0001, `perfis.id` referencia
--    `auth.users(id)` — o id do perfil E o auth.uid(). A funcao devolveria
--    exatamente auth.uid(), e as policies de 0002 ja comparam direto com
--    ele. Uma indirecao a mais so daria duas formas de escrever a mesma
--    coisa.
--
-- 2. `eh_aluno()` nao existia (havia eh_membro, eh_personal e vejo_treino)
--    e foi criada no mesmo padrao: SECURITY DEFINER para consultar
--    `perfis` de dentro das policies sem recursao de RLS.
--
-- 3. `dias_jiu_jitsu` passou a seguir o getDay() do JS (0 = domingo), que
--    e a convencao de `plano_semanal` em 0006. O arquivo original dizia
--    1 = segunda ... 7 = domingo; as duas convencoes so divergem no
--    domingo, e manter duas no mesmo projeto e um bug esperando o dia.
-- =====================================================================

-- Nutricao e visivel so aos dois alunos. O personal nao ve peso nem comida.
create function eh_aluno () returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'aluno');
$$;

-- --- plano ------------------------------------------------------------

create table planos_alimentares (
  id        uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfis (id) on delete cascade,
  nome      text not null,
  ativo     boolean not null default true,
  -- Dias em que o dia e de jiu-jitsu por padrao, no getDay() do JS
  -- (0 = domingo). Existe porque a refeicao pre-treino das 18h precisa
  -- aparecer antes da aula, quando a atividade ainda nao foi marcada.
  dias_jiu_jitsu smallint[] not null default '{}'
    check (dias_jiu_jitsu <@ array[0,1,2,3,4,5,6]::smallint[]),
  -- Atividade cujo registro no dia transforma qualquer dia em dia de jiu-jitsu.
  atividade_jiu_jitsu_id uuid references atividades (id) on delete set null,
  criado_em timestamptz not null default now()
);

create unique index planos_um_ativo_por_perfil
  on planos_alimentares (perfil_id) where ativo;

create table plano_refeicoes (
  id       uuid primary key default gen_random_uuid(),
  plano_id uuid not null references planos_alimentares (id) on delete cascade,
  nome     text not null,
  horario  time not null,
  tipo_dia text not null default 'ambos'
    check (tipo_dia in ('ambos', 'normal', 'jiu_jitsu')),
  ordem    smallint not null,
  -- false = nao entra na conta de aderencia (ex.: shake pos-jiu-jitsu,
  -- que e "se descer").
  obrigatoria boolean not null default true
);

create index on plano_refeicoes (plano_id, ordem);

create table plano_opcoes (
  id          uuid primary key default gen_random_uuid(),
  refeicao_id uuid not null references plano_refeicoes (id) on delete cascade,
  rotulo      text not null,
  ordem       smallint not null,
  padrao      boolean not null default false,
  -- [{"alimento": "Frango grelhado", "qtd": 200, "unidade": "g"}]
  itens       jsonb not null default '[]',
  -- null = plano sem contagem (o da Camila). A tela esconde kcal e
  -- proteina nesse caso.
  kcal        integer,
  proteina_g  numeric(5,1),
  -- Separa a prescricao do nutricionista do ajuste nosso, para a
  -- validacao dele ser sobre linhas concretas.
  origem      text not null default 'nutricionista'
    check (origem in ('nutricionista', 'ajuste', 'generico')),
  nota        text
);

create unique index opcoes_um_padrao_por_refeicao
  on plano_opcoes (refeicao_id) where padrao;

create table metas_nutricionais (
  perfil_id    uuid primary key references perfis (id) on delete cascade,
  peso_alvo_kg numeric(5,2),
  data_alvo    date,
  -- [{"dia": "2026-09-30", "min": 97.0, "max": 97.5}]
  checkpoints  jsonb not null default '[]',
  regra_corte  text,
  agua_ml_normal       integer,
  agua_ml_jiu_jitsu    integer,
  kcal_normal          integer,
  kcal_jiu_jitsu       integer,
  proteina_g_normal    integer,
  proteina_g_jiu_jitsu integer,
  atualizado_em timestamptz not null default now()
);

-- --- registros --------------------------------------------------------

create table refeicao_registros (
  id            uuid primary key,  -- gerado no cliente: nasce offline e sobe pela fila
  perfil_id     uuid not null references perfis (id) on delete cascade,
  dia           date not null,
  refeicao_id   uuid references plano_refeicoes (id) on delete set null,
  opcao_id      uuid references plano_opcoes (id) on delete set null,
  estado        text not null
    check (estado in ('cumprida', 'parcial', 'fora_do_plano', 'pulada')),
  -- Snapshot do momento do registro: editar o plano nao reescreve o passado.
  refeicao_nome text not null,
  opcao_rotulo  text,
  kcal          integer,        -- null = sem estimativa (nao e zero)
  proteina_g    numeric(5,1),
  descricao     text,
  registrado_em timestamptz not null default now()
);

-- Uma marcacao por refeicao prevista por dia. Extras fora do plano
-- (refeicao_id null) podem ser varios. O cliente reutiliza o id do
-- registro existente ao trocar o estado, senao este indice recusa o upsert.
create unique index registro_unico_por_refeicao
  on refeicao_registros (perfil_id, dia, refeicao_id) where refeicao_id is not null;

create index refeicao_registros_perfil_dia on refeicao_registros (perfil_id, dia);

create table medidas_diarias (
  perfil_id  uuid not null references perfis (id) on delete cascade,
  dia        date not null,
  peso_kg    numeric(5,2),
  cintura_cm numeric(4,1),
  abdomen_cm numeric(4,1),
  agua_ml    integer,
  dormiu_no_horario boolean,   -- refere-se a noite anterior a este dia
  alcool_doses numeric(4,1),   -- 0 = nao bebeu; null = nao informado
  tipo_dia   text check (tipo_dia in ('normal', 'jiu_jitsu')),
                               -- null = derivar; preenchido = escolha manual
  nota       text,
  atualizado_em timestamptz not null default now(),
  primary key (perfil_id, dia)
);

-- --- RLS --------------------------------------------------------------
-- Leitura: os dois alunos veem tudo um do outro. Escrita: cada um so no
-- que e seu. O personal nao le nada deste modulo.

alter table planos_alimentares enable row level security;
alter table plano_refeicoes    enable row level security;
alter table plano_opcoes       enable row level security;
alter table metas_nutricionais enable row level security;
alter table refeicao_registros enable row level security;
alter table medidas_diarias    enable row level security;

create policy "alunos leem os planos" on planos_alimentares
  for select to authenticated using (eh_aluno());
create policy "cuido do meu plano" on planos_alimentares
  for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

create policy "alunos leem as refeicoes" on plano_refeicoes
  for select to authenticated using (eh_aluno());
create policy "cuido das refeicoes do meu plano" on plano_refeicoes
  for all to authenticated
  using (exists (select 1 from planos_alimentares p
                 where p.id = plano_id and p.perfil_id = auth.uid()))
  with check (exists (select 1 from planos_alimentares p
                      where p.id = plano_id and p.perfil_id = auth.uid()));

create policy "alunos leem as opcoes" on plano_opcoes
  for select to authenticated using (eh_aluno());
create policy "cuido das opcoes do meu plano" on plano_opcoes
  for all to authenticated
  using (exists (select 1 from plano_refeicoes r
                 join planos_alimentares p on p.id = r.plano_id
                 where r.id = refeicao_id and p.perfil_id = auth.uid()))
  with check (exists (select 1 from plano_refeicoes r
                      join planos_alimentares p on p.id = r.plano_id
                      where r.id = refeicao_id and p.perfil_id = auth.uid()));

create policy "alunos leem as metas" on metas_nutricionais
  for select to authenticated using (eh_aluno());
create policy "cuido das minhas metas" on metas_nutricionais
  for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

create policy "alunos leem os registros" on refeicao_registros
  for select to authenticated using (eh_aluno());
create policy "registro as minhas refeicoes" on refeicao_registros
  for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

create policy "alunos leem as medidas" on medidas_diarias
  for select to authenticated using (eh_aluno());
create policy "registro as minhas medidas" on medidas_diarias
  for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- Grants explicitos, como nas outras tabelas: o projeto nao depende do
-- "automatically expose new tables" do painel.
grant select, insert, update, delete on
  planos_alimentares, plano_refeicoes, plano_opcoes,
  metas_nutricionais, refeicao_registros, medidas_diarias
  to authenticated;

revoke all on
  planos_alimentares, plano_refeicoes, plano_opcoes,
  metas_nutricionais, refeicao_registros, medidas_diarias
  from anon;

revoke execute on function eh_aluno() from anon;
