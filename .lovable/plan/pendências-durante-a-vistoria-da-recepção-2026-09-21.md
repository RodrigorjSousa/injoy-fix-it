# Pendências durante a Vistoria da Recepção

## Objetivo
Permitir que a recepção registre uma pendência encontrada durante a vistoria, acione imediatamente a equipe responsável e só libere o quarto após a resolução.

## Fluxo na vistoria
1. Adicionar a pergunta **“Existe alguma pendência?”** antes da conclusão do checklist.
2. Quando houver pendência, permitir escolher:
   - **Camareira**: registrar o problema para o quarto e avisar as camareiras.
   - **Manutenção**: escolher a categoria e o técnico responsável, abrir um chamado marcado como urgente e avisá-lo.
3. Exibir a pendência aberta dentro da própria vistoria, com equipe, descrição, responsável e horário.
4. Bloquear **“Salvar e Liberar Quarto”** enquanto existir pendência aberta.
5. Disponibilizar **“Pendência resolvida”** para a recepção confirmar a solução, voltar ao checklist e concluir a vistoria.

## Persistência e acompanhamento
- Criar um registro próprio de pendências de vistoria, ligado à unidade e ao quarto.
- Guardar quem abriu, quem foi acionado, quando foi resolvida e quem confirmou a resolução.
- Pendências de camareira usarão também o fluxo atual de recados; pendências de manutenção usarão o fluxo atual de chamados urgentes.
- Manter atualização em tempo real para a vistoria refletir a resolução sem precisar recarregar a tela.

## Regras
- A foto e todos os itens do checklist continuam obrigatórios.
- Uma vistoria com pendência aberta nunca libera o quarto.
- A conclusão só ocorre depois da confirmação explícita de que todas as pendências foram resolvidas.
- A solução vale para Botafogo e Ipanema.

## Implementação técnica
- Nova tabela protegida para pendências da vistoria, com permissões apenas para usuários autenticados envolvidos no processo e gestores.
- Atualização do modal de vistoria para criar, acompanhar e resolver pendências.
- Reutilização das notificações existentes de recados e chamados, sem duplicar os fluxos atuais.
- Validação final na interface da Recepção em tela grande e celular.
