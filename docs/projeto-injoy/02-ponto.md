# PROJETO INJOY — Marcação de ponto

Leia antes o `00-CONTEXTO-GERAL.md`.

## Regras do negócio
- Ponto próprio, com **reconhecimento facial** no celular da empresa. Existe também o ponto oficial
  obrigatório (Pontomais), que é separado.
- **4 batidas por dia:** entrada, saída para o almoço, volta do almoço e saída.
- **Localização obrigatória (desde 21/10/2026, migração 0077):** o ponto (app e recepção) só é
  registrado a até `ponto_config.raio_m` (100 m) de **Botafogo ou Ipanema**. Sem localização,
  localização imprecisa (> 200 m) ou longe das unidades, a batida é **recusada** com a explicação
  (nada é gravado). O app confere antes de abrir a câmera (`ponto_verificar_local`) e o servidor
  confere de novo em `ponto_registrar`. Tolerância de imprecisão do GPS: 30 m. Unidades sem
  coordenadas em Configurações bloqueiam o ponto (mensagem pede para o gestor salvar).
- **Sem prova de vida (desde 23/10/2026, migração 0079):** captura simples da foto, sozinha quando o
  rosto aparece ou pelo botão "Registrar agora". O rosto ainda é comparado 1:1 quando aparece.
- Rosto que não confere (ou não detectado) ou aparelho diferente do vinculado **é registrado como
  pendente** e vai para o gestor aprovar ou recusar.
- **Aparelho:** o cadastro facial não vincula mais o aparelho de quem cadastra. O celular da pessoa
  é vinculado na **primeira batida** dela no app. O gestor tem o botão **Liberar aparelho** em
  Cadastro facial (troca de celular).
- Vale para fixos e freelancers. Todos aparecem no **quiosque da recepção**. O gestor inclui e
  retira pessoas.

### Banco de horas e horas extras (definido em 07/10/2026)
- Por pessoa, o gestor escolhe: horas a mais **vão para o banco** (1 h por 1 h) ou **são pagas**
  como extra. Sem configuração = paga extra. Débitos (atrasos, saídas antes, faltas) sempre vão
  para o banco. Só **fixos** entram; freelancers são pagos por plantão.
- **Extra 50%:** o que passa do horário em dia de trabalho da escala, e trabalho em folga de dia útil
  ou sábado (ex.: sábado da manutenção) ou em plantão extra.
- **Extra 100%:** trabalho em domingo ou feriado que é **folga** na escala. Domingo/feriado que já é
  dia de trabalho na escala (recepção, camareiras) não gera 100%.
- **Tolerância CLT (art. 58 §1º):** até 5 min por batida e 10 min no dia são ignorados.
- Atestado aprovado e férias abonam. Falta (escala "falta" ou dia passado sem registro) = débito
  das horas previstas. Dia com batidas incompletas não é calculado até ser corrigido.
- Ajustes manuais no banco: saldo inicial, folga compensada, pagamento do saldo, correção — sempre
  com motivo.

### Gestão mensal (30/10/2026, migrações 0088 e 0089)
- **Pedidos do funcionário** (Bater Ponto › Pedidos ao gestor): "Esqueci de bater" (dia, batida,
  horário, motivo) e "Justificar atraso ou falta" (pode pedir abono). Até 31 dias atrás. O gestor
  responde na aba **Pedidos**: aprovar "esqueci" lança a batida (origem manual, motivo
  `solicitacao_funcionario`; dá para corrigir hora e unidade); aprovar justificativa com abono faz
  o dia não descontar do banco. Recusar exige resposta. Push `ponto_solicitacao` (gestores) e
  `ponto_solicitacao_resposta` (funcionário).
- **Espelho com ciência** (Bater Ponto › Meu espelho): dias, extras, noturno, débitos e saldo do
  banco (freelancer vê os dias, sem banco). Mês encerrado: botão "Estou ciente" com comentário
  opcional (`ponto_espelho_ciencia`, guarda os totais vistos). O gestor vê a ciência na aba Banco
  de horas e no Fechamento.
- **Adicional noturno**: minutos entre 22h e 5h (Brasília, UTC-3), sem o almoço; mostrado também em
  hora reduzida (52min30s = 1 h). Não altera extras nem banco; o acréscimo de 20% é do contador.
  Não trata prorrogação após as 5h (Súmula 60 do TST).
- **Alertas**: jornada > 10 h no dia e interjornada < 11 h (no Relatório, no banco e no espelho).
- **Fechamento** (aba Fechamento): só mês já terminado; checklist de pendências e ciências; fechar
  baixa a planilha do contador e guarda o resumo em `ponto_fechamentos`. Mês fechado trava (por
  gatilho) lançamento manual, revisão de batida, ajuste do banco, aprovação de pedido e de
  atestado; as batidas em tempo real (app/recepção) continuam entrando. Reabrir exige motivo
  (`ponto_fechamentos_log`).
- **Planilha do contador** (CSV `;`, vírgula decimal): previsto, trabalhado, extras 50/100, noturno
  real e reduzido, débito, faltas, abonos, dias incompletos, alertas, ajustes, saldos e ciência.
  Código em `src/lib/ponto-export.ts`.
- **Lembrete de saída**: `private.ponto_lembrar_saidas()` (cron a cada 15 min, 0089) avisa por push
  (`ponto_lembrete_saida`) quem está com a jornada aberta 30 min após o fim da escala, ou 10 h após a
  entrada sem escala. Um aviso por jornada (`ponto_lembretes`).
- Código: `src/lib/ponto-mensal.ts` (hooks), componentes `meus-pedidos`, `meu-espelho`,
  `solicitacoes-gestor`, `fechamento-ponto`, `tabela-dias-ponto`.

### Atestado médico
- O funcionário envia foto ou PDF pela tela Bater Ponto; o gestor aprova ou recusa (motivo
  obrigatório para recusar). Ao aprovar, os dias `trabalho`/`falta` da escala no período viram
  `atestado` (origem manual). O gestor pode cancelar depois: os dias voltam a ser como eram.

## Onde está no código
- Telas: `src/routes/_authenticated/ponto.tsx` (bater ponto/quiosque + envio de atestado) e
  `gestor/ponto.tsx`, com as abas Pendências, Relatório, Banco de horas, Atestados, Pessoas,
  Cadastro facial e Configurações.
- Componentes: `src/components/ponto/*` (face-capture, pendencias-ponto, relatorio-ponto,
  cadastro-facial, config-ponto, pessoas-ponto, banco-horas, atestados-gestor, meus-atestados).
- Lógica: `src/lib/ponto.ts` (TipoBatida, hooks) e `src/lib/ponto-face.ts`
  (`@vladmandic/face-api`, detector de piscada, GPS, id do aparelho). Os modelos ficam em
  `public/models/face/`.
- Banco de horas: cálculo puro em `src/lib/ponto-banco.ts` (testes em `ponto-banco.test.ts`),
  hooks de banco e atestados em `src/lib/ponto-gestao.ts`.
- Banco (migrações 0019–0026 e 0038):
  - Tabelas: `ponto_config`, `ponto_biometria`, `ponto_batidas`, mais a view `ponto_dia` com almoço.
    0038: `ponto_banco_config`, `ponto_banco_ajustes`, `ponto_atestados`.
  - RPCs: `ponto_registrar`, `ponto_meu_status`, `ponto_quiosque_lista`, `ponto_revisar`,
    `ponto_lancar_manual`, `ponto_cadastrar_biometria`, `ponto_vincular_aparelho`,
    `ponto_freelancers_quiosque`. 0038: `ponto_banco_salvar_config`, `ponto_banco_lancar_ajuste`,
    `ponto_banco_excluir_ajuste`, `ponto_enviar_atestado`, `ponto_revisar_atestado`,
    `ponto_cancelar_atestado`.
  - As selfies ficam num bucket privado do storage, com policies em migração separada. Os
    atestados usam o mesmo bucket `ponto`, pasta `<uid>/atestados/` (sem bucket novo).
- Push `ponto_pendente` avisa o gestor; `ponto_atestado` avisa o gestor de atestado novo;
  `ponto_atestado_resposta` avisa o funcionário.
- Tela antiga `controle-ponto.tsx` + `pontomais.functions.ts`: sincronização com o Pontomais (legado).

## Estado atual
- Entregue e funcionando ("o ponto está ok"), já com o intervalo de almoço.
- Banco de horas, extras 50%/100% e atestado médico entregues (migração 0038).

- 21/10/2026: Flávio cadastrado no celular do gestor ficou com "aparelho diferente" e "sem
  localização". Correção na branch `fix/ponto-localizacao-aparelho` (0077): localização obrigatória a
  100 m das unidades e aparelho vinculado no primeiro uso.

- 23/10/2026: Flávio não conseguia bater por causa da prova de vida (piscar). Retirada na branch
  `fix/ponto-sem-prova-de-vida` (0079).

- 23/10/2026: o app publicado chamava `ponto_verificar_local`, mas a 0077 não estava aplicada no
  banco ("Could not find the function ... in the schema cache"). A **0080** é completa e independente
  (recria 0077 + 0079) e grava o endereço das unidades no servidor:
  Botafogo R. Estácio Coimbra, 80 (-22.951187, -43.186294); Ipanema R. Joana Angélica, 247
  (-22.980758, -43.204902), em `private.ponto_endereco_unidade()` e copiados para `ponto_config`.
  Se a conferência prévia falhar por função ausente ou rede, o app segue e o servidor confere.

## Ideias e pendências
- Ponto oficial (substituir o Pontomais): levantamento feito em 07/10/2026 (REP-P, Portaria 671).
  Rodrigo ainda decide; faltam as respostas sobre CNPJ das unidades, nº de CLT, e-CNPJ e 12x36.
- Gestão mensal (pedidos, espelho com ciência, noturno, alertas, fechamento, lembrete): branch
  `feat/ponto-gestao-mensal` (0088 + 0089), aguardando merge, migrações e publicação.
- Ainda não feito: modo offline; base legal do REP-P (só se o app virar o ponto oficial).
- Limpeza automática das selfies antigas (oferecida, não feita).
- Ponto oficial (REP-P): se virar oficial, a Portaria 671 proíbe restringir a marcação; o bloqueio
  por localização teria de voltar a ser pendência.
