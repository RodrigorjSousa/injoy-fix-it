# PROJETO INJOY — Contexto geral

> Leia este arquivo inteiro antes de qualquer trabalho. Depois leia o arquivo do assunto
> (01 a 07). Atualize a seção "Estado atual" do assunto ao terminar cada entrega.

## O negócio
- **IN.JOY Hostel Design Pousada** (INJOY HOTÉIS — injoyhoteis.com), Rio de Janeiro.
- Duas unidades: **Botafogo** (19 quartos, tem recepção) e **Ipanema** (12 quartos, sem recepção fixa).
- Dono do projeto: **Rodrigo** (gestor). Fala português; 20 anos em automação industrial.
- Equipe usa celulares da empresa. Papéis: gestor, admin, recepcao, camareira, funcionario.
- Mayara (recepção) alimenta a Bonificação. **Nunca usar senha de funcionário** para testar.

## O aplicativo
- Repositório: **https://github.com/RodrigorjSousa/injoy-fix-it** (branch `main`).
- Feito no **Lovable**. O Lovable sincroniza com o GitHub nos dois sentidos.
- Stack: TanStack Start/Router (rotas em `src/routes/_authenticated/*`, `routeTree.gen.ts` é gerado
  no build), React Query, Supabase JS, shadcn/ui, Tailwind, vitest, bun.
- Banco: **Lovable Cloud (Supabase) projeto `vpeuugeoetwvrmrtemgj`**. Nunca usar `uxteuvvtlgoipixnwubl`.
- Integrações: Cloudbeds (reservas, PDV, check-out, pagamentos), fechaduras Tuya, Pontomais
  (ponto oficial, legado), push notifications (`public/push-sw.js`).

### Peças importantes
| O quê | Onde |
|---|---|
| Usuário logado / papéis | `useMe()` em `src/lib/store.ts` |
| Proteção de rota | `src/lib/require-gestor.ts` (`requireGestor({somenteGestor})` ou `{tela}`) |
| Menu lateral | `src/components/app-shell.tsx` (`ALL_NAV`) |
| Botão Voltar | `src/components/botao-voltar.tsx` (lateral no computador, topo no celular; regras em `src/lib/voltar.ts`) |
| Telas liberáveis por funcionário | `src/lib/telas-catalog.ts` + `funcionarios.telas_permitidas` |
| Área do gestor | `src/routes/_authenticated/gestor/*` |
| Papel no banco | `private.has_role(uid, 'gestor')` (enum `public.app_role`) |
| Migrações | `drizzle/migrations/NNNN_nome.sql` |

## Como trabalhamos (fluxo que funciona)
Rodrigo prefere mudanças pelo GitHub para economizar créditos do Lovable.

1. Claude cria uma branch a partir de `origin/main`, faz a mudança e verifica:
   `npx tsc --noEmit -p .` · `npx vitest run` · `npx vite build`.
   Migrações SQL são testadas antes num Postgres local, com stubs de `auth.users`, `auth.uid()` e
   `private.has_role`, simulando cada usuário com `set role authenticated`.
2. **Envio pelo PC do Rodrigo** (o push direto da nuvem dá 403):
   - `git bundle create x.bundle origin/main..HEAD`, depois SendUserFile e `device_commit_files` para
     `C:\Users\ideapad\Documents\GitHub\injoy-fix-it\`.
   - No PC (Desktop Commander, PowerShell): `git fetch origin; git fetch .\x.bundle HEAD:<branch>;
     git push -u origin <branch>`; apagar o bundle.
3. Rodrigo faz o merge em `https://github.com/RodrigorjSousa/injoy-fix-it/pull/new/<branch>`.
   **Não fazer merge na main sem ele.**
4. Se houver migração, Rodrigo manda ao Lovable:
   *"Aplique a migração `drizzle/migrations/NNNN_x.sql` exatamente como está, sem alterar nem
   esvaziar o arquivo. Se der erro, me mostre a mensagem completa."*
5. **Lovable → Publicar → Atualizar.** Sem publicar, o app usado pela equipe continua antigo.

Commits terminam com:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Cuidados que já custaram tempo
- O Lovable **renumera ou esvazia migrações** (ex.: 0031 esvaziada depois de falhar). Quando falhar,
  crie um arquivo NOVO e idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).
  Não edite `meta/_journal.json`.
- `public.profiles` **não tem coluna email**: use `auth.users.email`.
- O Lovable não cria bucket por migração (`storage.buckets`); bucket é criado pela ferramenta de
  storage dele, e as policies vão numa migração separada.
- A ferramenta de leitura SQL do Lovable não é um usuário logado: funções só com `GRANT authenticated`
  dão "permission denied" ali. Isso é esperado.
- plpgsql: `text[] || 'literal'` dá erro; use `array_append`.
- A ferramenta de migração do Lovable **recusa INSERT de dados no nível do arquivo e FK para
  `auth.users`**. Dados iniciais vão dentro de uma função (ex.: `bonus_meta_preparar()`) chamada pelo
  app. Agendamentos com `cron.schedule` ficam em migração separada.
- `.maybeSingle()` dá erro com 2 linhas: em `funcionarios` use `.order("nome").limit(1).maybeSingle()`.
- RLS em DELETE apaga 0 linhas sem erro: use `.select("id")` e confira se apagou.
- Permissões: uma única fonte no banco (RPC) usada pela rota, pelo menu e pela tela. Nada de
  regra pelo nome da pessoa.
- Nunca afirmar "vai funcionar" sem teste. Mostrar a mensagem de erro real na tela.

## Módulos já entregues (resumo)
- Área do gestor + Financeiro (0006–0009, 0017/0018).
- Escala (0010–0016) — ver `01-escalas.md`.
- Ponto facial (0019–0026) — ver `02-ponto.md`.
- Bonificação: lançamento conjunto Recepção + Camareiras, aba **Acessos** (tabela
  `bonificacao_acessos`, RPC `minha_permissao_bonificacao`), botões Editar e Excluir, e notas
  Geral/Funcionário/Limpeza na tela inicial com janela só de visualização (0003–0005, 0026–0032).
- Meta da equipe (0034 + agendamento 0035; a 0033 foi recusada pelo Lovable por inserir dados): +R$ 100 por pessoa pela nota do próprio setor (0039): Recepção → nota Funcionário; Camareiras/Manutenção → nota Limpeza; Geral não conta. A pessoa perde
  as duas bonificações com mais de 3 atrasos (tolerância de 10 min contra a Escala) ou com falta
  sem justificativa.
  - Atrasos e faltas vêm do Pontomais (`registro_ponto_pontomais`) ou do ponto do app
    (`ponto_batidas`).
  - O gestor justifica em Bonificação › Meta equipe.
  - Atualização automática 3x/dia: cron chama `private.run_bonus_meta_sync`, que chama
    `/api/public/bonus-meta`.
  - Participantes: Raquel, Julia, Mayara, Gleidiane, Lucivaldo e Flavio.
- Totem (0041, 0042, 0059, 0060): check-in com senha Tuya, check-out, avaliação, pagamento na
  maquininha Stone (Connect 2.0), identificação estilo gov.br (selfie com prova de vida + selfie com
  documento) e comprovante térmico em `/totem`; gestão em Área
  do Gestor › Totem. Ver `04-totem.md`.

- Previsão de Carga (0015/0016 + 0048 + 0056): tela `/previsao-carga` para a Recepção (ou quem tiver
  `previsao-carga` em Equipe › Telas; regra no banco `private.pode_ver_previsao_carga`).
  - Desde a 0056 a Recepção **lança** o reforço (sem autorização): botão "Pedir reforço" no card do dia (data e
    unidade preenchidas) ou no topo (escolhe unidade e dia) → freelancer da lista ou nome novo (cria o cadastro
    freelance de camareiras), valor (padrão da modalidade de reforço, editável) e entrada. `previsao_lancar_reforco`
    cria o dia `extra` na Escala (vai sozinho ao Financeiro), grava em `previsao_reforco_pedidos` (status `lancado`,
    `escala_dia_id`, `freelancer_nome`, `valor`) e manda push "Reforço lançado" ao gestor.
  - Só o gestor corrige: Área do Gestor › Previsão de Carga lista os reforços com Editar (resumo dos plantões) e
    Excluir (`previsao_excluir_reforco`, apaga o pedido e o plantão). Pedidos antigos (pendente/autorizado/negado)
    também podem ser excluídos. Autorizar/Negar saíram da tela.

- Check-out pela camareira (Botafogo e Ipanema): faz pelo app só em quarto com GERAL/GERAL - CHECK-IN;
  o servidor faz no Cloudbeds, confere o status e grava `cloudbeds_checkout_logs.status`
  (confirmado/nao_confirmado/falhou) + recado `to_recepcao`. A Recepção de Botafogo vê o quadro
  "Check-outs feitos pelas camareiras" e marca "Conferi" (`checkout_log_conferir`, 0050).

- Card do quarto: hora prevista de chegada vem do DETALHE da reserva (`horariosDeChegada` em
  `_shared/cloudbeds-quarto.ts`, a listagem não traz); noites do próximo hóspede em `next_nights` (0052).
  Camareira "Finalizar serviço" marca o quarto LIMPO no Cloudbeds (`cloudbedsMarcarQuartoLimpo`).

- Quarto limpo no Cloudbeds com confirmação (migração 0055, branch `fix/camareira-quarto-limpo-cloudbeds`):
  - Ao finalizar, o app grava `room_housekeeping.cloudbeds_limpo_status = 'pendente'` e o servidor manda
    `postHousekeepingStatus roomID + roomCondition=clean` (sem `roomCondition` o Cloudbeds INVERTE o estado),
    depois lê `getHousekeepingStatus` de volta. Só diz "confirmado" se o Cloudbeds mostrar clean/inspected.
  - O quarto é achado pelo `cloudbeds_room_id` gravado pela sincronização; sem ele, pelo número (recusa se
    houver dois quartos com o mesmo número).
  - Não confirmou → continua `pendente` e `consolidar-dados` (a cada 5 min) confere e reenvia; para depois de
    6 tentativas ou 12 h (`falhou`, aparece nas pendências do dashboard) ou se o quarto deixou de estar
    finalizado / ficou em Não perturbe. Regras em `supabase/functions/_shared/cloudbeds-limpeza.ts`
    (testes em `src/lib/cloudbeds/cloudbeds-limpeza.test.ts`). Cada tentativa fica em `cloudbeds_limpeza_logs`.
  - Não perturbe e a vistoria da recepção NÃO mandam limpo ao Cloudbeds (decisão do Rodrigo, 13/10/2026:
    a vistoria fica só no app).

- Plantões de freelancer editáveis (0056, `src/components/escala/plantoes-freelancer.tsx`): no Financeiro, a linha
  que veio da Escala abre o resumo dia a dia (editar, excluir, incluir, excluir todos); a lixeira e o lápis dessas
  linhas abrem o mesmo resumo (antes a lixeira apagava o lançamento e a sincronização o recriava). O nome do
  freelancer aparece na linha. Na Escala, editar um dia `extra` tem "Valor e horas do plantão" e "Excluir dia".
  Lançamento já pago não é alterado pela Escala (aviso no resumo).

- Previsão de Carga — REFORÇO x SUBSTITUIÇÃO: extra com `substitui_colaborador_id` (cobre férias,
  folga ou falta) é substituição (soma na capacidade, não conta como reforço). Reforço = extra sem
  `substitui_colaborador_id`. `freelancers_escalados` e "Reforço chamado" contam só reforço.

- Reservas (0061 + agendamento 0062): tela `/reservas` com as reservas com saldo em aberto que a recepção deve cobrar
  no Cloudbeds (regras NR do 8º dia e Standard 2 dias antes do check-in). Recepcionista só vê quando o gestor libera
  (Reservas › Quem vê). Ver `07-recepcao.md`.

- Lavanderia: conta corrente de peças por talão Clean Soft, com foto obrigatória e fechamento mensal (0043–0044)
  — ver `03-lavanderia.md`.

## Conversas do PROJETO INJOY
Uma conversa por assunto. Cada uma começa lendo este arquivo e o arquivo do assunto:
1. Escalas — `01-escalas.md`
2. Marcação de ponto — `02-ponto.md`
3. Lavanderia — `03-lavanderia.md`
4. Totem (auto check-in, check-out e avaliação) — `04-totem.md`
5. Mercado autônomo no hall — `05-mercado-autonomo.md`
6. Dashboard do gestor — `06-dashboard.md`
7. Recepção — `07-recepcao.md`

Pendências gerais: Fase 3 (licenças e vistorias obrigatórias: bombeiros, vigilância sanitária,
caixa d'água/cisternas, dedetização, extintores, Cadastur) ainda não começou; limpeza automática
das selfies antigas do ponto foi oferecida.

## Cloudbeds → card do quarto (bloqueio, manutenção, ECI, LCO)
- Regras únicas em `supabase/functions/_shared/cloudbeds-quarto.ts`, usadas por `consolidar-dados`
  (Camareiras/Gestão, grava `room_housekeeping`) e `dados-recepcao` (Recepção). Testes em
  `src/lib/cloudbeds/cloudbeds-quarto.test.ts`.
- "Hoje" é a data do hotel (America/Sao_Paulo). Usar UTC quebrava tudo depois das 21h.
- Bloqueios vêm de `getRoomBlocks` (consulta de ontem a amanhã, filtrada pelo dia):
  - `out_of_service` ou motivo de manutenção → MANUTENÇÃO;
  - outros bloqueios → BLOQUEADO;
  - motivo com ECI/LCO (também "early check-in", "saída atrasada" etc.) → só aviso, não bloqueia.
- Se o Cloudbeds falhar (com 3 tentativas), a unidade NÃO é regravada: fica o último dado bom.
- Sincronização automática a cada 5 min (migração 0058; a 0051_room_housekeeping_bloqueio_cloudbeds nunca chegou ao
  banco porque o Lovable aplicou a outra 0051).
- Motivo e tipo do bloqueio no card das camareiras: colunas `room_housekeeping.block_kind/block_reason` (0057). Sem
  elas a sincronização gravava os quartos sem o motivo e o card da camareira mostrava só o texto genérico; a Recepção
  via o motivo porque lê o Cloudbeds ao vivo (`dados-recepcao`). Os dois cards usam `AvisosCloudbedsQuarto`.
- **Desbloqueio (episódio de 14/10/2026)**: 3 quartos desbloqueados no Cloudbeds continuaram bloqueados na Recepção e
  nas Camareiras, e as camareiras não viram o check-in de dois deles. Causa: o `getRoomBlocks` ainda devolvia um
  bloco que "terminava hoje" (a data final do bloco funciona como dia de saída) e o app contava o dia final como
  bloqueado; nas Camareiras o `status = 'maintenance'` ainda ficava preso para sempre no banco. Regra única agora em
  `bloqueioDeHoje` (as duas telas): um bloqueio do `getRoomBlocks` NÃO vale quando
  1. o quarto tem reserva para esta noite (chega hoje ou hóspede em casa que não sai hoje) — o Cloudbeds não aceita
     reserva e bloqueio na mesma noite, então a reserva prova o desbloqueio;
  2. o `getHousekeepingStatus` diz `roomBlocked=false`;
  3. o bloco começou antes e termina hoje, e o housekeeping não confirma `roomBlocked=true`.
  Bloqueio descartado aparece no log da função ("bloqueio do Cloudbeds ignorado (motivo)"). `getRoomBlocks` agora
  pede `pageSize=100` (o padrão do Cloudbeds é 20).
- Camareiras: faixa amarela "Cloudbeds sem atualizar há X min" quando a última sincronização da unidade
  (`hotel_metrics.updated_at`) passa de 15 min, com botão Atualizar — falha de sincronização não fica mais calada.
  A Recepção já avisava ("Mostrando os últimos dados").

## Notificações (push) e Painel de chamados
- Caminho: gatilho no banco → `private.enqueue_push_notification` (lê `app_settings.push_dispatcher_url/secret`) →
  `/api/public/push-dispatcher` (confere `PUSH_DISPATCH_SECRET`) → `push_subscriptions` → aparelho (`public/push-sw.js`).
- Quem recebe chamado novo: o técnico designado + gestor/admin. Chamado redesignado (troca de técnico): o novo
  técnico (`chamado_designado`, migração 0068). Chamado finalizado: quem abriu (`chamado_concluido`, 0069), menos
  quando foi a mesma pessoa que fechou. Toque no aviso abre o próprio chamado.
- Fechamento (0069): ao virar "Concluído" o BANCO grava `concluido_em`, `concluido_por` e `concluido_por_nome`
  (o app só muda o status; não dá para forjar). Reabrir apaga. Painel e tela do chamado mostram "Fechado por X em
  dd/mm hh:mm · levou N" (`src/lib/chamado-tempo.ts`). Chamados fechados antes da 0069 podem não ter quem/quando.
- Relato de 18/10 ("sininho ativo e não chega"). Causas encontradas: (1) o aparelho é uma inscrição só; em
  celular/tablet usado por mais de uma pessoa a linha ficava com a primeira, e a regra de segurança recusava a
  troca, então os avisos iam para outra pessoa; (2) o sininho ficava verde só por o navegador estar inscrito, mesmo
  sem a linha no banco (apagada por 404/410 ou recusada); (3) inscrição feita com chave VAPID antiga nunca recebe.
  Correção: `push_registrar_aparelho` (0068) passa o aparelho para quem está logado; ao abrir o app e a cada login
  o app confere o aparelho e refaz a inscrição se a chave mudou; o sininho só fica verde com a linha no banco;
  ao ativar, chega um aviso de teste pelo mesmo caminho dos chamados (`enviarNotificacaoTeste`) e, se falhar, a
  tela diz o motivo (endereço/senha do banco, nenhum aparelho, push recusado). Envio com `Urgency: high`.
- Regra prática: um aparelho avisa só a última pessoa que entrou nele. iPhone só recebe com o app instalado na
  tela inicial (Safari → Compartilhar → Adicionar à Tela de Início) e iOS 16.4+.
- Log do envio no Lovable: `[push] <evento>: enviados/aparelhos de N pessoa(s) · falhas: <status>`.
- Painel (`/painel`): Kanban/Lista com os filtros ao lado (Unidade → Quartos → Categoria). Quartos só libera com a
  unidade escolhida e mostra os chamados ABERTOS (A Fazer + Fazendo) daquele quarto; lista de quartos única em
  `src/lib/chamados-quarto.ts` (a mesma da tela de abrir chamado). "Minha escala" no Painel começa recolhida.
