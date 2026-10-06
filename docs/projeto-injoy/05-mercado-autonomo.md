# PROJETO INJOY — Mercado autônomo no hall

Leia antes o `00-CONTEXTO-GERAL.md`.

## Objetivo
Um mercadinho autônomo no hall para os hóspedes: eles pegam o produto, pagam ou lançam na conta do
quarto sozinhos, e o estoque e o financeiro se atualizam.

## O que já existe e pode ser reaproveitado
- **Frigobar e venda de bebidas:** `src/routes/_authenticated/frigobar.tsx` (dashboard, catálogo e
  histórico) e `src/components/recepcao/venda-bebidas-modal.tsx`.
  - Tabelas: `beverage_catalog` (produtos por unidade) e `beverage_sales`.
- **PDV no Cloudbeds:** `src/lib/cloudbeds-pdv.functions.ts`:
  - `syncCloudbedsItems`: catálogo e preços vindos do Cloudbeds;
  - lançamento do débito na conta do quarto (folio);
  - consulta e reposição de estoque (só gestor).
- **Estoque:** `src/routes/_authenticated/estoque-geral.tsx` e `almoxarifado.tsx`.
- **Pagamentos:** `reservation-payment.functions.ts` (Cloudbeds `/postPayment`).
- **Financeiro:** `src/components/financeiro/*`, para receita e custo.

## Pontos de atenção
- O hóspede compra sem funcionário por perto. Será preciso:
  - identificar o hóspede (quarto mais código ou reserva);
  - definir como ele paga (conta do quarto, Pix ou cartão);
  - controlar furto e divergência de estoque.
- Pode compartilhar o mesmo aparelho e o mesmo modo quiosque do **Totem** (`04-totem.md`).

## Estado atual
- Não iniciado. As peças acima existem.
