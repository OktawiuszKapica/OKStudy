import { normalizeSettings, PROVIDERS, HISTORY_MAX } from './config.js';
export const SETTINGS_KEY = 'okstudy.settings.v2',
  KEYS_KEY = 'okstudy.keys.v2',
  HISTORY_KEY = 'okstudy.history.v2';
let queue = Promise.resolve();
export function serial(task) {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
}
let initialized;
export function initializeStorage() {
  if (!initialized)
    initialized = (async () => {
      await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      await chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      const local = await chrome.storage.local.get([SETTINGS_KEY, KEYS_KEY]);
      const { stealthSettings: legacy } = await chrome.storage.sync.get('stealthSettings');
      if (!local[SETTINGS_KEY] || !local[KEYS_KEY]) {
        const keys = {};
        for (const p of Object.keys(PROVIDERS))
          keys[p] =
            typeof legacy?.keys?.[p] === 'string'
              ? legacy.keys[p]
              : p === 'gemini' && typeof legacy?.geminiApiKey === 'string'
                ? legacy.geminiApiKey
                : '';
        await chrome.storage.local.set({
          [SETTINGS_KEY]: local[SETTINGS_KEY] || normalizeSettings(legacy),
          [KEYS_KEY]: local[KEYS_KEY] || keys,
        });
      }
      // Remove synchronized secrets only after the local copy has been persisted.
      if (legacy) await chrome.storage.sync.remove('stealthSettings');
      const { oksHistory } = await chrome.storage.session.get('oksHistory');
      const current = await chrome.storage.session.get(HISTORY_KEY);
      if (oksHistory?.items?.length && !current[HISTORY_KEY]) {
        await chrome.storage.session.set({
          [HISTORY_KEY]: oksHistory.items
            .filter((t) => typeof t === 'string')
            .map((text) => ({
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              provider: 'gemini',
              model: '',
              mode: 'tutor',
              title: 'Odpowiedź z poprzedniej wersji',
              messages: [{ role: 'assistant', text }],
              sources: [],
            })),
        });
      }
      if (oksHistory) await chrome.storage.session.remove('oksHistory');
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  return initialized;
}
export async function getSettings() {
  await initializeStorage();
  const s = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(s[SETTINGS_KEY]);
}
export async function getKeys() {
  await initializeStorage();
  return (await chrome.storage.local.get(KEYS_KEY))[KEYS_KEY] || {};
}
export async function getHistory() {
  const s = await getSettings();
  return (
    (await chrome.storage[s.persistentHistory ? 'local' : 'session'].get(HISTORY_KEY))[HISTORY_KEY] || []
  );
}
export function updateSettings(patch, keys) {
  return serial(async () => {
    const before = await getSettings();
    const after = normalizeSettings({ ...before, ...patch, models: { ...before.models, ...patch.models } });
    if (before.persistentHistory !== after.persistentHistory) {
      const history = await getHistory();
      await chrome.storage[after.persistentHistory ? 'local' : 'session'].set({ [HISTORY_KEY]: history });
      await chrome.storage.local.set({ [SETTINGS_KEY]: after });
      await chrome.storage[before.persistentHistory ? 'local' : 'session'].remove(HISTORY_KEY);
    } else await chrome.storage.local.set({ [SETTINGS_KEY]: after });
    if (keys) {
      const saved = await getKeys();
      for (const p of Object.keys(PROVIDERS))
        if (typeof keys[p] === 'string') saved[p] = keys[p].trim().slice(0, 4096);
      await chrome.storage.local.set({ [KEYS_KEY]: saved });
    }
    return after;
  });
}
export function saveEntry(entry, guard = () => true) {
  return serial(async () => {
    if (!guard()) return false;
    const settings = await getSettings(),
      history = await getHistory();
    if (!guard()) return false;
    const next = [entry, ...history.filter((x) => x.id !== entry.id)].slice(0, HISTORY_MAX);
    // Leave room in the 10 MB session quota for progress from concurrent tabs.
    const encoder = new TextEncoder();
    while (next.length > 1 && encoder.encode(JSON.stringify(next)).length > 6 * 1024 * 1024) next.pop();
    await chrome.storage[settings.persistentHistory ? 'local' : 'session'].set({ [HISTORY_KEY]: next });
    if (!guard()) {
      await chrome.storage[settings.persistentHistory ? 'local' : 'session'].set({ [HISTORY_KEY]: history });
      return false;
    }
    return true;
  });
}
export function deleteHistory(id) {
  return serial(async () => {
    const settings = await getSettings(),
      history = await getHistory();
    await chrome.storage[settings.persistentHistory ? 'local' : 'session'].set({
      [HISTORY_KEY]: id ? history.filter((x) => x.id !== id) : [],
    });
  });
}
