# 07 — Recepção

> Leia antes `00-CONTEXTO-GERAL.md`. Este arquivo cobre a tela da Recepção e o trabalho da recepção
> (Botafogo). Atualize o "Estado atual" ao fim de cada entrega.

## Unidades
- **Botafogo** — 19 quartos, tem recepção. Só aqui aparecem "Trocar Turno" e o histórico de trocas.
- **Ipanema** — 12 quartos, sem recepção. As camareiras fazem o check-out pelo app e a recepção de
  Botafogo confere no Cloudbeds (quadro "Check-outs feitos pelas camareiras").
- A unidade vem do seletor do app (`useUnidade()`); a mesma tela serve às duas.

## Quem acessa
- Menu: `podeRecepcao` em `src/components/app-shell.tsx` — admin, papel `recepcao` ou quem tem a tela
  `recepcao` liberada em Equipe › Telas (`telas_permitidas`). A rota não tem `beforeLoad` próprio;
  a proteção é o login (`_authenticated/route.tsx`) + o menu.
- `dados-recepcao` aceita qualquer usuário logado com papel admin, gestor, recepcao, camareira ou
  funcionario.
- Seta Voltar: `BotaoVoltar` no `app-shell.tsx` (todas as telas).

## Tela `src/routes/_authenticated/recepcao.tsx`
De cima para baixo:
1. Cabeçalho "Painel de Controle da Recepção" com botão Atualizar.
2. `RecadosGestorAlert setor="recepcao"` (recados do gestor).
3. Busca (quarto ou hóspede) e botões: **Recado camareira**, **Dinheiro do caixa**, **Frigobar**,
   **Solicitar compra**, **Almoxarifado** (consulta de estoque) e, só em Botafogo, **Trocar Turno**.
4. `CheckoutsCamareirasSection` — check-outs feitos pelas camareiras, botão "Conferi"
   (`checkout_log_conferir`, 0050).
5. `RecadosDaCamareiraSection` — recados que as camareiras mandam pelo app delas ("Recado recepção").
6. `RecadosEnviadosCamareiraSection` — recados que a recepção mandou.
7. `HistoricoTrocasTurno` (Botafogo). **Auditoria de Almoxarifado** e **Solicitações de Compra** só
   aparecem para gestor/admin (`me.isGestor || me.isAdmin`).
8. Grade de cards dos quartos.

### Atualização dos dados
- `buscarRecepcaoCloudbeds(unidade)` (`src/lib/cloudbeds-sync.ts`) chama a função
  `supabase/functions/dados-recepcao`.
- Recarrega a cada **3 min**; se a busca falhar, tenta de novo em **30 s**.
- Também recarrega na hora quando muda `room_housekeeping` da unidade (realtime).
- Falhou e já havia dados da mesma unidade → mantém o último dado bom e avisa "Cloudbeds não
  respondeu agora. Mostrando os últimos dados". Sem dado anterior → tela de erro com "Tentar de novo".
- Vistorias do dia (`room_inspections`) recarregam por realtime e zeram às 23h (horário de SP).

### Card do quarto
| Item | De onde vem |
|---|---|
| Livre / Ocupado / Bloqueado | Bloqueado = `bloqueioDeHoje`; Ocupado = hóspede atual com check-in feito |
| Tipo e motivo do bloqueio (MANUTENÇÃO / BLOQUEADO) | `getRoomBlocks` + `getHousekeepingStatus`, mostrado por `AvisosCloudbedsQuarto` (mesmo componente das Camareiras) |
| ECI / LCO com horário | `getRoomBlocks` por `roomID`; texto da reserva como reserva (`scanEciLco`) |
| Não perturbe | `room_housekeeping.is_dnd` |
| Tarefa (GERAL, GERAL - CHECK-IN, ARRUMAÇÃO…), "TROCA NO CHECK-OUT", "Em serviço: X", "Liberado por X" | `room_housekeeping` (app das camareiras) |
| Limpo / Sujo / Em limpeza | `room_housekeeping.status`; sem linha, cai no `roomCondition` do Cloudbeds |
| Hóspede atual: nome, pax, noites, chegada, saída, "Sai hoje" | reservas do Cloudbeds (janela de 60 dias + todas `checked_in` de 365 dias, paginado) |
| Próximo hóspede (chega hoje): nome, pax, noites, chegada prevista, pagamento e doc | idem; hora prevista vem do detalhe da reserva (`horariosDeChegada`) |
| RECEBER NO BALCÃO + valor, botão **Receber saldo** | `saldoACobrar` (zero para Airbnb); o botão manda `/postPayment` ao Cloudbeds (`postReservationPayment`, só recepcao/gestor/admin) |
| DOC PENDENTE | falta `guestDocumentNumber` ou `guestCountry` do hóspede |
| Vistoriar Quarto / VISTORIADO por X às HH:MM | botão só em quarto com tarefa de check-in; grava em `room_inspections` |
| Check-in digital (Tuya) | `CheckInDigitalButton` → função `tuya-password` |
| Deixar recado camareira | `recados_camareiras` |

## Regras compartilhadas com as Camareiras
- `supabase/functions/_shared/cloudbeds-quarto.ts`, usado por `dados-recepcao` (Recepção, ao vivo) e
  `consolidar-dados` (Camareiras/Gestão, grava `room_housekeeping` a cada 5 min). Testes em
  `src/lib/cloudbeds/cloudbeds-quarto.test.ts`.
- "Hoje" = data do hotel (`hojeNoHotel`, America/Sao_Paulo).
- `cloudbedsGet` tenta 3 vezes (rede, 429, 5xx); se falhar, `dados-recepcao` devolve erro em vez de
  quartos vazios.
- **Bloqueio (`bloqueioDeHoje`, PR #76, já na main):** um bloqueio do Cloudbeds é descartado quando
  1. há reserva para esta noite (chega hoje, ou hóspede em casa que não sai hoje);
  2. o housekeeping diz `roomBlocked=false`;
  3. o bloco termina hoje e o housekeeping não confirma `roomBlocked=true`.
  Descartes aparecem no log da função: "bloqueio do Cloudbeds ignorado (motivo)".
- Airbnb: `_shared/canal-pagamento.ts` (cópia em `src/lib/cloudbeds/canal-pagamento.ts`, manter iguais).
  Reserva de canal pré-pago não gera "Receber no balcão".

## Decisões do Rodrigo
- A **vistoria da Recepção NÃO vai para o Cloudbeds**. Só o "quarto limpo" finalizado pela camareira
  vai (com confirmação, ver 00 › "Quarto limpo no Cloudbeds"). Conferido: `vistoria-modal.tsx` só grava
  no Supabase.
- **Pedir reforço** (tela Previsão de Carga, ver 00 e `01-escalas.md`): a recepção escolhe o
  freelancer da lista ou digita um nome novo (cadastro criado sozinho), o valor (editável) e a unidade;
  `previsao_lancar_reforco` lança o plantão na Escala e no Financeiro e só notifica o gestor.
  Editar/excluir é só do gestor (`previsao_excluir_reforco` recusa quem não é gestor/admin).
- Auditoria de Almoxarifado e Solicitações de Compra ficam ocultas para a recepção.
- **Senhas das fechaduras** são geradas no app da Tuya no celular, não pela API.

## Tabelas que a Recepção usa
`room_housekeeping` (leitura), `room_inspections` + `room_inspection_issues` + `vistoria_checklist_items`
(vistoria; fotos no bucket `inspections`), `recados_camareiras`, `cloudbeds_checkout_logs`,
`recepcao_caixa_movimentos` (Dinheiro do caixa), `beverage_sales` / `beverage_catalog` (Frigobar),
`trocas_turno`, `tuya_password_logs`, `previsao_reforco_pedidos` (reforço).

## O que encontrei no código e precisa de decisão (14/10/2026)
1. **Etiqueta "Airbnb · já pago ao canal" nunca aparece.** `dados-recepcao` calcula `canalPrePago`,
   mas não o devolve na lista final. O débito já está certo (Airbnb não vira "Receber no balcão");
   só a etiqueta some.
2. **"DOC PENDENTE" do hóspede atual só aparece se também houver pagamento pendente**
   (`q.docPendente && q.pagamentoPendente`). Hóspede com saldo zero e sem documento não é avisado.
   No próximo hóspede o aviso aparece sozinho.
3. **"Realizar Check-in" só muda a tela.** O botão marca o quarto como ocupado apenas no navegador:
   não vai ao Cloudbeds e some na próxima atualização (até 3 min).
4. **`tuya-password` sem trava na main.** A regra "só gestor/admin/recepção ou tela check-in-digital"
   está na branch `fix/seguranca-supabase` (PR #75), ainda não mesclada. Na main publicada a função
   não confere quem chama, e a chave da Tuya está escrita no código. Fica com o PR #75 e a troca da
   chave (pendências gerais), não mexer aqui sem o Rodrigo pedir.

## Estado atual
- 14/10/2026: arquivo criado (mapa da Recepção conferido no código da main `578d400`, com o PR #76).
  Nenhuma mudança de código. Próximo passo: Rodrigo escolhe o que fazer (itens acima ou outro).
