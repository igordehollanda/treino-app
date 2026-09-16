-- =====================================================================
-- Treinos vigentes a partir de 14/09/2026 — Camila e Igor
--
-- Como ler este arquivo:
--   quem = 'C' -> so a Camila   | 'I' -> so o Igor   | null -> os dois
--   As REPETICOES nao aparecem aqui de proposito: vem da periodizacao
--   (ciclo de 4 semanas), aplicada automaticamente pelo app.
--
-- Fidelidade a prescricao: quando um exercicio aparece em posicoes ou
-- series diferentes para cada um, ele vira DUAS linhas, uma de cada.
-- Melhor duplicar uma linha do que baguncar a ordem de um treino.
--
-- A `ordem` usa dezena = posicao no treino, unidade = pessoa
-- (0 ambos, 1 Camila, 2 Igor). Assim cada um ve a sequencia certa.
--
-- Os DESCANSOS foram estimados por tipo de exercicio (composto 90s,
-- maquina 60s, isolador 45s) porque a prescricao nao os define. O Carlos
-- ajusta no app, exercicio por exercicio.
--
-- Re-executavel: apaga os treinos destes ids e recria.
-- =====================================================================

begin;

-- Limpeza: treino de exemplo e treinos anteriores destes mesmos ids.
delete from treinos where id in (
  '11111111-aaaa-4aaa-8aaa-111111111111',
  'aaaa0001-0000-4000-8000-000000000001',
  'aaaa0002-0000-4000-8000-000000000002',
  'aaaa0003-0000-4000-8000-000000000003',
  'aaaa0004-0000-4000-8000-000000000004',
  'aaaa0005-0000-4000-8000-000000000005',
  'aaaa0006-0000-4000-8000-000000000006'
);

-- ---------------------------------------------------------------------
-- 1. Periodizacao: ciclo de 4 semanas desde 14/09/2026
-- ---------------------------------------------------------------------

delete from periodizacao;
insert into periodizacao (semana, reps, observacao) values
  (1, '8-10',  null),
  (2, '8-10',  null),
  (3, '5-6',   'Semana pesada: carga alta, menos repeticoes'),
  (4, '12-15', 'Semana leve: volume alto, carga menor');

insert into config (ciclo_inicio) values ('2026-09-14')
on conflict (id) do update set ciclo_inicio = excluded.ciclo_inicio,
                               atualizado_em = now();

-- ---------------------------------------------------------------------
-- 2. Catalogo de exercicios, na nomenclatura do Carlos
-- ---------------------------------------------------------------------

-- Fora os que ninguem usa, para a busca do app ficar limpa.
delete from exercicios
where id not in (select exercicio_id from treino_exercicios where exercicio_id is not null)
  and id not in (select exercicio_id from series_registros where exercicio_id is not null);

insert into exercicios (nome, grupo_muscular) values
  ('Agachamento Smith',                 'Quadriceps'),
  ('Agachamento cálice',                'Quadriceps'),
  ('Leg 45',                            'Quadriceps'),
  ('Leg 45 unilateral',                 'Quadriceps'),
  ('Leg horizontal',                    'Quadriceps'),
  ('Cadeira extensora',                 'Quadriceps'),
  ('Cadeira extensora unilateral',      'Quadriceps'),
  ('Búlgaro',                           'Quadriceps'),
  ('Afundo isométrico',                 'Quadriceps'),
  ('Elevação pélvica',                  'Glúteos'),
  ('Abdutora',                          'Glúteos'),
  ('Adutora',                           'Adutores'),
  ('Panturrilha',                       'Panturrilha'),
  ('Levantamento terra sumô',           'Posterior'),
  ('Flexora unilateral',                'Posterior'),
  ('Cadeira flexora',                   'Posterior'),
  ('Cadeira flexora unilateral',        'Posterior'),
  ('Mesa flexora',                      'Posterior'),
  ('Desenvolvimento com halter',        'Ombro'),
  ('Desenvolvimento aberto máquina',    'Ombro'),
  ('Elevação lateral com halter',       'Ombro'),
  ('Elevação lateral na polia',         'Ombro'),
  ('Puxada alta pegada neutra',         'Costas'),
  ('Puxada alta aberta',                'Costas'),
  ('Remada fechada máquina',            'Costas'),
  ('Remada unilateral com halter',      'Costas'),
  ('Fly inverso',                       'Costas'),
  ('Pull down',                         'Costas'),
  ('Fly',                               'Peito'),
  ('Supino vertical máquina',           'Peito'),
  ('Supino inclinado com halter',       'Peito'),
  ('Tríceps polia barra V',             'Tríceps'),
  ('Tríceps testa unilateral na polia', 'Tríceps'),
  ('Rosca Scott máquina',               'Bíceps'),
  ('Rosca direta com barra',            'Bíceps')
on conflict (nome) do update set grupo_muscular = excluded.grupo_muscular;

-- ---------------------------------------------------------------------
-- 3. Os treinos
-- ---------------------------------------------------------------------

insert into treinos (id, nome, ordem, observacoes) values
  ('aaaa0001-0000-4000-8000-000000000001', 'A — Quadríceps e Glúteos',      1, null),
  ('aaaa0002-0000-4000-8000-000000000002', 'B — Ombro, Costas e Tríceps',   2, 'O Igor inclui peito: fly e supino vertical.'),
  ('aaaa0003-0000-4000-8000-000000000003', 'C — Posterior e Glúteos',       3, null),
  ('aaaa0004-0000-4000-8000-000000000004', 'D — Costas e Bíceps',           4, null),
  ('aaaa0005-0000-4000-8000-000000000005', 'E — Inferior e Ombro',          5, 'Treino E da Camila.'),
  ('aaaa0006-0000-4000-8000-000000000006', 'E — Peito, Ombro e Tríceps',    5, 'Treino E do Igor.');

-- A a D sao dos dois; cada E e de uma pessoa so.
insert into treino_alunos (treino_id, perfil_id)
select t.id, p.id
from treinos t, perfis p
where p.papel = 'aluno'
  and t.id in ('aaaa0001-0000-4000-8000-000000000001',
               'aaaa0002-0000-4000-8000-000000000002',
               'aaaa0003-0000-4000-8000-000000000003',
               'aaaa0004-0000-4000-8000-000000000004');

insert into treino_alunos (treino_id, perfil_id)
select 'aaaa0005-0000-4000-8000-000000000005', id from perfis where nome = 'Camila Cabral';

insert into treino_alunos (treino_id, perfil_id)
select 'aaaa0006-0000-4000-8000-000000000006', id from perfis where nome = 'Igor Hollanda';

-- ---------------------------------------------------------------------
-- 4. Exercicios de cada treino
-- ---------------------------------------------------------------------

-- A — Quadriceps e Gluteos  (7 exercicios para cada um)
insert into treino_exercicios (treino_id, exercicio_id, perfil_id, ordem, series, descanso_seg, observacao)
select 'aaaa0001-0000-4000-8000-000000000001', e.id,
       case x.quem when 'C' then (select id from perfis where nome = 'Camila Cabral')
                   when 'I' then (select id from perfis where nome = 'Igor Hollanda') end,
       x.ordem, x.series, x.descanso, x.obs
from (values
  ('Agachamento Smith',            'C',       11, 3, 90, null::text),
  ('Agachamento cálice',           'I',       12, 3, 90, null),
  ('Leg 45',                       'C',       21, 3, 90, null),
  ('Leg 45 unilateral',            'I',       22, 3, 90, null),
  ('Cadeira extensora',            'C',       31, 3, 60, null),
  ('Cadeira extensora unilateral', 'I',       32, 4, 60, 'Cadência excêntrica'),
  ('Búlgaro',                      'C',       41, 3, 90, null),
  ('Afundo isométrico',            'I',       42, 3, 90, null),
  ('Elevação pélvica',             null::text,50, 3, 60, null),
  ('Abdutora',                     null,      60, 3, 45, null),
  ('Adutora',                      'I',       62, 3, 45, 'Bi-set com a abdutora'),
  ('Panturrilha',                  'C',       71, 4, 45, null),
  ('Panturrilha',                  'I',       72, 5, 45, null)
) as x(nome, quem, ordem, series, descanso, obs)
join exercicios e on e.nome = x.nome;

-- B — Ombro, Costas e Triceps  (7 para cada um)
insert into treino_exercicios (treino_id, exercicio_id, perfil_id, ordem, series, descanso_seg, observacao)
select 'aaaa0002-0000-4000-8000-000000000002', e.id,
       case x.quem when 'C' then (select id from perfis where nome = 'Camila Cabral')
                   when 'I' then (select id from perfis where nome = 'Igor Hollanda') end,
       x.ordem, x.series, x.descanso, x.obs
from (values
  ('Desenvolvimento com halter',        null::text, 10, 3, 90, null::text),
  ('Puxada alta pegada neutra',         'C',        21, 2, 90, null),
  ('Elevação lateral com halter',       'I',        22, 3, 45, null),
  ('Remada fechada máquina',            'C',        31, 2, 60, null),
  ('Fly',                               'I',        32, 4, 60, null),
  ('Elevação lateral com halter',       'C',        41, 3, 45, null),
  ('Supino vertical máquina',           'I',        42, 3, 60, null),
  ('Fly inverso',                       'C',        51, 2, 45, null),
  ('Puxada alta pegada neutra',         'I',        52, 3, 90, null),
  ('Tríceps polia barra V',             null,       60, 4, 45, null),
  ('Tríceps testa unilateral na polia', 'C',        71, 3, 45, null),
  ('Tríceps testa unilateral na polia', 'I',        72, 4, 45, null)
) as x(nome, quem, ordem, series, descanso, obs)
join exercicios e on e.nome = x.nome;

-- C — Posterior e Gluteos  (Camila 5, Igor 7)
insert into treino_exercicios (treino_id, exercicio_id, perfil_id, ordem, series, descanso_seg, observacao)
select 'aaaa0003-0000-4000-8000-000000000003', e.id,
       case x.quem when 'C' then (select id from perfis where nome = 'Camila Cabral')
                   when 'I' then (select id from perfis where nome = 'Igor Hollanda') end,
       x.ordem, x.series, x.descanso, x.obs
from (values
  ('Levantamento terra sumô',     null::text, 10, 3, 90, null::text),
  ('Flexora unilateral',          'C',        21, 3, 60, null),
  ('Flexora unilateral',          'I',        22, 4, 60, null),
  ('Cadeira flexora',             'C',        31, 3, 60, null),
  ('Cadeira flexora unilateral',  'I',        32, 3, 60, null),
  ('Mesa flexora',                'C',        41, 3, 60, null),
  ('Mesa flexora',                'I',        42, 2, 60, null),
  ('Abdutora',                    null,       50, 3, 45, null),
  ('Adutora',                     'I',        62, 3, 45, null),
  ('Panturrilha',                 'I',        72, 5, 45, null)
) as x(nome, quem, ordem, series, descanso, obs)
join exercicios e on e.nome = x.nome;

-- D — Costas e Biceps  (7 para cada um; posicao 5 e bi-set)
insert into treino_exercicios (treino_id, exercicio_id, perfil_id, ordem, series, descanso_seg, observacao)
select 'aaaa0004-0000-4000-8000-000000000004', e.id,
       case x.quem when 'C' then (select id from perfis where nome = 'Camila Cabral')
                   when 'I' then (select id from perfis where nome = 'Igor Hollanda') end,
       x.ordem, x.series, x.descanso, x.obs
from (values
  ('Remada fechada máquina',       null::text, 10, 3, 60, null::text),
  ('Puxada alta aberta',           null,       20, 3, 90, null),
  ('Remada unilateral com halter', null,       30, 3, 60, null),
  ('Fly inverso',                  null,       40, 3, 45, null),
  ('Pull down',                    'C',        51, 2, 45, 'Bi-set com a rosca Scott'),
  ('Pull down',                    'I',        52, 3, 45, 'Bi-set com a rosca Scott'),
  ('Rosca Scott máquina',          null,       55, 4, 45, 'Bi-set com o pull down'),
  ('Rosca direta com barra',       'C',        61, 3, 45, null),
  ('Rosca direta com barra',       'I',        62, 4, 45, null)
) as x(nome, quem, ordem, series, descanso, obs)
join exercicios e on e.nome = x.nome;

-- E da Camila — Inferior e Ombro  (8 exercicios)
insert into treino_exercicios (treino_id, exercicio_id, perfil_id, ordem, series, descanso_seg, observacao)
select 'aaaa0005-0000-4000-8000-000000000005', e.id, null, x.ordem, x.series, x.descanso, x.obs
from (values
  ('Cadeira extensora',           10, 3, 60, null::text),
  ('Elevação pélvica',            20, 3, 60, null),
  ('Leg horizontal',              30, 3, 90, null),
  ('Abdutora',                    40, 3, 45, null),
  ('Cadeira flexora',             50, 3, 60, null),
  ('Desenvolvimento com halter',  60, 3, 90, null),
  ('Elevação lateral com halter', 70, 3, 45, null),
  ('Tríceps polia barra V',       80, 3, 45, null)
) as x(nome, ordem, series, descanso, obs)
join exercicios e on e.nome = x.nome;

-- E do Igor — Peito, Ombro e Triceps  (7 exercicios)
insert into treino_exercicios (treino_id, exercicio_id, perfil_id, ordem, series, descanso_seg, observacao)
select 'aaaa0006-0000-4000-8000-000000000006', e.id, null, x.ordem, x.series, x.descanso, x.obs
from (values
  ('Supino inclinado com halter',       10, 3, 90, null::text),
  ('Fly',                               20, 3, 60, 'Drop set na última série'),
  ('Supino vertical máquina',           30, 3, 60, null),
  ('Desenvolvimento aberto máquina',    40, 3, 60, null),
  ('Elevação lateral na polia',         50, 3, 45, null),
  ('Tríceps polia barra V',             60, 4, 45, null),
  ('Tríceps testa unilateral na polia', 70, 3, 45, null)
) as x(nome, ordem, series, descanso, obs)
join exercicios e on e.nome = x.nome;

commit;

-- ---------------------------------------------------------------------
-- 5. Conferencia — quantos exercicios cada um ve em cada treino
-- ---------------------------------------------------------------------
select t.nome as treino,
       p.nome as aluno,
       count(*) filter (
         where te.perfil_id is null or te.perfil_id = p.id
       ) as exercicios,
       sum(te.series) filter (
         where te.perfil_id is null or te.perfil_id = p.id
       ) as series
from treinos t
join treino_alunos ta on ta.treino_id = t.id
join perfis p        on p.id = ta.perfil_id
join treino_exercicios te on te.treino_id = t.id
group by t.ordem, t.nome, p.nome
order by t.ordem, p.nome;

-- ---------------------------------------------------------------------
-- 6. Bi-sets  (requer a migration 0005)
-- ---------------------------------------------------------------------
-- A: abdutora + adutora — so o Igor faz os dois, entao para a Camila o
--    grupo tem um membro so e a tela o trata como exercicio normal.
update treino_exercicios set grupo = 1
where treino_id = 'aaaa0001-0000-4000-8000-000000000001'
  and exercicio_id in (select id from exercicios where nome in ('Abdutora', 'Adutora'));

-- D: pull down + rosca Scott, para os dois.
update treino_exercicios set grupo = 1
where treino_id = 'aaaa0004-0000-4000-8000-000000000004'
  and exercicio_id in (select id from exercicios where nome in ('Pull down', 'Rosca Scott máquina'));

-- A observacao textual vira redundante: a tela ja mostra que e bi-set.
update treino_exercicios set observacao = null
where grupo is not null and observacao like 'Bi-set%';
