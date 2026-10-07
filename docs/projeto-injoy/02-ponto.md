# PROJETO INJOY — Marcação de ponto

Leia antes o `00-CONTEXTO-GERAL.md`.

## Regras do negócio
- Ponto próprio, com **reconhecimento facial** no celular da empresa. Existe também o ponto oficial
  obrigatório (Pontomais), que é separado.
- **4 batidas por dia:** entrada, saída para o almoço, volta do almoço e saída.
- Batida fora do raio de **100 m**, com rosto que não confere ou aparelho desconhecido **é
  registrada como pendente** e vai para o gestor aprovar ou recusar.
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
- Banco de horas, extras 50%/100% e atestado médico: branch `feat/ponto-banco-horas`
  (migração 0038), aguardando merge, aplicação da migração no Lovable e publicação.

## Ideias e pendências
- Ponto oficial (substituir o Pontomais): levantamento feito em 07/10/2026 (REP-P, Portaria 671).
  Rodrigo ainda decide; faltam as respostas sobre CNPJ das unidades, nº de CLT, e-CNPJ e 12x36.
- Funcionário ver o próprio saldo do banco no app (ainda só o gestor vê).
- Adicional noturno (22h–5h) e fechamento do mês: não feitos.
- Limpeza automática das selfies antigas (oferecida, não feita).
