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

## Decisões do Rodrigo (13/10/2026)
- Entram os blocos A (precisa de você hoje), B (operação de hoje, unidades lado a lado), C (mês em curso)
  e um bloco novo: **rendimento por unidade lado a lado** com quartos mais e menos alugados, quartos com mais
  reclamações, dias de alta e de baixa e a faixa de diária que mais fecha hospedagem.
- Lugar: topo do **Início da Área do Gestor** (`/gestor`); os atalhos continuam embaixo.
- Corrigir já os números inventados do `/gestao` e a nota fixa.

## Como funciona (entrega 1, branch `feat/dashboard-gestor`, migração `0054_dashboard_rendimento.sql`)
- Tela: `src/routes/_authenticated/gestor/index.tsx` monta os blocos de `src/components/dashboard/*`:
  `bloco-pendencias`, `bloco-operacao`, `bloco-mes`, `bloco-rendimento` (+ `comum.tsx`). Celular: uma coluna;
  computador: Botafogo e Ipanema lado a lado.
- Consultas: `src/lib/dashboard/dados.ts`. Cada fonte é consultada separada; se uma falhar (ex.: migração
  ainda não aplicada), só aquele item mostra "Não carregou · motivo".
- **A · Precisa de você hoje**: alertas do Financeiro/Escala (componente existente) + contagens de pedidos de
  reforço pendentes, batidas de ponto pendentes, atestados pendentes, talões na lavanderia há 3 dias ou mais,
  chamados urgentes abertos, check-outs das camareiras sem "Conferi" (desde ontem) e quartos limpos no
  app que o Cloudbeds não confirmou (`cloudbeds_limpo_status = 'falhou'`, migração 0055). Só aparece o que tem
  quantidade > 0; cada item leva à tela certa.
- **B · Operação de hoje**: `room_housekeeping` ao vivo, mesma regra da tela inicial (`src/lib/dashboard/operacao.ts`,
  com testes): ocupação sobre os quartos vendáveis, chegadas, saídas, prontos/faxina/sujos/bloqueados, a receber
  no balcão e docs pendentes. Embaixo, os cartões existentes de escala de hoje e reforço em 2 dias.
- **C · Mês em curso**: receita, despesa e resultado do Financeiro (rateio de "Ambas" igual ao Financeiro,
  `valorRateado`), ocupação média do mês (`hotel_metrics`), notas G/F/L da Bonificação, média do totem,
  peças e talões da lavanderia e quem está em risco/perdeu a Meta da equipe.
- **D · Rendimento por unidade**:
  - Dados: o servidor (`src/lib/dashboard-rendimento.functions.ts`, `sincronizarRendimentoMes`) busca no
    Cloudbeds as reservas que tocam o mês (`getReservationsWithRateDetails` filtrando pela saída; se falhar,
    plano B `getReservations` + `getReservation` de cada uma) e grava **uma linha por quarto por noite** em
    `dash_reserva_noites` pela RPC `dash_gravar_noites` (substitui o mês inteiro da unidade, tudo ou nada).
    Sem nome de hóspede. Canceladas e no-show não entram. Log em `dash_sincronizacoes`.
  - Atualização: ao abrir o painel, o mês atual é buscado sozinho se a última busca passou de 6 h. Botão
    "Atualizar com o Cloudbeds" busca os meses do período escolhido; aviso amarelo lista meses nunca buscados
    com "Buscar agora" (para o histórico de 12 meses, 24 buscas, uma de cada vez).
  - Valor da noite: tarifa do dia; se faltar, total do quarto ÷ noites; se faltar, total da reserva dividido
    igualmente (`noitesDaReserva`, em `src/lib/dashboard/rendimento.ts`, com testes).
  - Períodos: este mês, mês passado, 3 meses, 12 meses. Indicadores vão **até hoje**; o que já está reservado
    para depois aparece à parte ("Já reservado para o resto do período").
  - Indicadores por unidade: receita, ocupação (noites ÷ quartos × dias; Botafogo 19, Ipanema 12), diária
    média, RevPAR, reservas, estadia média, valor médio por reserva, **diária que mais fecha** (faixa de
    R$ 50 com mais noites + gráfico), mais e menos alugados (3 cada, incluindo quartos com 0 noites), dias de
    alta e de baixa (3 cada), ocupação por dia da semana e receita por canal. Faixa comparativa B × I no topo.
  - **Reclamações e problemas por quarto** (no período): chamados com "[Quarto X]" na descrição + problemas
    abertos na vistoria (`room_inspection_issues`) + avaliações do totem com nota até 3.
- `/gestao`: sem números de exemplo (mostra "—" e o erro quando falta a métrica). `consolidar-dados` grava
  `hotel_metrics.rating = null` (a nota fixa saiu; ninguém lia o campo).

## Menu do gestor (13/10/2026, branch `feat/menu-gestor-enxuto`, sem migração)
- Gestor/admin: a lateral (e a barra de baixo no celular) mostra só ÁREA DO GESTOR › INÍCIO DA ÁREA
  (`MENU_GESTOR` em `src/components/app-shell.tsx`). Sem Bater Ponto nem Minha Escala (gestor não bate
  ponto nem tem escala; é só o menu, cadastro e quiosque não mudaram). Seletor de unidade,
  notificações e Sair continuam. A lateral da equipe não mudou.
- Todas as telas que estavam na lateral têm card em Atalhos. Novos: seção "Telas da equipe" (Recepção,
  Camareiras, Manutenção) e, em Operação, Painel de Chamados, Serviços e Chat.

## Estado atual
- Revisão no Lovable: ocupação de hoje usa `hotel_metrics.occupancy_percentage` do Cloudbeds, não nomes de hóspedes. Conferência real: Botafogo 52,63%, Ipanema 50%.
- Indicadores da operação abrem quartos filtrados; indicadores mensais levam aos módulos; rendimento, quartos, dias, canais e barras abrem os registros resumidos. Valores longos quebram linha sem esconder os dados.
- Corrigida a atualização do rendimento: a chamada RPC mantém o vínculo com o cliente. Busca real do mês gravou 351 noites em Botafogo e 245 em Ipanema; 43 barras renderizadas, 25 janelas de indicadores verificadas, quatro gráficos clicados, 30 testes passando e sem erros no navegador. Publicar para atualizar o aplicativo da equipe.
- Entrega 1 pronta na branch `feat/dashboard-gestor`: tsc, vitest (176 testes, 22 novos) e build passando.
  SQL da 0054 testado em Postgres local (17 verificações: gestor, admin, recepção, anônimo; aplicada 2x).
- Para ativar: (1) merge; (2) aplicar a `0054_dashboard_rendimento.sql` no Lovable; (3) Publicar → Atualizar.
  Na primeira abertura o mês atual é buscado sozinho; para o histórico, escolha "12 meses" e "Buscar agora".
- Não testado contra o Cloudbeds real (as credenciais ficam só no servidor). Conferir na primeira busca:
  receita de um mês fechado contra o relatório do Cloudbeds e as "Observações da busca" no fim do bloco.

## Ideias e pendências
- Preventiva AC atrasada no bloco A (a regra de vencimento está só na tela de histórico de manutenção).
- VA/VT do mês contra o "valor separado" (hoje salvo só no aparelho, o dashboard não enxerga).
- Preencher sozinho diárias vendidas/receita de hospedagem/ocupação do Financeiro (`fin_indicadores_mes`)
  com os dados de `dash_reserva_noites`.
- Busca automática diária por agendamento (hoje só ao abrir o painel).
- Lista de quartos repetida em `index.tsx`, `vistoria.tsx` e `src/lib/dashboard/rendimento.ts` (unificar).
