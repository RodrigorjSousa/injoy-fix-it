# PROJETO INJOY — Lavanderia

Leia antes o `00-CONTEXTO-GERAL.md`.

## Contexto do negócio
- A lavanderia é **terceirizada: Clean Soft** (R. Sérgio Porto, 14). Cerca de R$ 4.500/mês por unidade
  na baixa temporada (Ipanema, agosto/2026: R$ 4.560,31) e cerca de 30% a mais na alta.
- Ela cobra **por peça, talão a talão**, com tabela de preços (planilha "COLETAS - INJOY IPANEMA - 2026").
- Processo: a camareira conta e a lavanderia preenche o talão (ROL) com essa contagem (Saída Hotel). Na
  lavanderia o funcionário dela conta (Ent. Lav.). Na volta, vem anotado o que voltou (Saída Lav.) e a
  camareira conta para guardar. Todo dia sai roupa e ela volta em cerca de 2 dias, **misturada entre
  talões** (ex.: talão 19383 saiu com 30 peças e voltou com 61).
- A planilha antiga (NOVA CONTROLE LAVANDERIA) zerava todo mês e tinha 9 fórmulas erradas por aba
  (somava a linha de cima e pulava os dias 15/30), por isso os números de falta saíam errados.
- Rodrigo avalia ter **lavanderia própria**; o custo ainda precisa ser estudado.

## Como funciona agora (entrega de 08/10/2026, branch `lavanderia-conta-corrente`)
Controle por **saldo de cada peça** (conta corrente), começando em **01/10/2026**, e não por talão.

- **Camareiras** (botão "Lavanderia" em Camareiras, `src/components/camareiras/laundry-modal.tsx`):
  - 📤 Coleta: número do talão, quantidade por peça e **foto do talão obrigatória**.
  - 📥 Retorno: escolhe o talão aberto e copia o que estiver escrito no papel. Ent. Lav. em branco vale a
    Saída Hotel; Saída Lav. em branco vale 0. "Contei" é obrigatório quando a lavanderia anotou devolução
    (o campo fica vermelho e um aviso diz o que falta). Pode incluir uma peça que voltou sem ter saído naquele
    talão. Foto obrigatória. (Correção de 08/10: antes as três colunas eram obrigatórias e o botão não habilitava.)
  - Camareira só lança com a data de hoje e não corrige depois. Em Ipanema quem lança é a própria camareira.
- **Gestor** (menu LAVANDERIA, `src/routes/_authenticated/relatorio-operacoes.tsx`):
  - Saldo: na lavanderia agora, em talões abertos, pendente de talões já devolvidos, faltas na entrega e alertas
    (talão com 3 dias ou mais, falta na entrega, divergência de contagem, número pulado).
  - Talões: por mês, com as 4 contagens, fotos, corrigir coleta/retorno, desfazer retorno e excluir.
  - Fechamento do mês: nas colunas da fatura Clean Soft, mostra contagem × preço = valor esperado. O gestor
    digita as quantidades e o valor da fatura, e o app mostra a diferença, os talões sem retorno, os números
    pulados e o que foi anotado e não entregue. Tem "Aprovar pagamento" e "Imprimir/PDF".
  - Peças e preços: catálogo com o grupo da fatura e o preço (editável).
  - O gestor pode lançar com data retroativa ("Lançar coleta" e "Registrar retorno").
- Regras puras e testes: `src/lib/lavanderia.ts` e `.test.ts` (o teste reproduz a fatura de agosto: R$ 4.560,31).
  Acesso ao banco: `src/lib/lavanderia-api.ts`.

### Banco (migrações 0043 e 0044)
- `lav_pecas` (catálogo + `grupo_fatura` + `preco`), `lav_taloes` (único por unidade+número, fotos),
  `lav_talao_itens` (saida_hotel, ent_lav, saida_lav, guardado) e `lav_faturas` (fechamento mensal).
- Escrita só por RPC: `lav_registrar_coleta`, `lav_registrar_retorno`, `lav_desfazer_retorno`,
  `lav_excluir_talao` e `lav_aprovar_fatura`. O catálogo inicial é criado por `lav_preparar()`, chamada pelo app.
- Permissão (uma fonte): `lav_minha_permissao()`. Gestor/admin gerem tudo; qualquer login com papel lança.
- Fotos no bucket privado **`lavanderia`** (`<uid>/<unidade>/...`). As policies estão na 0044.
- As tabelas antigas (`laundry_logs`, `laundry_batches`, `laundry_debt`, `laundry_items_directory`) ficaram
  intactas, só não aparecem mais na tela.

## Estado atual
- Entrega pronta na branch `lavanderia-conta-corrente`. SQL testado em Postgres local (49 verificações por
  usuário). tsc, vitest e build passando.
- Para ativar: (1) merge; (2) criar no Lovable o bucket **privado** `lavanderia`; (3) aplicar a 0043 e depois
  a 0044; (4) Publicar → Atualizar.
- Rodrigo vai lançar os talões de 01/10 a 08/10 como gestor (data retroativa). As camareiras começam em 09/10.

## Ideias e pendências
- Conferir no primeiro fechamento se a Clean Soft cobra pela contagem dela (Ent. Lav.). O app assume que sim.
- Confirmar o preço de Protetor Colchão Solteiro e de Peseira (foram para o grupo "Prot. colchão casal / saia",
  a R$ 6,15).
- Ligar "Aprovar pagamento" a um lançamento no Financeiro (categoria lavanderia).
- Estudo da lavanderia própria usando o volume real de peças por mês (já disponível no fechamento).
