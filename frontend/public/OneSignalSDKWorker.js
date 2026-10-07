// Synchronous event listeners attached during initial script evaluation (Chrome Service Worker lifecycle requirement)
const earlyMessageQueue = [];
let downstreamMessageHandlers = [];

self.addEventListener('message', (event) => {
  if (downstreamMessageHandlers.length > 0) {
    for (const handler of downstreamMessageHandlers) {
      try {
        handler(event);
      } catch (e) {
        console.error('[SW Message Handler Error]:', e);
      }
    }
  } else {
    earlyMessageQueue.push(event);
  }
});

// Load OneSignal Service Worker SDK v16
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (err) {
  console.error('[OneSignal Worker ImportScripts Error]:', err);
}

// Drain any queued early messages once downstream evaluation completes
if (earlyMessageQueue.length > 0 && downstreamMessageHandlers.length > 0) {
  while (earlyMessageQueue.length > 0) {
    const queuedEvent = earlyMessageQueue.shift();
    for (const handler of downstreamMessageHandlers) {
      try {
        handler(queuedEvent);
      } catch (_) {}
    }
  }
}
