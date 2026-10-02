# Finalização do módulo de Escala

## Objetivo
Concluir a Escala dentro da Área do Gestor, com publicação auditável, exportações reais, consulta pessoal, cobertura diária e integração financeira sem duplicações.

## O que será construído

1. **Novo endereço e navegação**
   - Mover a tela para `/gestor/escala`.
   - Manter `/escala` como redirecionamento para preservar atalhos antigos.
   - Atualizar o card da Área do Gestor e o menu.

2. **Publicação e alterações auditadas**
   - Publicar separadamente por mês, unidade e setor.
   - Exibir erros antes da publicação e exigir justificativa para publicar com erro vermelho.
   - Notificar cada colaborador vinculado a um login quando a escala for publicada.
   - Registrar alterações após a publicação e notificar apenas os colaboradores afetados.

3. **PDF e WhatsApp**
   - Gerar PDF em paisagem, com grade mensal por pessoa, legenda, feriados, assinatura e data; uma página por unidade.
   - Compartilhar no WhatsApp a escala real resumida por pessoa.
   - Permitir compartilhar somente a escala de uma pessoa usando o telefone cadastrado.

4. **Minha Escala**
   - Criar um card reutilizável com os próximos 14 dias, horários, folgas e feriados.
   - Exibi-lo no Painel e na tela inicial dos funcionários.
   - Manter a consulta somente leitura e limitada à própria escala publicada, sem valores financeiros.

5. **Quem trabalha hoje**
   - Adicionar no início da Área do Gestor uma visão por unidade, setor e turno.
   - Destacar em vermelho setores sem cobertura hoje ou amanhã.

6. **Financeiro**
   - Consolidar cada freelancer em um único lançamento mensal por unidade.
   - Somar os valores combinados de cada plantão e detalhar modalidades e quantidades.
   - Atualizar o mesmo lançamento quando a escala mudar, sem duplicar.
   - Preservar lançamentos pagos e mostrar divergências, plantões sem valor e faltas descobertas nos alertas.

7. **Preparação para o ponto**
   - Criar uma visão diária segura com escala prevista, horários e situação, pronta para a próxima fase.

## Detalhes técnicos
- Mudanças estruturais serão aditivas e aplicadas por migração.
- Publicação, auditoria e sincronização financeira ficarão em operações atômicas e protegidas para gestor/admin.
- As notificações reutilizarão a infraestrutura Web Push existente e removerão inscrições expiradas.
- A consulta do funcionário continuará por função segura, sem expor diárias, valores ou colegas.
- A validação final cobrirá testes automatizados, compilação e os fluxos principais em telas grandes e pequenas.
