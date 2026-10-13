# PROJETO INJOY — Dashboard do gestor

Leia antes o `00-CONTEXTO-GERAL.md` e, para os dados, os arquivos 01 a 05.

## Objetivo
Uma visão única para o gestor: o que precisa de decisão hoje e como as unidades estão indo no mês,
sem abrir dez telas. O Rodrigo decide o conteúdo a partir do mapeamento abaixo.

## Mapeamento do que já existe (13/10/2026)

### Onde o gestor vê indicadores hoje
| Tela | Rota / arquivo | O que mostra |
|---|---|---|
| Início da Área do Gestor | `/gestor` (`gestor/index.tsx`) | `FinanceiroAlertas`, `EscalaHojeCard`, `PrevisaoCargaCard` + atalhos para ~25 telas |
| Painel de Gestão | `/gestao` (`gestao.tsx`) | Ocupação hoje, a receber no balcão, docs pendentes, recebimentos do balcão, avaliações Booking, check-outs Cloudbeds, tempo das camareiras por quarto, links para históricos. Uma unidade por vez |
| Boas-vindas (tela inicial) | `boas-vindas.tsx` | Para gestor/admin: chegadas e reservas de hoje, ponto dos funcionários (Pontomais), resumo e notas da bonificação, controle rápido (chamados, vistoria do dia, passagens de turno) |
| Financeiro | `/gestor/financeiro` (`financeiro-dashboard.tsx`) | Receita, despesa, resultado %, a pagar em 7 dias, vencidas, despesa por grupo, receita × despesa 12 meses, energia/água 12 meses, custo operacional/diária, energia/diária, água/diária, lavanderia/diária, pessoal/receita |
| PAINEL | `/painel` | Quadro de chamados (A fazer / Fazendo / Feito) — não é indicador |

### Fontes de dados por assunto
| Assunto | Fonte | Observação |
|---|---|---|
| Ocupação e quartos | `hotel_metrics` (1 linha por unidade por dia, regravada a cada 5 min por `consolidar-dados`) e `room_housekeeping` | Há histórico diário desde que a sincronização começou |
| Chegadas / saldo a receber | Cloudbeds via server functions (`chegadas-hoje-cards`, `recebimentos-balcao-card`) e `hotel_metrics.pending_balance` | Ao vivo, sem histórico próprio |
| Previsão de carga e reforço | `previsao_carga`, pedidos de reforço (`previsao_pedir_reforco`/`decidir`) | Aviso D+2 |
| Escala | `escala_dias`, `escala_alertas_financeiros` | Cobertura de hoje, faltas sem cobertura, plantões sem valor |
| Financeiro | `fin_lancamentos`, `fin_indicadores_mes` | Diárias vendidas, receita de hospedagem e ocupação do mês são **digitadas à mão** |
| VA/VT | `escala_lancar_beneficios` → `fin_lancamentos` | Valor separado no mês fica só no aparelho |
| Bonificação e meta | `registros_bonificacao`, meta (`useMetaSituacao`, ocorrências de atraso/falta) | Notas Geral/Funcionário/Limpeza |
| Ponto | `ponto_batidas`, `ponto_dia`, pendências, atestados, banco de horas (0038); Pontomais legado | |
| Lavanderia | `lav_taloes`, `lav_talao_itens`, `lav_faturas` | Saldo, talões ≥3 dias, faltas, fechamento × fatura |
| Totem | `totem_eventos`, `totem_avaliacoes`, `cloudbeds_checkout_logs` | Avaliação 1–5 ainda não ligada à Bonificação |
| Manutenção | `chamados`, preventiva AC, histórico de manutenção | Abertos/urgentes, atrasadas e próximos 7 dias |
| Avaliações | `booking_reviews` | |
| Frigobar / almoxarifado | `beverage_sales`, `beverage_catalog`, estoque | Sem alerta de estoque mínimo |

### Problemas encontrados no mapeamento
- `gestao.tsx` tem números **inventados** (`DADOS_POR_UNIDADE`: 40 quartos em Botafogo, 28 em Ipanema,
  R$ 2.450 a receber...) que aparecem quando a métrica ao vivo falha. As unidades têm 19 e 12 quartos.
- "Quartos em limpeza" usa o mesmo número de "sujos"; o total de quartos é uma soma que não fecha.
- `hotel_metrics.rating` é fixo no código (8,6 Botafogo / 7,8 Ipanema, "homologação").
- Indicadores ficam espalhados em 4 telas e a tela `/gestao` mostra uma unidade por vez.

## Estado atual
- Mapeamento feito (13/10/2026). Aguardando o Rodrigo decidir o conteúdo do dashboard.

## Ideias e pendências
- (a decidir com o Rodrigo)
