// Shared by the MV3 worker and optional native host. Handles split UTF-8/SSE frames.
export async function* readSSE(body) {
  if (!body) throw new Error('Brak strumienia odpowiedzi.');
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      if (buffer.length > 4000000) throw new Error('Strumień odpowiedzi jest zbyt duży. Zawęź zadanie.');
      buffer = buffer.replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (data && data !== '[DONE]') yield JSON.parse(data);
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function apiError(status, raw = '') {
  const t = String(raw).toLowerCase();
  let message = `Dostawca zwrócił błąd (${status}). Spróbuj ponownie.`;
  if (/subscription_sharing_usage_limit_exceeded|subscription_sharing_usage_unavailable/.test(t))
    message =
      'Limit planu ChatGPT został osiągnięty lub użycie planu jest niedostępne. Otwórz „Zarządzaj użyciem”.';
  else if (/insufficient_quota|credit balance|insufficient credits|billing/.test(t))
    message = 'Brak środków lub aktywnego rozliczania na koncie API.';
  else if (status === 401 || /api_key_invalid|invalid_api_key|api key not valid/.test(t))
    message = 'Nieprawidłowy klucz lub wygasłe połączenie. Sprawdź ustawienia konta.';
  else if (status === 404 || /model_not_found|model.*(deprecated|retired|not found|does not exist)/.test(t))
    message = 'Wybrany model jest niedostępny. Odśwież listę modeli w ustawieniach i wybierz dostępny model.';
  else if (status === 403) message = 'Konto nie ma dostępu do tej funkcji. Sprawdź model i uprawnienia.';
  else if (status === 429) message = 'Osiągnięto limit zapytań. Odczekaj chwilę i spróbuj ponownie.';
  else if (status === 400)
    message = 'Model odrzucił zapytanie. Sprawdź obsługę obrazów i wyszukiwania lub wybierz inny model.';
  else if (status >= 500) message = 'Usługa AI jest chwilowo niedostępna. Spróbuj ponownie.';
  const error = new Error(message);
  error.status = status;
  error.retryable = (status === 429 || status >= 500) && !/quota|credit|billing|subscription_sharing/.test(t);
  return error;
}
export async function readResponses(response, onDelta = () => {}) {
  if (!response.ok) throw apiError(response.status, await response.text());
  let text = '',
    completed = false,
    sources = [];
  for await (const e of readSSE(response.body)) {
    if (e.type === 'response.output_text.delta') {
      text += e.delta;
      onDelta(text);
    }
    if (e.type === 'response.failed' || e.type === 'error')
      throw apiError(400, JSON.stringify(e.error || e.response?.error || e));
    if (e.type === 'response.incomplete')
      throw new Error(
        'Odpowiedź została przerwana przez dostawcę. Spróbuj prostszego pytania lub innego modelu.'
      );
    if (e.type === 'response.completed') {
      completed = true;
      const content = (e.response?.output || []).flatMap((o) => o.content || []);
      const fullText = content
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join('\n');
      if (fullText) text = fullText;
      sources = content
        .flatMap((c) => c.annotations || [])
        .filter((a) => a.type === 'url_citation')
        .map((a) => ({ url: a.url, title: a.title || a.url }));
    }
  }
  if (!completed)
    throw new Error('Połączenie zakończyło się przed ukończeniem odpowiedzi. Spróbuj ponownie.');
  if (!text.trim())
    throw new Error('Model nie zwrócił odpowiedzi tekstowej. Wybierz inny model lub zawęź zadanie.');
  return { text, sources };
}
