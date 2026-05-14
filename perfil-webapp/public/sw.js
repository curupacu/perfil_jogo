// Service Worker desativado — não interfere com o jogo
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
