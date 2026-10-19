/* eslint-disable */
// Service worker dedicado para notificações push.
// Não faz cache de app-shell — apenas escuta 'push' e 'notificationclick'.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "INJOY", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Manutenção INJOY";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || undefined,
    renotify: true,
    // Urgente (ex.: chamado fora do prazo): fica na tela até a pessoa tocar, com vibração longa.
    requireInteraction: data.urgente === true,
    data: {
      url: data.url || "/",
      ...data.data,
    },
    vibrate: data.urgente === true ? [400, 150, 400, 150, 400] : [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) await client.navigate(url);
            return;
          }
        } catch {}
      }
      await self.clients.openWindow(url);
    })(),
  );
});
