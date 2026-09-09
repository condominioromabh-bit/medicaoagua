/* Service worker do push. Precisa estar na raiz do domínio.
   Os valores abaixo são públicos por natureza (config de cliente Firebase). */
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAZrKYkNn6JZsFx5muTa5rn4ljqmryvwR8',
  authDomain: 'condominio-roma.firebaseapp.com',
  projectId: 'condominio-roma',
  messagingSenderId: '781094906729',
  appId: '1:781094906729:web:c156aa082ac1a136d22bf8',
});

/* O servidor envia só `data`, sem o bloco `notification`.
   Com `notification`, o navegador exibe sozinho E este handler exibe de novo —
   era a causa da notificação chegar duplicada. Enviando apenas dados, quem
   mostra é só este código. */
firebase.messaging().onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.titulo || 'Condomínio ROMA', {
    body: d.corpo || '',
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    tag: d.tag || 'roma',
    renotify: true,
    data: { link: d.link || '/leitura' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.link) || '/leitura';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      // se o app já está aberto, foca a janela em vez de abrir outra
      for (const c of lista) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(destino);
          return c.focus();
        }
      }
      return clients.openWindow(destino);
    }),
  );
});
