-- =====================================================================
-- Treino de exemplo, para testar o app antes do personal montar o real.
--
-- Cria "Treino A - Exemplo" atribuido aos dois alunos, com quatro
-- exercicios compartilhados e um exclusivo de uma das alunas — assim da
-- para ver o mecanismo de variacao funcionando: um aluno enxerga 4
-- exercicios, a outra 5.
--
-- Rode no SQL Editor. Para remover depois:
--   delete from treinos where id = '11111111-aaaa-4aaa-8aaa-111111111111';
-- (os exercicios e as atribuicoes saem junto, por cascade)
-- =====================================================================

insert into treinos (id, nome, ordem, observacoes)
values ('11111111-aaaa-4aaa-8aaa-111111111111', 'Treino A - Exemplo', 0,
        'Exemplo para testar. O personal pode editar ou apagar.')
on conflict (id) do nothing;

-- Atribui a todos os alunos cadastrados.
insert into treino_alunos (treino_id, perfil_id)
select '11111111-aaaa-4aaa-8aaa-111111111111', id from perfis where papel = 'aluno'
on conflict do nothing;

-- Exercicios compartilhados: perfil_id NULL = valem para os dois.
insert into treino_exercicios (treino_id, exercicio_id, perfil_id, ordem, series, reps, descanso_seg)
select '11111111-aaaa-4aaa-8aaa-111111111111', e.id, null, x.ordem, x.series, x.reps, x.descanso
from (values
  ('Supino reto com barra', 0, 4, '8-10',  90),
  ('Puxada frontal',        1, 4, '10-12', 90),
  ('Leg press',             2, 3, '12',    60),
  ('Rosca direta',          3, 3, '12',    45)
) as x(nome, ordem, series, reps, descanso)
join exercicios e on e.nome = x.nome;

-- Variacao exclusiva: troque o nome para o da aluna que fara este.
insert into treino_exercicios (treino_id, exercicio_id, perfil_id, ordem, series, reps, descanso_seg)
select '11111111-aaaa-4aaa-8aaa-111111111111', e.id, p.id, 4, 3, '15', 45
from exercicios e, perfis p
where e.nome = 'Elevacao pelvica' and p.nome = 'NOME DA ALUNA';
