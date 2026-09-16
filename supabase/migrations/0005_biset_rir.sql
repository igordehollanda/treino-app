-- =====================================================================
-- Bi-set e RIR
-- =====================================================================

-- Bi-set / tri-set: exercicios do MESMO treino com o mesmo `grupo` sao
-- executados alternando as series, com um descanso so no fim da rodada.
-- null = exercicio solo (o caso normal).
--
-- Numero, e nao booleano, porque um treino pode ter mais de um conjunto.
alter table treino_exercicios add column grupo smallint;

comment on column treino_exercicios.grupo is
  'Exercicios do mesmo treino com o mesmo grupo sao um bi-set; null = solo';

create index on treino_exercicios (treino_id, grupo);

-- RIR: repeticoes em reserva ao encerrar a serie.
--   0    = foi ate a falha
--   1..9 = sobraram N repeticoes
--   null = nao informado (nao e o mesmo que zero)
alter table series_registros add column rir smallint
  check (rir is null or (rir >= 0 and rir <= 9));

comment on column series_registros.rir is
  '0 = falha; N = repeticoes em reserva; null = nao informado';
