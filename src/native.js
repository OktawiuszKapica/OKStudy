export const HOST_NAME = 'pl.okstudy.chatgpt';
let port,
  sequence = 0;
const pending = new Map();
function connectionError(code, message) {
  return Object.assign(new Error(message), { code });
}
function disconnectedError(reason = '') {
  if (/not found/i.test(reason))
    return connectionError(
      'NATIVE_HOST_NOT_FOUND',
      'Nie znaleziono modułu ChatGPT. Zainstaluj go według instrukcji w ustawieniach OKStudy, a następnie spróbuj ponownie.'
    );
  if (/forbidden|access.*denied|policy|blocked/i.test(reason))
    return connectionError(
      'NATIVE_HOST_FORBIDDEN',
      'Przeglądarka nie zezwala na połączenie z modułem ChatGPT. Uruchom instalator z identyfikatorem tej wtyczki. W przeglądarce zarządzanej dostęp może wymagać zgody administratora.'
    );
  if (/failed to start|invalid.*host/i.test(reason))
    return connectionError(
      'NATIVE_HOST_START_FAILED',
      'Nie udało się uruchomić modułu ChatGPT. Uruchom ponownie OKStudy-Setup.exe z nowej paczki. Przy instalacji ręcznej sprawdź również Node.js 22 lub nowszy.'
    );
  return connectionError(
    'NATIVE_HOST_DISCONNECTED',
    'Połączenie z modułem ChatGPT zostało przerwane. Spróbuj ponownie. Jeśli błąd wraca, uruchom ponownie instalator modułu.'
  );
}
function connect() {
  if (port) return port;
  if (typeof chrome.runtime.connectNative !== 'function')
    throw connectionError(
      'NATIVE_API_UNAVAILABLE',
      'Chrome nie udostępnił połączenia z modułem ChatGPT. Otwórz chrome://extensions, przeładuj OKStudy i otwórz ustawienia ponownie.'
    );
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
      task.reject(disconnectedError(reason));
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
