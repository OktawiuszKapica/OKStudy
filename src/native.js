export const HOST_NAME = 'pl.okstudy.chatgpt';
let port,
  sequence = 0;
const pending = new Map();
function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST_NAME);
  port.onMessage.addListener((message) => {
    const task = pending.get(message.id);
    if (!task) return;
    if (message.event === 'delta') {
      task.onDelta?.(message.text);
      return;
    }
    if (message.event === 'authorize') {
      // The host is allowed to open only the documented authorization endpoint.
      try {
        const u = new URL(message.url);
        if (u.origin === 'https://auth.openai.com' && u.pathname === '/api/accounts/authorize')
          chrome.tabs.create({ url: u.href });
      } catch {}
      return;
    }
    pending.delete(message.id);
    task.cleanup();
    message.ok
      ? task.resolve(message.result)
      : task.reject(new Error(message.error || 'Błąd połączenia ChatGPT.'));
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message;
    port = null;
    for (const task of pending.values()) {
      task.cleanup();
      task.reject(
        new Error(
          reason
            ? 'Moduł ChatGPT jest niedostępny. Zainstaluj go zgodnie z instrukcją w ustawieniach.'
            : 'Połączenie z modułem ChatGPT zostało przerwane.'
        )
      );
    }
    pending.clear();
  });
  return port;
}
export function nativeRequest(action, data = {}, signal, onDelta) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const id = String(++sequence),
      p = connect();
    const abort = () => {
      pending.delete(id);
      try {
        p.postMessage({ id: `cancel-${id}`, action: 'cancel', targetId: id });
      } catch {}
      cleanup();
      reject(
        signal?.reason || new Error('Przekroczono czas oczekiwania na moduł ChatGPT. Spróbuj ponownie.')
      );
    };
    const timer = setTimeout(
      () => abort(),
      action === 'signin' ? 180000 : action === 'infer' ? 120000 : 60000
    );
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    pending.set(id, { resolve, reject, cleanup, onDelta });
    signal?.addEventListener('abort', abort, { once: true });
    try {
      p.postMessage({ id, action, ...data });
    } catch (error) {
      pending.delete(id);
      cleanup();
      reject(error);
    }
  });
}
