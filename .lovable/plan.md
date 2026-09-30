# Separar bonificação da Recepção e das Camareiras

## Objetivo
Dividir a aba **BONIFICAÇÃO** em dois controles independentes por unidade:
- **Recepção:** nota geral + nota dos funcionários.
- **Camareiras:** nota geral + nota de limpeza.

## Alterações
- Adicionar ao registro o setor da avaliação (`Recepção` ou `Camareiras`) e a nota de limpeza.
- Preservar todos os registros atuais como bonificação da Recepção.
- Criar duas áreas bem identificadas na tela, cada uma com saldo, formulário e histórico próprios.
- No formulário das Camareiras, substituir “Nota Funcionários” por “Nota Limpeza”.
- Aplicar a mesma regra financeira já configurada: as duas notas são avaliadas juntas, com bônus de elogio nominal.
- Separar também os relatórios mensais e os totais por setor, sem misturar os valores.
- Exibir o tipo da bonificação nos históricos e manter exclusão restrita a gestor/administrador.

## Segurança e consistência
- Validar no banco que notas estejam entre 0 e 10 e que cada setor use o campo correto.
- Calcular o valor novamente no banco ao salvar, impedindo alteração manual do valor pelo navegador.
- Manter os acessos atuais: equipe autorizada registra; somente gestor/administrador altera regras ou exclui registros.
- Tratar falhas de leitura e gravação com mensagens claras, sem deixar a tela em branco.

## Verificação
- Testar um registro de Recepção e um de Camareiras em uma unidade.
- Confirmar que cada lançamento aparece apenas em seu histórico e soma somente no saldo correto.
- Confirmar filtros mensais, exclusão administrativa e preservação do histórico antigo.
- Verificar a tela em computador e celular e confirmar que o aplicativo compila sem erros.
