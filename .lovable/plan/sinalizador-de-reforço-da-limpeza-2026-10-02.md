# Sinalizador de Reforço da Limpeza

## Objetivo
Prever a carga de limpeza por unidade para os próximos sete dias, avisar gestores com dois dias de antecedência e permitir abrir a escala diretamente para chamar um freelancer.

## O que será construído

### 1. Previsão diária sem alterar o painel atual
- Isolar a regra atual que classifica cada quarto em **GERAL**, **GERAL - CHECK-IN**, **TROCA + ARRUMAÇÃO**, **ARRUMAÇÃO** ou **REVISÃO**.
- Reutilizar exatamente essa regra para qualquer data, mantendo o resultado de hoje inalterado nas telas de Camareiras e Recepção.
- Consultar o Cloudbeds separadamente por unidade e calcular os próximos sete dias.
- Guardar cada cálculo como um novo retrato histórico, incluindo quantidades, quartos, horários de chegada, carga, capacidade e nível.

### 2. Tempos e capacidade
- Calcular a mediana dos últimos 60 dias por tipo de limpeza e unidade, desconsiderando execuções menores que 5 minutos ou maiores que 3 horas.
- Usar o histórico apenas quando houver pelo menos 20 registros; caso contrário, usar os padrões: Geral 45 min, Geral com check-in 50 min, Troca + Arrumação 30 min e Arrumação 20 min.
- Criar configurações editáveis por unidade para substituir os tempos, definir a margem operacional e ajustar os limites do semáforo.
- Calcular a capacidade pelas camareiras em trabalho e freelancers da Escala, descontando intervalo e margem. Faltas, atestados, férias e folgas não entram.

### 3. Semáforo e alertas
- Aplicar os níveis verde, amarelo e vermelho pela relação carga/capacidade e quantidade de gerais.
- Usar inicialmente os limites indicados no documento: **Botafogo 6/8** e **Ipanema 4/6** para amarelo/vermelho.
- Enviar alerta aos gestores para D+2 no cálculo da manhã quando amarelo/vermelho, repetir somente se o nível mudar e lembrar no D+1 às 17h quando continuar vermelho sem freelancer.
- Registrar a deduplicação para nunca repetir o mesmo aviso de dia e nível.

### 4. Tela Previsão de Carga
- Criar uma página protegida na Área do Gestor com grade de sete dias por unidade.
- Exibir semáforo, gerais, gerais com check-in, trocas, arrumações, camareiras, capacidade e carga percentual.
- Abrir um detalhe por dia com quartos, tarefas, chegada mais cedo e memória do cálculo da capacidade.
- Incluir **Recalcular agora** e **Chamar freelancer**, abrindo a Escala na data e unidade corretas, com a modalidade de reforço já selecionada.
- Adicionar um resumo no início da Área do Gestor e o aviso de que mudanças nas reservas podem alterar a previsão.

### 5. Aprendizado e relatório
- Registrar para cada unidade/dia a previsão feita em D+2, contratação de reforço, gerais realizadas e tempo real de limpeza.
- Criar relatório mensal com acertos, falsos alarmes, dias pesados não previstos e uma sugestão de ajuste dos limites.

## Segurança e operação
- Somente gestor/admin poderá ver previsões, alterar configurações, recalcular e consultar o relatório.
- As consultas ao Cloudbeds e gravações acontecerão no servidor; credenciais nunca irão para a tela.
- O cálculo automático ocorrerá às **07h, 12h e 17h de Brasília**: três execuções diárias, necessárias para acompanhar novas reservas e cancelamentos, com atualização máxima de cinco horas entre rodadas.

## Validação
- Comparar a classificação de hoje antes e depois para provar que o painel atual não mudou.
- Testar capacidade com trabalho, falta, atestado, férias e freelancer.
- Validar alertas D+2, mudança de nível, lembrete D+1 e ausência de duplicação.
- Conferir a página e o fluxo de chamar freelancer no computador e celular.
