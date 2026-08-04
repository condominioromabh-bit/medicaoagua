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

firebase.messaging().onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'Condomínio ROMA', {
    body: n.body || '',
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    tag: 'roma',
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/leitura'));
});
