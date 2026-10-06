# PROJETO INJOY — Totem (auto check-in, check-out e avaliação)

Leia antes o `00-CONTEXTO-GERAL.md`.

## Objetivo
Um totem (tablet fixo) na unidade para o hóspede:
1. fazer o **check-in sozinho** e receber a senha da porta;
2. fazer o **check-out**;
3. **avaliar a estadia**, alimentando a Bonificação e as notas de qualidade.

Ipanema não tem recepção fixa, então o totem é especialmente útil lá.

## O que já existe e pode ser reaproveitado
- **Check-in digital com fechaduras Tuya:** `src/routes/_authenticated/check-in-digital.tsx`,
  `src/lib/tuya-devices.ts` (resolve fechadura do quarto + portão/porta de vidro da unidade),
  tabela `tuya_devices` e a edge function `supabase/functions/tuya-password`. Hoje há um piloto no
  quarto 005 de Botafogo.
- **Check-out no Cloudbeds:** `src/lib/cloudbeds-checkout.functions.ts` (`cloudbedsCheckoutRoom`)
  muda a reserva `checked_in` → `checked_out`. Foi pensado para Ipanema e hoje é usado pelo gestor e
  pelas camareiras.
- **Reservas e pagamentos:** `src/lib/cloudbeds-reservas.functions.ts` e
  `reservation-payment.functions.ts` (`/postPayment`: dinheiro, crédito, débito e Pix).
- **Avaliações / Bonificação:** `registros_bonificacao` + RPC `registrar_bonificacao_conjunta`
  (notas de funcionários, limpeza e geral, mais elogio).

## Pontos de atenção
- O totem fica sem login de funcionário. Vai precisar de um modo quiosque seguro: um usuário
  técnico ou um token do aparelho, com funções SECURITY DEFINER limitadas ao que o totem pode fazer.
- Antes de liberar a senha da porta, conferir a identidade do hóspede (nome, documento ou código da
  reserva).
- Credenciais do Cloudbeds e da Tuya ficam só no servidor (server functions e edge functions), nunca
  no navegador.

## Estado atual
- Não iniciado como totem. As peças acima existem.
