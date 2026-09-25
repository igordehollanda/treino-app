-- =====================================================================
-- ATALHO: 0009 + 0010 + plano alimentar, num arquivo so.
--
-- Existe para rodar tudo de uma vez pelo celular, sem abrir tres
-- arquivos. O conteudo e identico ao dos originais:
--
--   supabase/migrations/0009_nutricao.sql
--   supabase/migrations/0010_observacao_plano.sql
--   supabase/plano_alimentar_camila_igor.sql
--
-- Pre-requisito: 0001 a 0008 ja aplicadas.
--
-- UMA transacao para as tres partes: se qualquer linha falhar, nada e
-- gravado e o banco fica como estava. Nao ha meio-caminho.
--
-- Rodar de novo e seguro para o schema (0009 e 0010 recusam, porque as
-- tabelas ja existem), mas o seed SUBSTITUI o plano ativo. O historico
-- de refeicoes registradas sobrevive: refeicao_registros guarda o
-- snapshot e as chaves sao `on delete set null`.
-- =====================================================================

begin;

-- ===================================================================
-- Parte 1 de 3: 0009_nutricao.sql
-- ===================================================================

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

-- ===================================================================
-- Parte 2 de 3: 0010_observacao_plano.sql
-- ===================================================================

-- =====================================================================
-- Observacao do plano alimentar
--
-- O plano impresso traz regras que nao cabem em nenhuma refeicao e valem
-- para todas: a lista de proteina permitida, a alergia a crustaceos, e a
-- regra de que toda troca sai da lista de substituicoes do nutricionista.
--
-- Sem um lugar para elas, essas regras ficariam so no PDF — e a alergia e
-- exatamente o tipo de coisa que precisa estar na tela onde a comida e
-- escolhida, nao num papel na geladeira.
-- =====================================================================

alter table planos_alimentares add column observacao text;

-- ===================================================================
-- Parte 3 de 3: plano_alimentar_camila_igor.sql
-- ===================================================================

-- =====================================================================
-- Plano alimentar — Igor e Camila
-- Dados, nao schema. Rodar depois de 0009 e 0010.
--
-- FONTE: "Plano Igor e Camila | 24/09 a 16/10/2026 | versao 6", paginas 1,
-- 2 e 4. Base do nutricionista Junior Cordeiro, com os ajustes do ciclo
-- marcados como origem 'ajuste' — eles ainda aguardam a validacao dele.
-- Kcal e proteina pela Tabela TACO, pesos do alimento pronto.
--
-- Uma decisao de fidelidade: o plano impresso da UM valor de kcal e
-- proteina por REFEICAO, nao por opcao. As opcoes de uma mesma refeicao
-- entram todas com esse mesmo valor, porque e assim que o nutricionista
-- as trata — equivalentes entre si. Inventar um numero diferente para
-- cada uma daria a impressao de uma precisao que a prescricao nao tem.
--
-- Plano da Camila: generico de proposito. O documento diz "mesmos
-- horarios e mesma estrutura de refeicoes de Igor, com porcoes dela",
-- sem whey e sem ceia. Ela nao tem prescricao individual; inventar
-- caloria para ela seria mentira com cara de dado.
--
-- Identificacao das pessoas e da atividade: nome exato, como em
-- treinos_camila_igor.sql. O jiu-jitsu leva o perfil do Igor junto, senao
-- o dia dele passaria a depender de uma atividade de outra pessoa.
--
-- ATENCAO ao reexecutar: este arquivo SUBSTITUI o plano ativo dos dois.
-- Qualquer edicao feita dentro do app se perde. O que NAO se perde e o
-- historico: refeicao_registros guarda nome, rotulo, kcal e proteina do
-- momento do registro, e as chaves sao `on delete set null`.
-- =====================================================================


do $$
declare
  igor   uuid := (select id from perfis where nome = 'Igor Hollanda');
  camila uuid := (select id from perfis where nome = 'Camila Cabral');
  jj     uuid := (select id from atividades
                  where nome = 'Jiu-jitsu'
                    and perfil_id = (select id from perfis where nome = 'Igor Hollanda'));
  p uuid;
  r uuid;
begin
  if igor is null or camila is null then
    raise exception 'Perfis nao encontrados: confira os nomes em perfis';
  end if;

  if exists (select 1 from planos_alimentares where perfil_id in (igor, camila)) then
    raise notice 'Substituindo o plano anterior. O historico de refeicoes fica.';
    delete from planos_alimentares where perfil_id in (igor, camila);
  end if;

  -- =============================================================== IGOR

  insert into planos_alimentares
    (perfil_id, nome, dias_jiu_jitsu, atividade_jiu_jitsu_id, observacao)
  values (
    igor, 'Júnior Cordeiro + ajustes (24/09 a 16/10/2026)', '{1,2,4}', jj,
    'Proteína permitida: frango, carnes magras, ovos e peixe grelhado. '
    'Nenhum outro fruto do mar — alergia a crustáceos, moluscos fora por '
    'precaução. Trocas: sempre pela lista de substituições de Júnior. Os '
    'dias de jiu-jitsu ainda aguardam validação dele.')
  returning id into p;

  -- 1. Pré-treino (05h45) — 90 kcal, 1 g
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Pré-treino', '05:45', 'ambos', 1) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Café preto e banana', 1, true,
   '[{"alimento":"Café preto","qtd":1,"unidade":"xícara"},
     {"alimento":"Banana prata","qtd":1,"unidade":"un"},
     {"alimento":"Água","qtd":500,"unidade":"ml"}]',
   90, 1, 'ajuste',
   '30 a 45 min antes da academia. Carboidrato rápido para render mais no treino, sobretudo na manhã seguinte ao jiu-jitsu.');

  -- 2. Café da manhã (07h45) — 590 kcal, 52 g
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Café da manhã', '07:45', 'ambos', 2) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Ovos, pão e mamão', 1, true,
   '[{"alimento":"Ovos mexidos","qtd":4,"unidade":"un"},
     {"alimento":"Pão de forma integral","qtd":50,"unidade":"g"},
     {"alimento":"Requeijão light","qtd":10,"unidade":"g"},
     {"alimento":"Mamão papaia","qtd":100,"unidade":"g"},
     {"alimento":"Whey","qtd":30,"unidade":"g"}]',
   590, 52, 'ajuste',
   'Júnior prescreve 3 ovos; o quarto ovo e o whey entram por ser a refeição pós-treino.'),
  (r, 'Ovos, cuscuz e mamão', 2, false,
   '[{"alimento":"Ovos mexidos","qtd":4,"unidade":"un"},
     {"alimento":"Cuscuz de milho","qtd":80,"unidade":"g"},
     {"alimento":"Muçarela","qtd":30,"unidade":"g"},
     {"alimento":"Mamão papaia","qtd":100,"unidade":"g"},
     {"alimento":"Whey","qtd":30,"unidade":"g"}]',
   590, 52, 'ajuste',
   'Troca de Júnior: cuscuz e muçarela no lugar do pão e do requeijão. O quarto ovo e o whey continuam sendo ajuste nosso.');

  -- 3. Almoço (13h00) — 800 kcal, 75 g
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Almoço', '13:00', 'ambos', 3) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Frango, arroz e feijão verde', 1, true,
   '[{"alimento":"Frango grelhado","qtd":200,"unidade":"g"},
     {"alimento":"Arroz branco","qtd":180,"unidade":"g"},
     {"alimento":"Feijão verde","qtd":120,"unidade":"g"},
     {"alimento":"Salada","qtd":null,"unidade":"à vontade"},
     {"alimento":"Azeite","qtd":15,"unidade":"ml"}]',
   800, 75, 'nutricionista',
   'Quarta e quinta: marmita, separada da janta da noite anterior.'),
  (r, 'Frango, arroz e batata', 2, false,
   '[{"alimento":"Frango grelhado","qtd":200,"unidade":"g"},
     {"alimento":"Arroz branco","qtd":180,"unidade":"g"},
     {"alimento":"Batata inglesa","qtd":120,"unidade":"g"},
     {"alimento":"Salada","qtd":null,"unidade":"à vontade"},
     {"alimento":"Azeite","qtd":15,"unidade":"ml"}]',
   800, 75, 'nutricionista',
   'Opção 1 de Júnior: batata no lugar do feijão.');

  -- 4. Lanche, dia normal (16h00) — 275 kcal, 31 g
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Lanche', '16:00', 'normal', 4) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Frango desfiado no pão', 1, true,
   '[{"alimento":"Frango cozido desfiado","qtd":80,"unidade":"g"},
     {"alimento":"Pão de forma integral","qtd":50,"unidade":"g"},
     {"alimento":"Requeijão light","qtd":10,"unidade":"g"},
     {"alimento":"Café descafeinado","qtd":1,"unidade":"xícara"}]',
   275, 31, 'nutricionista',
   'Inegociável: sai de casa pronto, na bolsa. Descafeinado porque a cafeína para às 14h.'),
  (r, 'Whey com pasta de amendoim', 2, false,
   '[{"alimento":"Whey","qtd":30,"unidade":"g"},
     {"alimento":"Pasta de amendoim","qtd":20,"unidade":"g"},
     {"alimento":"Farelo de aveia","qtd":30,"unidade":"g"},
     {"alimento":"Banana prata","qtd":80,"unidade":"g"}]',
   275, 31, 'nutricionista',
   'Alternativa de Júnior.');

  -- 5. Lanche, dia de jiu-jitsu (16h00) — 365 kcal, 32 g
  --    "o lanche de sempre + 1 banana": vale para as duas opções.
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Lanche', '16:00', 'jiu_jitsu', 5) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Frango desfiado no pão + banana', 1, true,
   '[{"alimento":"Frango cozido desfiado","qtd":80,"unidade":"g"},
     {"alimento":"Pão de forma integral","qtd":50,"unidade":"g"},
     {"alimento":"Requeijão light","qtd":10,"unidade":"g"},
     {"alimento":"Café descafeinado","qtd":1,"unidade":"xícara"},
     {"alimento":"Banana prata","qtd":1,"unidade":"un"}]',
   365, 32, 'ajuste',
   'Seg, ter e qui: o lanche de sempre mais uma banana. Carboidrato antecipado porque não há refeição sólida depois da aula.'),
  (r, 'Whey com pasta de amendoim + banana', 2, false,
   '[{"alimento":"Whey","qtd":30,"unidade":"g"},
     {"alimento":"Pasta de amendoim","qtd":20,"unidade":"g"},
     {"alimento":"Farelo de aveia","qtd":30,"unidade":"g"},
     {"alimento":"Banana prata","qtd":80,"unidade":"g"},
     {"alimento":"Banana prata","qtd":1,"unidade":"un"}]',
   365, 32, 'ajuste',
   'A alternativa de Júnior também vale com a banana a mais.');

  -- 6. Pré-jiu-jitsu (18h00), no lugar do jantar — 480 kcal, 37 g
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Pré-jiu-jitsu', '18:00', 'jiu_jitsu', 6) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Frango, arroz e banana', 1, true,
   '[{"alimento":"Frango grelhado","qtd":100,"unidade":"g"},
     {"alimento":"Arroz branco","qtd":180,"unidade":"g"},
     {"alimento":"Banana prata","qtd":1,"unidade":"un"}]',
   480, 37, 'ajuste',
   'No lugar do jantar. Sem salada grande, sem azeite e sem queijo: pouca gordura e pouca fibra para digerir antes do rola.'),
  (r, 'Frango, cuscuz e banana', 2, false,
   '[{"alimento":"Frango grelhado","qtd":100,"unidade":"g"},
     {"alimento":"Cuscuz de milho","qtd":140,"unidade":"g"},
     {"alimento":"Banana prata","qtd":1,"unidade":"un"}]',
   480, 37, 'ajuste',
   'Mesma refeição com cuscuz no lugar do arroz.');

  -- 7. Jantar, dia normal (19h30) — 470 kcal, 59 g
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Jantar', '19:30', 'normal', 7) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Carne magra com cuscuz', 1, true,
   '[{"alimento":"Carne magra grelhada (patinho, alcatra ou filé)","qtd":150,"unidade":"g"},
     {"alimento":"Cuscuz de milho","qtd":80,"unidade":"g"},
     {"alimento":"Creme de ricota","qtd":30,"unidade":"g"},
     {"alimento":"Salada","qtd":null,"unidade":"à vontade"}]',
   470, 59, 'nutricionista',
   'Quarta e quinta: fazer a mais e porcionar a marmita do almoço seguinte.'),
  (r, 'Ovos com cuscuz e muçarela', 2, false,
   '[{"alimento":"Ovos mexidos","qtd":3,"unidade":"un"},
     {"alimento":"Cuscuz de milho","qtd":80,"unidade":"g"},
     {"alimento":"Muçarela","qtd":30,"unidade":"g"}]',
   470, 59, 'nutricionista',
   'Opção 2 de Júnior.'),
  (r, 'Ovos com banana da terra e mamão', 3, false,
   '[{"alimento":"Ovos mexidos","qtd":3,"unidade":"un"},
     {"alimento":"Banana da terra","qtd":80,"unidade":"g"},
     {"alimento":"Mamão papaia","qtd":100,"unidade":"g"},
     {"alimento":"Whey","qtd":30,"unidade":"g"}]',
   470, 59, 'nutricionista',
   'Opção 3 de Júnior. O whey faz parte desta opção.');

  -- 8. Ceia, dia normal (21h30) — 120 kcal, 20 g
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Ceia', '21:30', 'normal', 8) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Whey em água', 1, true,
   '[{"alimento":"Whey","qtd":30,"unidade":"g"},
     {"alimento":"Água","qtd":250,"unidade":"ml"}]',
   120, 20, 'ajuste',
   'Com magnésio. Garante a proteína diária no alvo. Luz apagada às 22h.');

  -- 9. Pós-jiu-jitsu (22h15), no lugar da ceia — 0 a 120 kcal
  --    Fora da aderência: o plano diz "se não descer, pular sem culpa".
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem, obrigatoria)
  values (p, 'Pós-jiu-jitsu', '22:15', 'jiu_jitsu', 9, false) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Shake de whey', 1, true,
   '[{"alimento":"Whey","qtd":30,"unidade":"g"},
     {"alimento":"Água","qtd":300,"unidade":"ml"},
     {"alimento":"Água com uma pitada de sal","qtd":500,"unidade":"ml"}]',
   120, 20, 'ajuste',
   'No lugar da ceia, se descer. Se não descer, pular sem culpa — a água com sal fica de pé de qualquer jeito. Cama às 23h.');

  -- Metas (pagina 1: checkpoints de quarta; pagina 2: agua e totais)
  insert into metas_nutricionais (
    perfil_id, peso_alvo_kg, data_alvo, checkpoints, regra_corte,
    agua_ml_normal, agua_ml_jiu_jitsu, kcal_normal, kcal_jiu_jitsu,
    proteina_g_normal, proteina_g_jiu_jitsu)
  values (
    igor, 94.00, '2026-10-16',
    '[{"dia":"2026-09-30","min":97.0,"max":97.5},
      {"dia":"2026-10-07","min":95.8,"max":96.3},
      {"dia":"2026-10-14","min":94.8,"max":95.3},
      {"dia":"2026-10-16","min":94.3,"max":94.8}]',
    'Acima de 97,8 kg em 30/09, a meta vira 95 kg e o plano segue igual.',
    4000, 5000, 2350, 2450, 235, 215)
  -- metas_nutricionais referencia `perfis`, nao o plano: apagar o plano
  -- nao leva a meta junto. Sem isto, reexecutar quebra na chave primaria.
  on conflict (perfil_id) do update set
    peso_alvo_kg = excluded.peso_alvo_kg, data_alvo = excluded.data_alvo,
    checkpoints  = excluded.checkpoints,  regra_corte = excluded.regra_corte,
    agua_ml_normal    = excluded.agua_ml_normal,
    agua_ml_jiu_jitsu = excluded.agua_ml_jiu_jitsu,
    kcal_normal       = excluded.kcal_normal,
    kcal_jiu_jitsu    = excluded.kcal_jiu_jitsu,
    proteina_g_normal    = excluded.proteina_g_normal,
    proteina_g_jiu_jitsu = excluded.proteina_g_jiu_jitsu,
    atualizado_em = now();

  -- ============================================================= CAMILA

  insert into planos_alimentares (perfil_id, nome, dias_jiu_jitsu, observacao)
  values (
    camila, 'Prato dividido (24/09 a 16/10/2026)', '{}',
    'Mesmos horários e mesma estrutura de Igor, com as porções dela. O whey '
    'e a ceia dele não se aplicam. Proteína em todas as refeições. Água: 35 '
    'ml por kg do peso dela. Para porções exatas, o ideal é um plano próprio '
    'com nutricionista.')
  returning id into p;

  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem) values
    (p, 'Café da manhã', '07:45', 'ambos', 1),
    (p, 'Almoço',        '13:00', 'ambos', 2),
    (p, 'Lanche',        '16:00', 'ambos', 3),
    (p, 'Jantar',        '19:30', 'ambos', 4);

  -- Sem kcal de proposito: a tela esconde os numeros em vez de mostrar zero.
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota)
  select id, 'Prato dividido', 1, true, '[]', null, null, 'generico',
         case nome
           when 'Café da manhã' then 'Proteína (ovos, iogurte ou queijo), carboidrato e fruta.'
           when 'Lanche' then 'Proteína e fruta ou carboidrato leve. Inegociável: sai de casa pronto, na bolsa.'
           else 'Metade salada e legumes, um quarto proteína, um quarto carboidrato.'
         end
  from plano_refeicoes where plano_id = p;

  -- Agua: 35 ml por kg. Fica vazio ate ela informar o peso no app.
  insert into metas_nutricionais (perfil_id) values (camila)
  on conflict (perfil_id) do nothing;
end $$;

commit;
