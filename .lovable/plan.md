# Reformulação da Escala — base de dados e Equipe

## Objetivo

Substituir a equipe salva apenas no aparelho por uma estrutura persistente e segura, mantendo o visual atual da Escala. Nesta etapa, preparar todos os dados e refazer “Equipe da Escala”; **não alterar ainda os geradores automáticos nem suas regras**, conforme solicitado no arquivo.

## Banco e segurança

Criar, em uma migration única, as tabelas:

- `escala_colaboradores`: cadastro próprio da Escala, com vínculo opcional ao funcionário, setor, unidade, vínculo, turno, telefone e situação ativa.
- `escala_freelance_modalidades`: tabela editável de modalidades, horas e valores de freelancers, com responsável e data da última alteração.
- `escala_padroes`: histórico de padrões dos colaboradores fixos, incluindo data-base, horários, intervalo, folgas e vigência.
- `escala_dias`: plantões persistidos por pessoa, data e turno, incluindo ausências, substituição, origem e a cópia imutável das horas/valor contratados do freelancer.
- `escala_meses`: controle de rascunho/publicação por unidade, setor e competência.
- `escala_alteracoes`: auditoria das mudanças em plantões publicados, preenchida por trigger com valores anterior/novo, autor, data e motivo.
- `feriados`: feriados nacionais, estaduais do RJ e municipais do Rio, com 2026 e 2027 previamente cadastrados.

Regras estruturais:

- Conceder acesso técnico ao banco e ativar RLS em todas as tabelas.
- Nesta etapa, permitir leitura e escrita apenas a gestor/admin, usando a checagem de papel já adotada no projeto. A exceção de visualização por funcionários citada como “item 4.3” não aparece neste arquivo e fica reservada para a etapa de publicação/consulta da escala.
- Criar as unicidades e índices solicitados, incluindo pessoa+data+turno e unidade+setor+competência.
- Validar no banco setores, unidades, vínculos, turnos, tipos de padrão, status e motivos permitidos.
- Preservar o valor histórico do freelancer: alterações futuras na modalidade não atualizam plantões já lançados.

## Cadastro inicial — será gravado somente após aprovação deste plano

| Setor | Nome | Vínculo | Unidade | Padrão inicial | Vínculo encontrado em Funcionários |
|---|---|---|---|---|---|
| Manutenção | FLAVIO | Fixo | Ambas | 5x2 fixo; sábado e domingo | Sim |
| Recepção / manhã | Mayara Fagundes | Fixa | Ambas | 12x36 | Não |
| Recepção / manhã | Júlia Cristine | Fixa | Ambas | 12x36 | Não |
| Recepção / noite | Lucivaldo | Fixo | Ambas | 12x36 | Não |
| Recepção / noite | Mathaus Ramos | Fixo | Ambas | 12x36 | Não |
| Camareiras | GLEIDIANE MENDES | Fixa | Botafogo | 12x36 | Não |
| Camareiras | RAQUEL | Fixa | Botafogo | 12x36 | Não |
| Camareiras | LUCIENE CERQUEIRA | Freelance | Botafogo | Sem padrão | Não |
| Camareiras | MARIA | Fixa | Ipanema | 5x2 revezamento; quarta fixa, domingo/segunda alternados | Não |
| Camareiras | CRISTINA | Freelance | Ipanema | Sem padrão | Sim |

Também cadastrar as modalidades iniciais:

- **Reforço – hotel cheio**: reforço por ocupação, 8 horas, R$ 150,00, ambas as unidades.
- **Cobertura de falta**: cobertura de falta, 12 horas, R$ 200,00, Botafogo.

Não inventar horários. Os campos de entrada, saída e intervalo ficarão vazios até o gestor preencher. As datas-base dos pares 12x36 também serão solicitadas na edição antes de qualquer geração futura, evitando escolher arbitrariamente quem começa o ciclo.

A vinculação será feita comparando nomes sem acentos e sem diferença entre maiúsculas/minúsculas. A verificação atual encontrou apenas **Flavio** e **Cristina**; os demais serão cadastrados com vínculo vazio e exibidos ao gestor como “não vinculados”.

## Equipe da Escala

Substituir o modal atual por uma área “Equipe da Escala”, mantendo a linguagem visual existente:

- Lista organizada por setor e unidade, mostrando vínculo fixo/freelance, padrão, turno e horário.
- Cadastro e edição de colaborador, com seleção opcional de um funcionário já existente.
- Formulário adaptável ao padrão:
  - 12x36: data-base trabalhada e horários.
  - 5x2 fixo: exatamente dois dias de folga e horários.
  - 5x2 revezamento: folga fixa, segunda folga da semana sem domingo e domingo-base de folga.
  - 6x1: data-base/ciclo e horários, preparado para continuidade entre meses.
  - Freelancer: nome, unidade e telefone, sem valor no cadastro pessoal.
- Prévia de quatro semanas ao editar um padrão, calculada por datas corridas para deixar visíveis as folgas e validar a configuração.
- Área “Valores dos freelancers” para criar, editar, ordenar e desativar modalidades; mostrar última alteração e responsável.
- Inativar colaboradores/modalidades em vez de apagar registros que já tenham histórico.

## Migração dos dados deste aparelho

Ao abrir a Escala, se existir `injoy.escala.equipe.v1`:

- Mostrar uma única confirmação: “Importar equipe salva neste aparelho?”.
- Normalizar os dados antigos (`todas` → `Ambas`, nomes de setor/unidade/vínculo) e criar somente quem ainda não existir.
- Não sobrescrever cadastros já existentes no banco.
- Exibir o resultado da importação, incluindo itens ignorados ou não vinculados.
- Apagar a chave local somente depois de uma importação concluída; se o gestor recusar, apagar a chave após confirmação para não repetir o aviso.

## Organização do código

- Manter a rota e o calendário visual atuais.
- Separar tipos/cálculos de prévia, consultas e formulários em arquivos menores, evitando ampliar ainda mais a tela atual.
- Registrar a decisão arquitetural no projeto: a base oficial da Escala é o banco, e ciclos devem usar datas-base contínuas, nunca reiniciar no dia 1.
- Atualizar os tipos do banco automaticamente após a migration.

## Validação

- Confirmar que apenas gestor/admin acessa os cadastros e tabelas desta etapa.
- Testar criação, edição, inativação, vínculos e modalidades em Botafogo, Ipanema e Ambas.
- Testar que alterar uma modalidade não modifica valores já copiados para um plantão.
- Testar a importação do armazenamento local com duplicados e falha de conexão.
- Validar as prévias de quatro semanas atravessando fim de mês, inclusive 12x36 e 6x1.
- Conferir a tela em computador e celular e verificar a compilação.

## Fora desta etapa

- Não trocar a lógica dos botões “Gerar Escala Automática”.
- Não publicar escala para funcionários nem implementar a exceção de leitura ainda.
- Não alterar arrastar e soltar, PDF ou WhatsApp além de adaptá-los ao novo cadastro quando necessário para manter a tela funcionando.
