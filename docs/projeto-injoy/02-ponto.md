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

## Onde está no código
- Telas: `src/routes/_authenticated/ponto.tsx` (bater ponto/quiosque) e `gestor/ponto.tsx`, com as
  abas Pendências, Relatório, Pessoas, Cadastro facial e Configurações.
- Componentes: `src/components/ponto/*` (face-capture, pendencias-ponto, relatorio-ponto,
  cadastro-facial, config-ponto, pessoas-ponto).
- Lógica: `src/lib/ponto.ts` (TipoBatida, hooks) e `src/lib/ponto-face.ts`
  (`@vladmandic/face-api`, detector de piscada, GPS, id do aparelho). Os modelos ficam em
  `public/models/face/`.
- Banco (migrações 0019–0026):
  - Tabelas: `ponto_config`, `ponto_biometria`, `ponto_batidas`, mais a view do dia com almoço.
  - RPCs: `ponto_registrar`, `ponto_meu_status`, `ponto_quiosque_lista`, `ponto_revisar`,
    `ponto_lancar_manual`, `ponto_cadastrar_biometria`, `ponto_vincular_aparelho`,
    `ponto_freelancers_quiosque`.
  - As selfies ficam num bucket privado do storage, com policies em migração separada.
- Push `ponto_pendente` avisa o gestor.
- Tela antiga `controle-ponto.tsx` + `pontomais.functions.ts`: sincronização com o Pontomais (legado).

## Estado atual
- Entregue e funcionando ("o ponto está ok"), já com o intervalo de almoço.

## Ideias e pendências
- Limpeza automática das selfies antigas (oferecida, não feita).
