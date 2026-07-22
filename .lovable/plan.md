
# Notificações Push (pop-ups mesmo com celular em repouso)

Vamos implementar **Web Push Notifications** — o padrão que funciona em PWAs instaladas no Android e iOS 16.4+, entregando pop-ups mesmo com a tela bloqueada ou o app fechado.

## Como vai funcionar

1. Ao fazer login, quem tem perfil relevante (gestor, admin, técnico, recepção, camareira) vê um botão **"Ativar notificações"**.
2. O navegador pede permissão → gera uma "assinatura push" única do dispositivo → salvamos no banco vinculada ao `user_id`.
3. Quando um evento acontece (chamado, recado, troca de turno, solicitação), o servidor envia a notificação para as assinaturas dos destinatários corretos.
4. O celular recebe e mostra o pop-up mesmo em repouso.

## Eventos e destinatários

| Evento | Quem recebe |
|---|---|
| Novo chamado de manutenção | Técnico designado + gestores/admin |
| Recado da camareira → recepção | Perfis `recepcao` + gestores |
| Recado da recepção → camareira | Perfis `camareira` + gestores |
| Troca de turno registrada | Perfis `recepcao` + gestores da unidade |
| Solicitação de compra / almoxarifado | Gestores + admin |

## Implementação técnica

**1. Service Worker dedicado** (`public/push-sw.js`)
   - Registra apenas em produção (fora do preview Lovable), conforme regras de PWA.
   - Escuta eventos `push` e `notificationclick` (abre a rota certa ao tocar).

**2. Chaves VAPID** (padrão Web Push)
   - Gero um par de chaves EC P-256 e salvo:
     - `VAPID_PUBLIC_KEY` (visível no cliente)
     - `VAPID_PRIVATE_KEY` (secret no servidor)
     - `VAPID_SUBJECT` (email do gestor)

**3. Banco de dados** — nova tabela `push_subscriptions`:
   - `user_id`, `endpoint` (único), `p256dh`, `auth`, `user_agent`, `created_at`
   - RLS: usuário só vê/mexe as próprias assinaturas.

**4. Server functions** (`src/lib/push.functions.ts`)
   - `subscribeToPush({ subscription })` — grava a assinatura.
   - `unsubscribeFromPush({ endpoint })` — remove.
   - `getVapidPublicKey()` — devolve a chave pública.

**5. Envio das notificações** — server route interna `/api/public/push-dispatcher` chamada por triggers `pg_net`:
   - Trigger em `chamados` (INSERT) → notifica técnico designado.
   - Trigger em `recados_camareiras` (INSERT) → notifica destino.
   - Trigger em `trocas_turno` (INSERT) → notifica recepção da unidade.
   - Trigger em `purchase_requests` (INSERT) → notifica gestores.
   - O dispatcher lê `push_subscriptions` dos user_ids alvo e envia via biblioteca `web-push`, respeitando o Worker (Cloudflare) — se `web-push` não for compatível, uso implementação nativa com `crypto.subtle` (VAPID JWT + payload cifrado AES-GCM).
   - Autenticado por `CRON_SHARED_SECRET` (já existe).

**6. UI** — botão "Ativar notificações" no `app-shell.tsx` (só para perfis-alvo, escondido no preview Lovable). Persiste estado, mostra "ativas ✓" / "reativar".

**7. Manifest**
   - Confirmar `public/site.webmanifest` com `display: standalone` para permitir instalação e recepção em repouso.

## Considerações

- **iOS exige que o app esteja instalado na tela inicial** para receber push. Vamos adicionar uma dica na UI para iOS.
- Notificações **não funcionam no preview Lovable** (o SW é bloqueado ali) — só na URL publicada / no domínio custom `app.injoyhoteis.com` (que já é HTTPS ✓).
- Não afeta a versão Capacitor mobile (essa exigiria FCM nativo — fora do escopo aqui).

## Arquivos a criar/editar

**Novos:**
- `public/push-sw.js`
- `src/lib/push.functions.ts`
- `src/lib/push-client.ts` (helper de subscribe no navegador)
- `src/components/push-notifications-button.tsx`
- `src/routes/api/public/push-dispatcher.ts`
- Migration: tabela `push_subscriptions` + triggers `pg_net` nos 4 eventos.

**Editar:**
- `src/components/app-shell.tsx` (inserir botão para perfis relevantes)
- `public/site.webmanifest` (garantir campos PWA)

Se aprovar, sigo direto na implementação.
