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
- Revezamento corrigido (PR #13, sem migração):
  - O 5x2 revezamento agora usa um ciclo de 14 dias que começa no domingo de folga (semanas de
    domingo a sábado), igual à prévia do cadastro. Antes o gerador usava semanas de segunda a domingo
    e, com a folga fixa na quarta e a segunda folga na segunda, criava 6 dias seguidos.
  - `resolveRevezamento` confere as regras (domingo sim/não, 2 folgas por semana, sem sexta+sábado
    ou sábado+domingo, no máximo 5 dias seguidos). Se o cadastro quebrar alguma, escolhe as folgas
    válidas mais próximas e o cadastro mostra o aviso. A prévia do cadastro usa o mesmo motor.
  - A validação ganhou o erro `max_5_days`, e a contagem de 2 folgas passou a ser de domingo a sábado.
  - Botão **Cobrir folgas com freelancer** (ex.: Cristina nas folgas da Maria): cria dias `extra`
    manuais (vão para o Financeiro) e remove coberturas antigas em dias que deixaram de ser folga.
- Férias (branch `feat/escala-ferias`, migração `0033_escala_ferias.sql`):
  - Tabela `escala_ferias` (pessoa, unidade, início, fim, freelancer, modalidade, horário, valor).
    O banco recusa dois períodos sobrepostos para a mesma pessoa.
  - Botão **Férias** na escala do gestor: lança, edita e cancela. Todos os dias do período viram
    `ferias` (manual, motivo "Férias"); a freelancer recebe `extra` (motivo "Cobertura de férias — Nome")
    só nos dias em que a pessoa trabalharia (vale o que já está na escala; o resto segue o padrão).
  - Cancelar devolve os dias ao padrão (origem `gerado`) e apaga a cobertura.
  - Semanas com férias/atestado/falta não entram nas regras de folga do revezamento; freelancers
    agora contam para o aviso "sem cobertura".

## Ideias e pendências
- (Rodrigo vai trazer os próximos ajustes nesta conversa.)
