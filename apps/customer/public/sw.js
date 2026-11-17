/* Brandbasket service worker: shows a web push and opens its page when it is tapped. It caches nothing and has no fetch handler. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const options = {
    body: data.body || undefined,
    tag: data.tag || undefined,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(data.title || "Brandbasket", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = self.location.origin + "/";
  try {
    const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    // Only this site's own pages are opened, whatever the message carried.
    if (url.origin === self.location.origin) target = url.href;
  } catch {
    // An unreadable address opens the home page.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => "focus" in client);
      if (open) return open.focus().then((client) => ("navigate" in client ? client.navigate(target) : client));
      return self.clients.openWindow(target);
    }),
  );
});
