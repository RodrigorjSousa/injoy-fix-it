# Gerador, validador e publicação da Escala

## Objetivo

Concluir a segunda etapa da Escala usando os cadastros persistentes já criados. O calendário continuará com o visual atual, mas geração, edições, trocas, freelancers, publicação, resumos e impressão passarão a usar os registros oficiais, sem reiniciar ciclos na virada do mês ou ano.

## Motor de escala

Criar `src/lib/escala-engine.ts`, sem React e sem acesso ao banco, com funções puras para:

- trabalhar somente com datas civis `YYYY-MM-DD` da operação em São Paulo, evitando diferenças causadas pelo fuso do aparelho;
- gerar os dias de cada colaborador fixo a partir do padrão vigente e de sua `data_base`;
- manter continuidade para datas anteriores e posteriores à data-base;
- implementar 12x36 por paridade de dias, 5x2 fixo pelos dias semanais, 6x1 pelo ciclo contínuo de sete dias e 5x2 revezamento em semanas de segunda a domingo;
- não gerar plantões automáticos para freelancers;
- calcular horário de saída de freelancer a partir da entrada e das horas contratadas;
- produzir os resumos mensais por pessoa e por modalidade de freelancer.

No 5x2 revezamento, a data-base será o domingo de folga da semana A. A semana A terá domingo + folga fixa; a semana B terá folga fixa + `folga_semana_b`. Isso reproduzirá exatamente o exemplo de setembro a novembro de 2026 informado no arquivo.

## Validador

O mesmo motor avaliará a escala completa, incluindo dias adjacentes ao mês para não perder violações na virada:

**Erros, exibidos em vermelho:**

- sexta e sábado consecutivos de folga para camareira 5x2 revezamento;
- sábado e domingo consecutivos de folga para camareira 5x2 revezamento;
- semana do revezamento sem exatamente duas folgas ou alternância de domingos quebrada;
- mais de seis dias consecutivos de trabalho;
- dois plantões consecutivos em 12x36;
- menos de 11 horas entre turnos de 5x2 e 6x1.

Um erro exigirá confirmação explícita e motivo obrigatório antes de salvar a exceção. O motivo ficará no plantão e, quando o mês estiver publicado, também no histórico da alteração.

**Alertas, exibidos em amarelo:**

- camareiras sem cobertura em cada unidade;
- recepção sem manhã ou sem noite;
- feriado trabalhado em 5x2 ou 6x1;
- alteração manual feita depois da publicação.

Os avisos aparecerão num painel lateral com acesso direto ao dia. Avisos de falta de cobertura oferecerão “Escalar freelancer” já filtrado pela unidade.

## Persistência e geração mensal

Adicionar operações de consulta e gravação para `escala_dias` e `escala_meses`:

- carregar o mês selecionado e também dias limítrofes necessários ao validador;
- “Gerar escala do mês” cria ou substitui somente linhas com origem `gerado`;
- linhas manuais — faltas, atestados, férias, trocas, horários ajustados e freelancers — nunca serão apagadas pela regeneração;
- quando já houver dados automáticos, confirmar “Regerar só os dias automáticos?”;
- registrar o mês como rascunho na primeira geração;
- publicar por unidade e setor, guardando responsável e horário;
- toda edição, inclusive arrastar e soltar, grava imediatamente com origem `manual`, responsável e motivo quando necessário.

Para manter a operação consistente e reduzir atualizações parciais, a geração/regeneração e a publicação serão feitas por funções protegidas do banco, disponíveis apenas a gestor/admin.

## Tela da Escala

Preservar abas, calendário, cores e arrastar e soltar, acrescentando:

- seletor de unidade: Botafogo, Ipanema e Ambas;
- alternância entre **Calendário** e **Grade por pessoa**;
- grade com pessoas nas linhas, dias nas colunas e códigos `T`, `F`, `FT`, `AT`, `FE`, destacando fins de semana e feriados;
- clique no dia para marcar trabalho, folga, falta, atestado, férias, troca, horário e observação;
- publicação por setor/unidade e indicação clara de rascunho ou publicada;
- impressão/PDF baseada na grade e nos dados persistidos;
- WhatsApp baseado na escala salva, não apenas na lista da equipe;
- resumo mensal por pessoa: trabalhados, folgas, domingos de folga e faltas;
- resumo mensal de freelancers por unidade e modalidade, com quantidade, horas e valor.

## Chamar freelancer

Criar um fluxo próprio para plantões manuais:

- listar somente freelancers ativos compatíveis com a unidade;
- mostrar modalidades ativas em botões grandes, sempre lendo horas e valor cadastrados;
- se houver falta ou atestado no dia, pré-selecionar “Cobertura de falta” e a pessoa substituída; caso contrário, sugerir “Reforço – hotel cheio”;
- permitir ajustar entrada, horas e valor apenas naquele plantão, calcular a saída e exigir observação quando houver exceção relevante;
- copiar modalidade, motivo, horas e valor para `escala_dias`, preservando o histórico mesmo se a modalidade mudar depois;
- após marcar falta de camareira, oferecer imediatamente a cobertura por freelancer;
- mostrar horas e valor do freelancer no calendário apenas para gestor/admin.

## Consulta pelo funcionário e segurança

Manter escrita e valores financeiros exclusivos de gestor/admin. Liberar leitura somente da escala **publicada** para funcionários vinculados em `escala_colaboradores.funcionario_id`, limitada aos próprios plantões e sem modalidades/valores de freelancers. A tela administrativa continuará protegida; a consulta do funcionário será uma visualização somente leitura acessível pelo painel, sem permitir alterações.

## Testes e validação

Criar testes automatizados do motor para:

- 12x36 nas viradas 31/10 → 01/11 e 31/12 → 01/01;
- manutenção 5x2 sem trabalho em sábados e domingos;
- 5x2 revezamento reproduzindo todas as folgas do exemplo fornecido;
- erros de sexta+sábado, sábado+domingo e sete dias consecutivos;
- preservação de linhas manuais ao regenerar;
- intervalos mínimos entre turnos e cálculo de saída do freelancer.

Validar ainda criação, regeneração, edição, troca, arrastar, freelancer, publicação, leitura do funcionário, impressão e resumos em Botafogo, Ipanema e Ambas, no computador e celular.
