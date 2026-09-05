// Ensure message event listener is attached during initial script evaluation (Chrome Service Worker lifecycle requirement)
self.addEventListener('message', () => {});

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
