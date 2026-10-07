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
  const parts = new Map(),
    blocked = new Set();
  const visible = (item) =>
    (!item?.type || item.type === 'message') &&
    item?.channel !== 'analysis' &&
    (!item?.role || item.role === 'assistant');
  const collect = (index, content, value, append = false) => {
    if (blocked.has(index) || typeof value !== 'string') return;
    const key = `${index}:${content}`;
    parts.set(key, append ? (parts.get(key) || '') + value : value);
    text = [...parts.entries()]
      .sort((a, b) => {
        const x = a[0].split(':').map(Number),
          y = b[0].split(':').map(Number);
        return x[0] - y[0] || x[1] - y[1];
      })
      .map((x) => x[1])
      .join('\n');
    if (text.length > 150000) throw new Error('Odpowiedź jest zbyt długa. Zawęź zadanie.');
    onDelta(text);
  };
  for await (const e of readSSE(response.body)) {
    const index = e.output_index ?? 0,
      content = e.content_index ?? 0;
    if (e.type === 'response.output_item.added' || e.type === 'response.output_item.done') {
      if (!visible(e.item)) {
        blocked.add(index);
        for (const key of parts.keys()) if (key.startsWith(`${index}:`)) parts.delete(key);
      } else if (e.type === 'response.output_item.done') {
        for (const [i, part] of (e.item?.content || []).entries())
          if (part.type === 'output_text') collect(index, i, part.text);
      }
    }
    if (e.type === 'response.output_text.delta') {
      if (e.channel !== 'analysis') collect(index, content, e.delta, true);
    }
    if (e.type === 'response.output_text.done' && e.channel !== 'analysis') collect(index, content, e.text);
    if (e.type === 'response.content_part.done' && e.channel !== 'analysis' && e.part?.type === 'output_text')
      collect(index, content, e.part.text);
    if (e.type === 'response.refusal.done' || e.type === 'response.refusal.delta')
      throw new Error('Model nie może odpowiedzieć na to zadanie.');
    if (e.type === 'response.failed' || e.type === 'error')
      throw apiError(400, JSON.stringify(e.error || e.response?.error || e));
    if (e.type === 'response.incomplete')
      throw new Error(
        'Odpowiedź została przerwana przez dostawcę. Spróbuj prostszego pytania lub innego modelu.'
      );
    if (e.type === 'response.completed') {
      if (e.response?.error) throw apiError(400, JSON.stringify(e.response.error));
      if (e.response?.status && e.response.status !== 'completed')
        throw new Error('Model nie ukończył odpowiedzi.');
      completed = true;
      const content = (e.response?.output || []).filter(visible).flatMap((o) => o.content || []);
      if (content.some((c) => c.type === 'refusal'))
        throw new Error('Model nie może odpowiedzieć na to zadanie.');
      const fullText = content
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join('\n');
      if (fullText) text = fullText;
      else
        text = [...parts.entries()]
          .filter(([key]) => !blocked.has(Number(key.split(':')[0])))
          .sort((a, b) => {
            const x = a[0].split(':').map(Number),
              y = b[0].split(':').map(Number);
            return x[0] - y[0] || x[1] - y[1];
          })
          .map((x) => x[1])
          .join('\n');
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
