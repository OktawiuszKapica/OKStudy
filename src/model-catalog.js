import { PROVIDERS } from './config.js';
import { apiError } from './stream.js';

export const MODEL_TTL = 6 * 60 * 60 * 1000;
const validId = (value) => typeof value === 'string' && /^[\w.:/-]{1,120}$/.test(value);
const usableOpenAI = (id) =>
  !/(^whisper|^tts-|^dall-e|^babbage|^davinci|embedding|moderation|realtime|transcri|(^|-)audio|(^|-)image|instruct|search-api)/i.test(
    id
  );
export function parseModels(provider, data) {
  const rows = provider === 'gemini' || provider === 'grok' ? data.models : data.data;
  if (!Array.isArray(rows)) throw new Error('Dostawca zwrócił nieznany format listy modeli.');
  const models = [],
    seen = new Set();
  for (const row of rows) {
    const id = provider === 'gemini' ? row.name?.replace(/^models\//, '') : row.id;
    if (!validId(id) || seen.has(id)) continue;
    if (
      provider === 'gemini' &&
      (!row.supportedGenerationMethods?.includes('generateContent') ||
        /embedding|native-audio|tts|imagen|veo/i.test(id))
    )
      continue;
    if (provider === 'openai' && !usableOpenAI(id)) continue;
    if (provider === 'grok' && row.output_modalities && !row.output_modalities.includes('text')) continue;
    const image =
      provider === 'claude'
        ? row.capabilities?.image_input?.supported
        : provider === 'grok'
          ? row.input_modalities?.includes('image')
          : undefined;
    models.push({
      id,
      name: String(row.displayName || row.display_name || id).slice(0, 160),
      ...(typeof image === 'boolean' ? { image } : {}),
    });
    seen.add(id);
  }
  return models;
}
export async function fetchModels(provider, key, signal = AbortSignal.timeout(12000)) {
  if (!Object.hasOwn(PROVIDERS, provider)) throw new Error('Nieznany dostawca modeli.');
  if (!key) throw new Error('Zapisz klucz API, aby pobrać modele dostępne na Twoim koncie.');
  const headers =
    provider === 'gemini'
      ? { 'x-goog-api-key': key }
      : provider === 'claude'
        ? {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          }
        : { Authorization: `Bearer ${key}` };
  const endpoint = {
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    claude: 'https://api.anthropic.com/v1/models',
    openai: 'https://api.openai.com/v1/models',
    grok: 'https://api.x.ai/v1/language-models',
  }[provider];
  const all = [],
    pages = new Set();
  let cursor = '';
  for (let page = 0; page < 30; page++) {
    const url = new URL(endpoint);
    if (provider === 'gemini') {
      url.searchParams.set('pageSize', '1000');
      if (cursor) url.searchParams.set('pageToken', cursor);
    }
    if (provider === 'claude') {
      url.searchParams.set('limit', '1000');
      if (cursor) url.searchParams.set('after_id', cursor);
    }
    const response = await fetch(url.href, { headers, signal });
    if (!response.ok) throw apiError(response.status, await response.text());
    const data = await response.json();
    all.push(...parseModels(provider, data));
    const next =
      provider === 'gemini' ? data.nextPageToken : provider === 'claude' && data.has_more ? data.last_id : '';
    if (!next) return [...new Map(all.map((model) => [model.id, model])).values()];
    if (typeof next !== 'string' || pages.has(next))
      throw new Error('Dostawca zwrócił niepełną listę modeli.');
    pages.add(next);
    cursor = next;
  }
  throw new Error('Lista modeli jest zbyt długa. Spróbuj ponownie później.');
}

const pending = new Map();
export async function accountCatalog(provider, key, force = false) {
  if (!Object.hasOwn(PROVIDERS, provider)) throw new Error('Nieznany dostawca.');
  const fallback = { models: PROVIDERS[provider].models, source: 'bundled', updatedAt: null };
  if (!key) return { ...fallback, warning: 'Lista startowa. Zapisz klucz, aby pobrać modele Twojego konta.' };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const fingerprint = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
  const storageKey = `okstudy.catalog.${provider}`;
  const saved = (await chrome.storage.session.get(storageKey))[storageKey];
  const previous = saved?.fingerprint === fingerprint ? saved : null;
  if (!force && previous?.models && Date.now() - previous.updatedAt < MODEL_TTL)
    return { models: previous.models, source: 'cache', updatedAt: previous.updatedAt };
  if (!force && previous?.failedAt && Date.now() - previous.failedAt < 60000)
    return {
      ...fallback,
      ...(previous.models ? { models: previous.models, source: 'cache', updatedAt: previous.updatedAt } : {}),
      warning: previous.warning,
    };
  const requestId = `${provider}:${fingerprint}`;
  if (pending.has(requestId)) return pending.get(requestId);
  const request = (async () => {
    try {
      const models = await fetchModels(provider, key);
      const updatedAt = Date.now();
      await chrome.storage.session.set({ [storageKey]: { fingerprint, models, updatedAt } });
      return { models, source: 'live', updatedAt };
    } catch (error) {
      const warning = `Nie udało się odświeżyć modeli. ${error instanceof TypeError ? 'Sprawdź połączenie z internetem.' : error.message}`;
      await chrome.storage.session.set({
        [storageKey]: { ...previous, fingerprint, failedAt: Date.now(), warning },
      });
      return {
        ...fallback,
        ...(previous?.models
          ? { models: previous.models, source: 'cache', updatedAt: previous.updatedAt }
          : {}),
        warning,
      };
    } finally {
      pending.delete(requestId);
    }
  })();
  pending.set(requestId, request);
  return request;
}
