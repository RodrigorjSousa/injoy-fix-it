# Área exclusiva do Gestor e proteção de rotas

## Objetivo
Criar uma área central em `/gestor` e impedir que funcionários abram telas administrativas digitando a URL, preservando apenas as liberações individuais e regras de papel já existentes.

## Guarda de acesso reutilizável
- Criar um helper único que valide o usuário autenticado consultando `user_roles` e, quando necessário, `funcionarios.telas_permitidas`.
- Considerar `gestor` e `admin` como gestores, mantendo a regra atual do aplicativo.
- Disponibilizar dois modos:
  - **Somente gestor:** nenhum funcionário poderá entrar, mesmo com uma tela marcada em EQUIPE.
  - **Gestor ou acesso permitido:** aceitar gestor/admin, permissão individual em `telas_permitidas` ou a regra de papel já existente para aquela tela.
- Ao negar acesso, redirecionar para `/` e mostrar “Acesso restrito aos gestores”, sem renderizar o conteúdo protegido.
- Aplicar o modo **somente gestor** em: Gestão, Controle de Ponto, Histórico do Caixa, Histórico de Limpeza, Histórico de Manutenção, Histórico de Vistorias, Relatórios de Turno, Relatório de Operações, Equipe/Configurações, Gestão de Boas-vindas e Escala.
- Aplicar o modo **gestor ou acesso permitido** em: Almoxarifado, Estoque Geral, Frigobar, Bonificação, Check-in Digital e Preventiva AC.
- Preservar as exceções atuais: recepção no Almoxarifado, técnico de ar-condicionado na Preventiva AC e os acessos individuais configurados em EQUIPE, incluindo Bonificação.

## Nova Área do Gestor
- Criar um layout protegido em `/gestor`, com cabeçalho “Área do Gestor” e seletor de unidade.
- Manter Botafogo e Ipanema no seletor global e oferecer **Consolidado** apenas dentro da Área do Gestor, sem gravar esse valor incompatível no contexto global.
- Criar a página inicial com uma faixa de alertas exibindo “Nenhum alerta”.
- Organizar os atalhos em seções:
  - **Operação:** Painel de Gestão, Lavanderia, Preventiva AC, Almoxarifado, Estoque Geral, Frigobar, Check-in Digital e Boas-vindas.
  - **Equipe:** Equipe, Escala, Controle de Ponto e Bonificação.
  - **Históricos e Relatórios:** Limpeza, Manutenção, Vistorias, Caixa e Relatórios de Turno.
  - **Financeiro:** atalho para `/gestor/financeiro`.
  - **Conformidade:** “Licenças e Vistorias Obrigatórias”, marcado como “Em breve” e sem navegação.
- Criar `/gestor/financeiro` protegido, com a mensagem “Em construção”.
- Usar o estilo visual dos cartões atuais da Gestão, sem alterar o visual ou funcionamento das telas existentes.
- Incluir título, descrição e metadados próprios nas duas páginas novas.

## Navegação
- Renomear o grupo “ADMINISTRADOR” para “ÁREA DO GESTOR”.
- Inserir “Início da Área” (`/gestor`) como primeiro item e manter os links administrativos atuais em seguida.
- No celular, priorizar “Gestor” entre os quatro atalhos inferiores para gestor/admin.
- Confirmar que as rotas dentro da subpasta `gestor/` não entram no catálogo de telas liberáveis. O catálogo atual lê somente arquivos `.tsx` diretamente em `_authenticated`, portanto a Área do Gestor continuará impossível de liberar a funcionários.

## Revisão de segurança do banco — sem alterações nesta fase
A revisão das políticas atuais encontrou:

### Leitura ampla para qualquer usuário autenticado
- `recepcao_caixa_movimentos`: possui políticas com condição `true`, incluindo uma política `ALL`; qualquer autenticado consegue ler todas as movimentações.
- `registros_bonificacao`: a política de leitura usa condição `true`; qualquer autenticado consegue ler todos os registros.

### Leitura já limitada por papel ou vínculo
- `registro_ponto_pontomais`: gestor/admin vê tudo; funcionário vê apenas os próprios registros.
- `room_inspections`: leitura para gestor, recepção e camareira.
- `trocas_turno`: leitura pelo funcionário envolvido, gestor/admin ou recepção.
- `reservation_payments`: gestor/admin vê tudo; o usuário que recebeu vê o próprio registro.
- `beverage_sales`: leitura para gestor/admin ou recepção.

Nesta entrega, essas políticas não serão modificadas para não interromper os fluxos operacionais. A proteção de rota bloqueará as páginas, mas o endurecimento completo dos dados deverá tratar separadamente as duas políticas amplas acima.

## Verificação
- Testar gestor/admin acessando `/gestor`, todas as telas exclusivas e o placeholder Financeiro.
- Testar funcionário comum digitando diretamente cada URL exclusiva e confirmar redirecionamento com aviso.
- Testar funcionários com permissões individuais e regras de papel nas seis telas compartilháveis.
- Confirmar que `/gestor` não aparece em EQUIPE e nunca pode ser concedida.
- Verificar menu lateral e barra inferior em computador e celular.
- Confirmar que o aplicativo compila sem erros após todas as guardas e novas rotas.
