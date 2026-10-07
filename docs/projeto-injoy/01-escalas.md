# PROJETO INJOY — Escalas

Leia antes o `00-CONTEXTO-GERAL.md`.

## Regras do negócio (definidas pelo Rodrigo)
- **Camareira de Botafogo:** 12x36.
- **Camareira de Ipanema:** 5x2. As folgas nunca são sábado+domingo nem sexta+sábado juntos, e ela
  folga um domingo sim, um não.
- **Manutenção:** 5x2, com folga no sábado e no domingo. O Flavio divide a semana: 12 dias em Botafogo
  e 10 em Ipanema (dias da semana fixos + ajuste mensal para a proporção). Na manutenção não se usa
  freelancer nas folgas nem nos dias em que ele está na outra unidade; freelancer só pontual.
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
- Férias (PR #14; o Lovable aplicou como `0032_escala_ferias.sql`):
  - Tabela `escala_ferias` (pessoa, unidade, início, fim, freelancer, modalidade, horário, valor).
    O banco recusa dois períodos sobrepostos para a mesma pessoa.
  - Botão **Férias** na escala do gestor: lança, edita e cancela. Todos os dias do período viram
    `ferias` (manual, motivo "Férias"); a freelancer recebe `extra` (motivo "Cobertura de férias — Nome")
    só nos dias em que a pessoa trabalharia (vale o que já está na escala; o resto segue o padrão).
  - Cancelar devolve os dias ao padrão (origem `gerado`) e apaga a cobertura.
  - Semanas com férias/atestado/falta não entram nas regras de folga do revezamento; freelancers
    agora contam para o aviso "sem cobertura".
- Duas unidades (branch `feat/escala-flavio-duas-unidades`, migração `0034_escala_padrao_duas_unidades.sql`):
  - `escala_padroes` ganhou `dias_ipanema` (dias da semana em Ipanema), `proporcao_botafogo` e
    `proporcao_ipanema`. Cadastro com unidade "Ambas" mostra a opção "Trabalha nas duas unidades".
  - `distribuirUnidades` (motor) segue os dias da semana e troca o mínimo de dias, do fim do mês
    para o começo, para chegar à proporção. Folgas ficam na unidade principal.
  - Gerar o mês do setor gera Botafogo e Ipanema juntas quando há alguém dividido.
  - `escala_regenerar_mes` agora move o dia automático de unidade (antes ficava preso na antiga).
- Folgas como extra nas férias (branch `feat/escala-ferias-folgas-extra`, migração `0035_escala_ferias_folgas_extra.sql`):
  - Opção no lançamento de férias: nas folgas dela a própria pessoa trabalha como extra (motivo
    "Extra nas férias — folga de X", vai para o Financeiro) e a freelancer folga.
  - Ao lançar férias, os plantões "Cobertura de folga" da freelancer para essa pessoa no período são
    removidos, e essas datas contam como folga da pessoa (corrige a Cristina sem folga em out/2026).
- Avisos e valores (branch `fix/escala-avisos-valores`, sem migração):
  - Avisos só do setor e unidade abertos e do mês exibido; Ipanema não gera "recepção sem cobertura".
  - Valores pagos a freelancers escondidos no calendário e no resumo; botão "Mostrar valores"
    (lembrado por aparelho). Funcionários não veem valores: escala_dias, modalidades, férias e
    Financeiro são só gestor/admin (RLS) e `minha_escala_publicada` não devolve valor.
- Distribuição em blocos (branch `feat/escala-flavio-blocos`, migração `0036_escala_padrao_distribuicao.sql`):
  - Cadastro "Trabalha nas duas unidades" ganhou a opção **Em blocos**: os N primeiros dias de trabalho do
    mês (campo "Dias em Botafogo") ficam em Botafogo e o resto em Ipanema; folgas em Botafogo. Out/2026
    do Flavio: 01–16 Botafogo (12) e 19–30 Ipanema (10). Coluna `escala_padroes.distribuicao` ('semana'|'bloco').
- Vale alimentação e transporte (branch `feat/escala-vale-beneficios`, sem migração):
  - Botão **Vale alimentação e transporte** na Escala (gestor): quadro do mês por funcionário fixo ativo, com
    subtotal por setor e total geral. VA R$ 385,00 por mês (cheio, não muda com férias/faltas); VT R$ 18,80 por
    dia com trabalho ou extra na escala (folga, férias, atestado e falta não contam). Freelancers ficam de fora.
    Valores editáveis na tela (salvos só no aparelho). Código em `src/lib/escala-beneficios.ts` (com testes).
- VA/VT no Financeiro, planilha, PDF e avisos (branch `feat/escala-vale-extras`, migração `0037_escala_beneficios_financeiro.sql`):
  - Quadro do VA/VT ganhou: **Baixar planilha (Excel/CSV)**, **Baixar PDF**, **Lançar no Financeiro**, campo
    **Valor separado no mês** (aviso vermelho se o total passar; salvo só no aparelho) e aviso amarelo de fixos
    sem escala gerada. O botão da Escala mostra "acima do separado" e "N sem escala".
  - RPC `escala_lancar_beneficios(_competencia, _itens)`: um lançamento *previsto* por pessoa, benefício e
    unidade (VA na unidade da pessoa; VT por unidade pelos dias trabalhados em cada uma). Idempotente: atualiza
    o que não está pago, não mexe no pago e cancela previstos que saíram do cálculo. Usa a coluna nova
    `fin_lancamentos.origem_beneficio` (não `origem_escala`, para a sincronização dos freelancers não cancelar).
    Cria as categorias "Vale alimentação" e "Vale transporte" (grupo pessoal) se não existirem.
- Fixo como extra (branch `feat/escala-fixo-como-extra`, sem migração): o botão **+ Freelancer** de um dia
  agora também lista os fixos do setor que estão de **folga** nesse dia (em qualquer unidade). Escolher um fixo
  transforma a folga dele em dia `extra` pago (valor/horas editáveis; vai para o Financeiro como os freelancers e
  conta VT). Para desfazer: editar o dia e voltar para Folga.

## Ideias e pendências
- (Rodrigo vai trazer os próximos ajustes nesta conversa.)
