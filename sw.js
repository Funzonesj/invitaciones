// Service worker MÍNIMO de la web unificada.
// Sólo existe para que la app se pueda INSTALAR (icono en la pantalla de inicio).
// NO cachea nada a propósito: así nunca muestra versiones viejas (siempre baja lo último).
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
// Handler de fetch (requisito para poder instalar). Passthrough: deja pasar todo tal cual.
self.addEventListener('fetch', function(e){ /* no interceptamos: la red maneja el pedido */ });
