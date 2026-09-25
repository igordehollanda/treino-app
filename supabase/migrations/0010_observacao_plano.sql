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
