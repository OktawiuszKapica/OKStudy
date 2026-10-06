import { serial } from './storage.js';

const CACHE = 'okstudy.speechCache',
  USAGE = 'okstudy.speechUsage';
const MAX_BYTES = 2 * 1024 * 1024,
  TTL = 30 * 60 * 1000;
export async function speechCacheId(key, input, voice, speed) {
  const data = new TextEncoder().encode(JSON.stringify([key, 'gpt-4o-mini-tts', input, voice, speed]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export async function cachedSpeech(id) {
  const entries = (await chrome.storage.session.get(CACHE))[CACHE] || [];
  return entries.find((entry) => entry.id === id && Date.now() - entry.at < TTL)?.audio;
}
export function cacheSpeech(id, audio) {
  return serial(async () => {
    if (audio.length > MAX_BYTES) return;
    const entries = (await chrome.storage.session.get(CACHE))[CACHE] || [];
    const next = [
      { id, audio, at: Date.now() },
      ...entries.filter((entry) => entry.id !== id && Date.now() - entry.at < TTL),
    ].slice(0, 12);
    while (next.reduce((sum, entry) => sum + entry.audio.length, 0) > MAX_BYTES) next.pop();
    await chrome.storage.session.set({ [CACHE]: next });
  });
}
export const clearSpeechCache = () => chrome.storage.session.remove(CACHE);
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};
export async function speechUsage() {
  const value = (await chrome.storage.local.get(USAGE))[USAGE];
  return value?.day === today() ? value : { day: today(), count: 0 };
}
export function reserveSpeech(settings, alive) {
  return serial(async () => {
    const usage = await speechUsage();
    if (!alive()) throw new DOMException('Przerwano', 'AbortError');
    if (settings.speechDailyLimit > 0 && usage.count >= settings.speechDailyLimit)
      throw new Error(
        'Osiągnięto ustawiony dzienny limit odczytów OpenAI. Zapisane nagrania nadal możesz odtwarzać.'
      );
    await chrome.storage.local.set({ [USAGE]: { ...usage, count: usage.count + 1 } });
  });
}
