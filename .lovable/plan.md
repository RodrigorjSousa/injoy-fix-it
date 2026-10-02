# Continuação do módulo Financeiro

## Objetivo
Completar `/gestor/financeiro` com contas recorrentes, visão gerencial mensal, indicadores operacionais e alertas, mantendo acesso exclusivo a gestor/admin e o armazenamento financeiro privado.

## Banco e segurança
- Criar `fin_recorrencias` para modelos mensais, com categoria, fornecedor, unidade, valor previsto, vencimento, pagamento, indicação de valor variável e situação ativa.
- Ajustar `fin_lancamentos.recorrencia_id` para relacionar o lançamento ao modelo recorrente e garantir unicidade por recorrência e competência.
- Criar `fin_indicadores_mes`, único por unidade e competência, para diárias vendidas, receita de hospedagem, ocupação e observações.
- Criar a função `fin_gerar_mes(competencia)`, validando gestor/admin no banco, gerando somente contas ausentes e calculando vencimentos com segurança para meses curtos.
- Aplicar permissões e políticas restritas a gestor/admin em todas as novas estruturas.

## Financeiro
- Abrir na aba **Painel**, com filtros de mês e unidade.
- Exibir receita, despesa, resultado, margem, próximos vencimentos e vencidas.
- Adicionar gráficos de despesas por grupo, receita x despesa dos últimos 12 meses e consumo mensal de energia/água.
- Exibir comparação do custo operacional com o mês anterior e destacar aumentos acima de 15%.
- Permitir preencher os indicadores mensais e calcular custos por diária, consumo por diária, lavanderia por diária e peso de pessoal na receita.
- Adicionar a aba **Recorrentes**, com cadastro, edição e ativação/desativação.
- Em **Lançamentos**, oferecer “Gerar contas do mês” e aviso quando o mês ainda não tiver sido gerado.
- Manter fornecedores, categorias, exportações, comprovantes e ações já existentes.

## Alertas
- Substituir “Nenhum alerta” no hub do gestor por contas vencidas e contas a vencer em até três dias, com acesso direto ao Financeiro.
- Criar uma chamada pública protegida por segredo para enviar notificações aos gestores/admins.
- Agendar a chamada diariamente às 08:00 de Brasília, reaproveitando o envio de notificações já existente e evitando reenvios no mesmo dia.

## Verificação
- Confirmar geração idempotente em meses diferentes e vencimentos nos dias 28–31.
- Testar cadastro/edição de recorrência e indicadores, filtros, rateio e cálculos do painel.
- Verificar os três gráficos, alertas do hub, celular e computador.
- Confirmar políticas de acesso, compilação e ausência de dados temporários.
