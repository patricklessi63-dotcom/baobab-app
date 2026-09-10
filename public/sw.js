// BAOBAB — Service worker pour les notifications push (Web Push / VAPID).
// Pas de mise en cache d'assets ici : seul le comportement push/click est géré,
// pour ne pas interférer avec le rechargement normal de l'app en dev/prod.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Baobab", body: "", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data ? event.data.text() : "";
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Baobab", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  const absoluteTarget = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientsList) => {
      // Priorité à un onglet Baobab déjà ouvert : on le concentre, et on ne
      // le fait naviguer que s'il n'est pas déjà sur la bonne page (éviter de
      // couper net ce que l'utilisateur était en train de faire).
      const sameOrigin = clientsList.filter((c) => {
        try {
          return new URL(c.url).origin === self.location.origin;
        } catch (_) {
          return false;
        }
      });
      const exact = sameOrigin.find((c) => c.url === absoluteTarget);
      const client = exact || sameOrigin[0];
      if (client) {
        try {
          if (!exact && "navigate" in client) await client.navigate(absoluteTarget);
        } catch (_) {
          // navigate() rejette si l'onglet n'est pas contrôlé par ce SW
          // (enregistré tardivement) — on se contente alors de le concentrer.
        }
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(absoluteTarget);
    })
  );
});
