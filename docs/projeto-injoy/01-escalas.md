# PROJETO INJOY — Escalas

Leia antes o `00-CONTEXTO-GERAL.md`.

## Regras do negócio (definidas pelo Rodrigo)
- **Camareira de Botafogo:** 12x36.
- **Camareira de Ipanema:** 5x2. As folgas nunca são sábado+domingo nem sexta+sábado juntos, e ela
  folga um domingo sim, um não.
- **Manutenção:** 5x2, com folga no sábado e no domingo.
- **Freelancers:** os valores são editáveis.
  - 8 h por R$ 150: reforço quando o hotel está cheio, ou seja, com muitas "gerais" (limpezas de
    checkout).
  - 12 h por R$ 200: cobre uma falta em Botafogo.
- **Aviso D+2:** a previsão de carga avisa com 2 dias de antecedência quando vai faltar gente e é
  bom chamar um reforço.

## Onde está no código
- Telas: `src/routes/_authenticated/gestor/escala.tsx` (gestor), `minha-escala.tsx` (funcionário)
  e `gestor/previsao-carga.tsx`.
- Componentes: `src/components/escala/*` (equipe-escala-dialog, escala-hoje-card, minha-escala-card).
- Lógica: `src/lib/escala.ts` (hooks), `src/lib/escala-engine.ts` (padrões e validação, com testes
  em `escala-engine.test.ts`), `src/lib/previsao-carga*.ts`.
- Banco (migrações 0010–0018):
  - Tabelas: `escala_colaboradores`, `escala_padroes`, `escala_dias`, `escala_meses`,
    `escala_alteracoes` (auditoria), `escala_freelance_modalidades`, `feriados`, `previsao_carga`,
    `previsao_carga_config`, `previsao_carga_alertas`.
  - RPCs: `escala_regenerar_mes`, `escala_publicar_mes`, `minha_escala_publicada`,
    `escala_sincronizar_financeiro`. Os dias de freelancer viram lançamento no Financeiro.
- Os dias editados à mão (`origem='manual'`) são preservados quando o mês é regerado.

## Estado atual
- Entregue: gerar, publicar e ver a própria escala; freelancers com integração ao Financeiro;
  previsão de carga D+2; correções da auditoria (0017/0018).

## Ideias e pendências
- (Rodrigo vai trazer os próximos ajustes nesta conversa.)
