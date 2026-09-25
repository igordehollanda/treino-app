-- =====================================================================
-- Plano alimentar — Igor e Camila
-- Dados, nao schema. Rodar depois de 0009_nutricao.sql.
--
-- Plano do Igor: base do nutricionista Junior Cordeiro com os ajustes do
-- ciclo 24/09 a 16/10/2026. Opcoes com origem 'ajuste' ainda aguardam a
-- validacao dele. Kcal e proteina pela Tabela TACO, pesos do alimento
-- pronto.
--
-- Plano da Camila: generico de proposito. Ela nao tem prescricao; inventar
-- numero de caloria para ela seria mentira com cara de dado. As refeicoes
-- existem so para o registro do dia funcionar igual para os dois.
--
-- AJUSTAR resolvidos:
--
-- 1. Identificacao das pessoas: nome exato, como em treinos_camila_igor.sql
--    ('Igor Hollanda', 'Camila Cabral'). O `ilike 'igor%'` do rascunho
--    pegaria qualquer perfil futuro que comecasse igual, e um `limit 1`
--    silencioso e pior que um erro.
--
-- 2. Identificacao do jiu-jitsu: em 0007 a atividade nasce como
--    nome = 'Jiu-jitsu' E perfil_id do Igor (a Camila tem 'Cardio'). O
--    filtro leva o perfil junto, senao o dia do Igor passaria a depender
--    de uma atividade de outra pessoa.
--
-- 3. `dias_jiu_jitsu = '{1,2,4}'` continua valendo: segunda, terca e
--    quinta tem o mesmo numero nas duas convencoes. Elas so divergem no
--    domingo, e 0009 fixou a do JS (0 = domingo).
--
-- Re-executavel: se ja existe plano ativo para um dos dois, nao faz nada.
-- =====================================================================

begin;

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
    raise exception 'Perfis não encontrados: ajustar a identificação no topo do arquivo';
  end if;

  -- Rodar duas vezes não duplica: se já existe plano ativo, não faz nada.
  if exists (select 1 from planos_alimentares where perfil_id in (igor, camila) and ativo) then
    raise notice 'Já existe plano ativo; seed ignorado';
    return;
  end if;

  -- =============================================================== IGOR

  insert into planos_alimentares (perfil_id, nome, dias_jiu_jitsu, atividade_jiu_jitsu_id)
  values (igor, 'Júnior Cordeiro + ajustes (24/09 a 16/10/2026)', '{1,2,4}', jj)
  returning id into p;

  -- 1. Pré-treino
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Pré-treino', '05:45', 'ambos', 1) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Café preto + banana', 1, true,
   '[{"alimento":"Café preto","qtd":1,"unidade":"xícara"},{"alimento":"Banana prata","qtd":1,"unidade":"un"},{"alimento":"Água","qtd":500,"unidade":"ml"}]',
   90, 1, 'ajuste', '30 a 45 min antes da academia');

  -- 2. Café da manhã
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Café da manhã', '07:45', 'ambos', 2) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Opção 1 de Júnior + ajuste', 1, true,
   '[{"alimento":"Ovos mexidos","qtd":4,"unidade":"un"},{"alimento":"Pão de forma integral","qtd":50,"unidade":"g"},{"alimento":"Requeijão light","qtd":10,"unidade":"g"},{"alimento":"Mamão papaia","qtd":100,"unidade":"g"},{"alimento":"Whey","qtd":30,"unidade":"g"}]',
   590, 52, 'ajuste', 'Júnior prescreve 3 ovos; +1 ovo e o whey por ser refeição pós-treino'),
  (r, 'Opção 2 de Júnior + ajuste', 2, false,
   '[{"alimento":"Ovos mexidos","qtd":4,"unidade":"un"},{"alimento":"Cuscuz de milho","qtd":80,"unidade":"g"},{"alimento":"Muçarela","qtd":30,"unidade":"g"},{"alimento":"Mamão papaia","qtd":100,"unidade":"g"},{"alimento":"Whey","qtd":30,"unidade":"g"}]',
   640, 56, 'ajuste', 'Júnior prescreve 3 ovos; +1 ovo e o whey por ser refeição pós-treino'),
  (r, 'Opção 3 de Júnior', 3, false,
   '[{"alimento":"Whey","qtd":30,"unidade":"g"},{"alimento":"Pasta de amendoim","qtd":20,"unidade":"g"},{"alimento":"Farelo de aveia","qtd":30,"unidade":"g"},{"alimento":"Banana prata","qtd":80,"unidade":"g"}]',
   390, 31, 'nutricionista', null);

  -- 3. Almoço
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Almoço', '13:00', 'ambos', 3) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Opção 2 de Júnior', 1, true,
   '[{"alimento":"Frango grelhado","qtd":200,"unidade":"g"},{"alimento":"Arroz branco","qtd":180,"unidade":"g"},{"alimento":"Feijão verde","qtd":120,"unidade":"g"},{"alimento":"Salada","qtd":null,"unidade":"à vontade"},{"alimento":"Azeite","qtd":15,"unidade":"ml"}]',
   800, 75, 'nutricionista', 'Quarta e quinta: marmita separada da janta da noite anterior'),
  (r, 'Opção 1 de Júnior', 2, false,
   '[{"alimento":"Frango grelhado","qtd":200,"unidade":"g"},{"alimento":"Arroz branco","qtd":180,"unidade":"g"},{"alimento":"Batata inglesa","qtd":120,"unidade":"g"},{"alimento":"Salada","qtd":null,"unidade":"à vontade"},{"alimento":"Azeite","qtd":15,"unidade":"ml"}]',
   770, 70, 'nutricionista', null);

  -- 4. Lanche (dia normal)
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Lanche', '16:00', 'normal', 4) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Opção 3 de Júnior', 1, true,
   '[{"alimento":"Frango cozido desfiado","qtd":80,"unidade":"g"},{"alimento":"Pão de forma integral","qtd":50,"unidade":"g"},{"alimento":"Requeijão light","qtd":10,"unidade":"g"},{"alimento":"Café descafeinado","qtd":1,"unidade":"xícara"}]',
   275, 31, 'nutricionista', 'Café descafeinado: cafeína só até 14h'),
  (r, 'Opção 1 de Júnior', 2, false,
   '[{"alimento":"Leite em pó desnatado","qtd":30,"unidade":"g"},{"alimento":"Farelo de aveia","qtd":30,"unidade":"g"},{"alimento":"Banana prata","qtd":160,"unidade":"g"}]',
   340, 18, 'nutricionista', null),
  (r, 'Opção 2 de Júnior', 3, false,
   '[{"alimento":"Iogurte natural integral","qtd":200,"unidade":"ml"},{"alimento":"Farelo de aveia","qtd":30,"unidade":"g"},{"alimento":"Mel","qtd":10,"unidade":"g"},{"alimento":"Banana prata","qtd":80,"unidade":"g"}]',
   285, 14, 'nutricionista', null);

  -- 5. Lanche (dia de jiu-jitsu)
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Lanche', '16:00', 'jiu_jitsu', 5) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Opção 3 de Júnior + banana', 1, true,
   '[{"alimento":"Frango cozido desfiado","qtd":80,"unidade":"g"},{"alimento":"Pão de forma integral","qtd":50,"unidade":"g"},{"alimento":"Requeijão light","qtd":10,"unidade":"g"},{"alimento":"Banana prata","qtd":1,"unidade":"un"}]',
   365, 32, 'ajuste', 'Carboidrato antecipado porque não há refeição sólida depois da aula'),
  (r, 'Opção 1 de Júnior', 2, false,
   '[{"alimento":"Leite em pó desnatado","qtd":30,"unidade":"g"},{"alimento":"Farelo de aveia","qtd":30,"unidade":"g"},{"alimento":"Banana prata","qtd":160,"unidade":"g"}]',
   340, 18, 'nutricionista', null);

  -- 6. Pré-jiu-jitsu (no lugar do jantar)
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Pré-jiu-jitsu', '18:00', 'jiu_jitsu', 6) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Frango + arroz + banana', 1, true,
   '[{"alimento":"Frango grelhado","qtd":100,"unidade":"g"},{"alimento":"Arroz branco","qtd":180,"unidade":"g"},{"alimento":"Banana prata","qtd":1,"unidade":"un"}]',
   480, 37, 'ajuste', 'Sem salada grande, azeite ou queijo: pouca gordura e fibra antes do rola'),
  (r, 'Frango + cuscuz + banana', 2, false,
   '[{"alimento":"Frango grelhado","qtd":100,"unidade":"g"},{"alimento":"Cuscuz de milho","qtd":140,"unidade":"g"},{"alimento":"Banana prata","qtd":1,"unidade":"un"}]',
   410, 36, 'ajuste', 'Sem salada grande, azeite ou queijo: pouca gordura e fibra antes do rola');

  -- 7. Jantar (dia normal)
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Jantar', '19:30', 'normal', 7) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Opção 1 de Júnior', 1, true,
   '[{"alimento":"Carne magra grelhada (patinho, alcatra, filé)","qtd":150,"unidade":"g"},{"alimento":"Cuscuz de milho","qtd":80,"unidade":"g"},{"alimento":"Creme de ricota","qtd":30,"unidade":"g"},{"alimento":"Salada","qtd":null,"unidade":"à vontade"}]',
   470, 59, 'nutricionista', null),
  (r, 'Opção 2 de Júnior', 2, false,
   '[{"alimento":"Ovos mexidos","qtd":3,"unidade":"un"},{"alimento":"Cuscuz de milho","qtd":80,"unidade":"g"},{"alimento":"Muçarela","qtd":30,"unidade":"g"}]',
   410, 29, 'nutricionista', null),
  (r, 'Opção 3 de Júnior', 3, false,
   '[{"alimento":"Ovos mexidos","qtd":3,"unidade":"un"},{"alimento":"Banana da terra","qtd":80,"unidade":"g"},{"alimento":"Mamão papaia","qtd":100,"unidade":"g"},{"alimento":"Whey","qtd":30,"unidade":"g"}]',
   480, 41, 'nutricionista', 'Whey obrigatório nesta opção');

  -- 8. Ceia (dia normal)
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem)
  values (p, 'Ceia', '21:30', 'normal', 8) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Whey', 1, true,
   '[{"alimento":"Whey","qtd":30,"unidade":"g"},{"alimento":"Água","qtd":250,"unidade":"ml"}]',
   120, 20, 'ajuste', 'Com magnésio; luz apagada às 22h');

  -- 9. Pós-jiu-jitsu (opcional: não entra na aderência)
  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem, obrigatoria)
  values (p, 'Pós-jiu-jitsu', '22:15', 'jiu_jitsu', 9, false) returning id into r;
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota) values
  (r, 'Shake de whey', 1, true,
   '[{"alimento":"Whey","qtd":30,"unidade":"g"},{"alimento":"Água","qtd":300,"unidade":"ml"},{"alimento":"Água com pitada de sal","qtd":500,"unidade":"ml"}]',
   120, 20, 'ajuste', 'Se não descer, pular sem culpa');

  insert into metas_nutricionais (
    perfil_id, peso_alvo_kg, data_alvo, checkpoints, regra_corte,
    agua_ml_normal, agua_ml_jiu_jitsu, kcal_normal, kcal_jiu_jitsu, proteina_g_normal, proteina_g_jiu_jitsu)
  values (
    igor, 94.00, '2026-10-16',
    '[{"dia":"2026-09-30","min":97.0,"max":97.5},{"dia":"2026-10-07","min":95.8,"max":96.3},{"dia":"2026-10-14","min":94.8,"max":95.3},{"dia":"2026-10-16","min":94.3,"max":94.8}]',
    'Acima de 97,8 kg em 30/09, a meta passa a 95,0 kg e o plano segue igual',
    4000, 5000, 2350, 2450, 235, 215);

  -- =============================================================== CAMILA

  insert into planos_alimentares (perfil_id, nome, dias_jiu_jitsu)
  values (camila, 'Plano genérico (prato dividido)', '{}')
  returning id into p;

  insert into plano_refeicoes (plano_id, nome, horario, tipo_dia, ordem) values
    (p, 'Café da manhã', '07:45', 'ambos', 1),
    (p, 'Almoço', '13:00', 'ambos', 2),
    (p, 'Lanche', '16:00', 'ambos', 3),
    (p, 'Jantar', '19:30', 'ambos', 4);

  -- Uma opção genérica por refeição, sem kcal: sem plano individual não há número honesto a mostrar.
  insert into plano_opcoes (refeicao_id, rotulo, ordem, padrao, itens, kcal, proteina_g, origem, nota)
  select id, 'Prato dividido', 1, true, '[]', null, null, 'generico',
         case nome
           when 'Café da manhã' then 'Proteína (ovos, iogurte ou queijo) + carboidrato + fruta'
           when 'Lanche' then 'Proteína + fruta ou carboidrato leve'
           else 'Metade salada e legumes, um quarto proteína, um quarto carboidrato'
         end
  from plano_refeicoes where plano_id = p;

  -- Água: 35 ml por kg do peso dela. Fica vazio até ela informar o peso no app.
  insert into metas_nutricionais (perfil_id) values (camila);
end $$;

commit;
