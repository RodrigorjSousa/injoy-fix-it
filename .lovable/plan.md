# Módulo Financeiro da Área do Gestor

## Objetivo
Substituir o placeholder de `/gestor/financeiro` por um módulo completo de lançamentos, fornecedores, categorias e exportação, disponível exclusivamente para usuários com papel `gestor` ou `admin`.

## Segurança e dados
- Criar `fin_categorias`, `fin_fornecedores`, `fin_lancamentos` e `fin_config` com validações, relacionamentos, índices e datas de criação/atualização.
- Conceder acesso técnico às tabelas apenas para usuários autenticados e serviço interno; ativar RLS e aplicar políticas de leitura, inclusão, edição e exclusão exigindo `gestor` ou `admin` pela função segura de papéis já existente.
- Criar as categorias padrão do briefing no mesmo versionamento inicial, sem duplicá-las em futuras aplicações.
- Criar a configuração única de rateio com 61,3% para Botafogo e 38,7% para Ipanema, editável somente por gestor/admin.
- Criar o armazenamento privado `financeiro` para comprovantes, com políticas restritas a gestor/admin e visualização por link temporário.
- Garantir que funcionários comuns não consigam consultar tabelas, arquivos nem operações do módulo, mesmo digitando URLs ou fazendo chamadas diretas.

## Tela Financeiro
- Manter a página dentro da Área do Gestor e substituir “Em construção” pela experiência real.
- Criar navegação por abas: **Lançamentos**, **Fornecedores**, **Categorias** e **Exportar**.
- Em Lançamentos, incluir filtros por competência, unidade, categoria, status e texto, com mês atual como padrão.
- Exibir cards no celular e tabela no computador, mostrando vencimento, descrição, categoria, fornecedor, unidade, valor e situação.
- Calcular “Vencido” em tempo real quando estiver a pagar e a data já tiver passado.
- Mostrar totais do filtro: total, pago, a pagar e vencido; no modo por unidade, ratear lançamentos de “Ambas” conforme a configuração.

## Cadastro e ações de lançamentos
- Criar formulários completos para **Nova despesa** e **Nova receita**, com edição e exclusão confirmada.
- Exibir campos condicionais:
  - consumo e unidade para Água e Energia;
  - funcionário para Salários;
  - nome e quantidade de diárias para Freelancers;
  - equipamento/local para despesas de manutenção.
- Permitir comprovante por câmera, galeria ou arquivo, incluindo PDF, reaproveitando a captura e compressão existentes quando aplicável.
- Permitir visualizar o comprovante por link temporário.
- Adicionar ações rápidas para marcar como pago, informando data e forma, e duplicar para o mês seguinte.
- Validar competência no primeiro dia do mês, valor positivo e combinações coerentes de situação e pagamento.

## Fornecedores, categorias e rateio
- Implementar cadastro, edição e desativação de fornecedores, incluindo documento, contato, telefone, PIX, observações e categoria padrão.
- Implementar criação, renomeação, ordenação e desativação de categorias.
- Impedir a exclusão física de categorias usadas em lançamentos; categorias inativas permanecem no histórico.
- Disponibilizar a edição do rateio Botafogo/Ipanema, exigindo total de 100%.

## Exportação e apresentação
- Exportar o filtro atual em CSV e PDF, respeitando competência, unidade, categoria, situação, busca, totais e rateio.
- Usar moeda brasileira, datas `dd/mm/aaaa` e horário de São Paulo.
- Exibir mensagens claras para falhas de leitura, gravação, arquivo e exportação, sem deixar a tela em branco.
- Manter o card Financeiro do hub apontando para a página funcional e retirar qualquer indicação de placeholder.

## Detalhes técnicos
- Aplicar a estrutura do banco por migration e regenerar os tipos automaticamente.
- Consultas e alterações serão feitas com a sessão autenticada, respeitando RLS; nenhuma operação comum usará acesso privilegiado.
- Organizar a implementação em componentes e utilitários financeiros focados, evitando concentrar toda a tela em um único arquivo.
- Registrar a nova regra estrutural de segurança financeira em `AGENTS.md` e acompanhar a entrega em `roadmap.md`.

## Verificação
- Testar como gestor/admin: filtros, rateio, criação, edição, pagamento, duplicação, exclusão, anexos, fornecedores, categorias, configuração e exportações.
- Testar como funcionário comum: acesso à rota, tabelas e arquivos deve ser negado.
- Confirmar regras condicionais dos formulários, vencidos, totais e rateio nos modos Botafogo, Ipanema e Consolidado.
- Verificar a experiência em computador e celular, erros de execução e compilação final.
