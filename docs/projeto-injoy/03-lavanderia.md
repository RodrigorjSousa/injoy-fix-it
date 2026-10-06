# PROJETO INJOY — Lavanderia

Leia antes o `00-CONTEXTO-GERAL.md`.

## Contexto do negócio
- A lavanderia hoje é **terceirizada**: cerca de R$ 4.500/mês somando as duas unidades na baixa
  temporada, e cerca de 30% a mais na alta.
- Rodrigo avalia ter **lavanderia própria**; o custo ainda precisa ser estudado.

## Onde está no código
- Relatório do gestor: `src/routes/_authenticated/relatorio-operacoes.tsx` (menu "LAVANDERIA",
  `requireGestor()`, cerca de 1.000 linhas).
- Lançamento pelas camareiras: `src/components/camareiras/laundry-modal.tsx`.
- Tabelas existentes: `laundry_logs`, `laundry_items_directory` (catálogo de peças),
  `laundry_batches` (lotes), `laundry_debt` (peças devidas pela lavanderia) e
  `extra_tasks_directory`.
- O Financeiro tem a categoria de custo de lavanderia (`src/components/financeiro/*`).

## Estado atual
- O módulo existe e foi feito no Lovable antes desta fase. Ainda não foi revisado por Claude:
  **comece lendo o código e o banco e mostre ao Rodrigo o que já existe** antes de propor mudanças.

## Ideias e pendências
- (Rodrigo vai trazer os objetivos nesta conversa: por exemplo, controle de envio e retorno,
  custo por quarto ou estudo da lavanderia própria.)
