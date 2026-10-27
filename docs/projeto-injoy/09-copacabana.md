# PROJETO INJOY — Copacabana (viabilidade)

Leia antes o `00-CONTEXTO-GERAL.md`. Nesta frente é **análise**: não mudar código, banco nem Cloudbeds sem o
Rodrigo pedir. Ler dados pode.

## Objetivo
Decidir se vale gerir apartamentos em Copacabana pelo sistema INJOY e, se sim, em que condições.

## O negócio (27/10/2026)
- Prédio **B.Rio Leopoldo Miguez** (Rua Leopoldo Miguez, 10, Copacabana, perto do Posto 4; 24 unidades).
- Aptos **201** (studio coluna 01, 34,51 m²), **801** (studio coluna 01, 34,51 m²) e **802** (double suites,
  69,33 m², alugado como duas unidades) → **4 unidades vendáveis** (a confirmar).
- Proprietário entrega mobiliado e com enxoval completo. Rodrigo recebe **12% do lucro líquido** (todas as
  despesas descontadas). O proprietário já tem proposta de outra empresa de gestão.

## Estudo
- Documento: "INJOY Copacabana — B.Rio Leopoldo Miguez: viabilidade da gestão" (Claude Docs).
- Base real (app, 27/10/2026): Ipanema diária média R$ 552, Botafogo R$ 348 (12 meses); ocupação de outubro 66%
  nas duas; receita por quarto/mês fev–set: Ipanema R$ 10.564, Botafogo R$ 6.795.
- Cenários (estimativa, por mês, 4 unidades): receita R$ 28.090 / 41.101 / 54.720; lucro líquido
  R$ 11.823 / 21.234 / 31.109; 12% do Rodrigo R$ 1.419 / 2.548 / 3.733 (5–7% da receita bruta).
- Recomendação (revista após a proposta da Lobie): ver "Estado atual".

## Lacunas encontradas no app
- Rendimento por unidade: nov/2025–jan/2026 incompletos (Réveillon e verão sem dado real). Fevereiro talvez também.
- Financeiro: só há despesas de outubro/2026 (freelancers, VA, VT); sem energia, água, lavanderia ou comissões.

## Prontidão do app para uma 3ª unidade (só levantamento)
- "Botafogo | Ipanema" fixo em 141 arquivos (393 ocorrências) e em 50 migrações com
  `CHECK (unidade IN ('Botafogo','Ipanema'))`; `type Unidade` repetido em 4 arquivos.
- Chaves por unidade: `CLOUDBEDS_API_KEY_<UNIDADE>`, `STRIPE_KEY_<UNIDADE>`; função `tuya-password`.
- Ordem sugerida: banco → lista única de unidades/seletor → Cloudbeds → rendimento/financeiro/prestação de contas
  → escala, previsão de carga, lavanderia → ponto/totem só se necessário. Estimativa: 3 a 5 PRs.

## Proposta concorrente (Lobie)
- 12% do rendimento líquido (depois de condomínio, energia, IPTU, OTAs e impostos). Lobie fornece enxoval, faz
  limpeza e manutenção por conta dela, paga as contas do imóvel, tem app com check-in online/mobile key e permite
  rescisão a qualquer momento sem multa (exceto no "modelo garantido", não mostrado).
- Projeção da Lobie: diária R$ 551 (studio) / R$ 1.102 (double), **85% de ocupação**, 30 dias, 16,5% de OTAs e
  impostos → R$ 8.765,20 por studio e R$ 18.069,53 pela double ao proprietário (R$ 35.600/mês nas 3 unidades);
  taxa Lobie R$ 4.855/mês. Contas conferidas.
- Mesmo cálculo da Lobie com 65% e R$ 520: proprietário R$ 24.106/mês, taxa R$ 3.287/mês.
- INJOY provável (mesmos 12%, taxa de limpeza paga pelo hóspede): Rodrigo R$ 2.887/mês, proprietário R$ 21.170/mês
  (inclui cartão 2,5%, imposto 6% e manutenção/amenidades, que a Lobie não mostra).

## Decisões
- 27/10/2026 (Rodrigo): o 802 vira duas unidades (4 vendáveis); entrega do prédio em 16/11/2026; faturamento pelo
  CNPJ do proprietário.

## Estado atual
- 27/10/2026: análise e comparação com a Lobie entregues no documento. Recomendação: entrar com os mesmos 12%, sem
  mínimo, taxa de limpeza paga pelo hóspede, manutenção (material) pelo imóvel, saída com aviso de 30 dias,
  convenção do condomínio confirmada e acordo com o conselho da INJOY.
- Pendente: regime tributário do CNPJ do proprietário, convenção do condomínio, "modelo garantido" da Lobie,
  atualizar 12 meses no Rendimento (Réveillon/verão), anúncios no ar no início de dezembro.
