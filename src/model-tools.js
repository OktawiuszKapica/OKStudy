// Pure metadata transforms: no hardcoded availability and no model aliases.
export const validModelId = (id) => typeof id === 'string' && /^[\w.:/-]{1,120}$/.test(id);
export function updateLibrary(previous = {}, models, now = Date.now()) {
  const ids = [...new Set(models.filter((m) => validModelId(m.id)).map((m) => m.id))].slice(0, 2000);
  const old = new Set(previous.ids || []),
    fresh = {};
  for (const id of ids) {
    const at = old.size && !old.has(id) ? now : previous.fresh?.[id];
    if (Number.isFinite(at) && now - at < 86400000) fresh[id] = at;
  }
  return { ids, fresh, favorites: (previous.favorites || []).filter(validModelId).slice(0, 8), at: now };
}
export function decorateModels(models, library = {}, now = Date.now()) {
  const favorites = library.favorites || [];
  return models
    .map((m) => ({
      ...m,
      favorite: favorites.includes(m.id),
      isNew: Number.isFinite(library.fresh?.[m.id]) && now - library.fresh[m.id] < 86400000,
    }))
    .sort(
      (a, b) => (a.favorite ? favorites.indexOf(a.id) : 99) - (b.favorite ? favorites.indexOf(b.id) : 99)
    );
}
export function toggleFavorite(library = {}, id) {
  if (!validModelId(id)) throw new Error('Wybierz poprawny model.');
  const favorites = [...(library.favorites || [])];
  const index = favorites.indexOf(id);
  if (index >= 0) favorites.splice(index, 1);
  else {
    if (favorites.length >= 8) throw new Error('Możesz zapisać 8 ulubionych modeli dla połączenia.');
    favorites.push(id);
  }
  return { ...library, favorites };
}
export async function libraryScope(provider, credential) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${provider}:${credential || ''}`)
  );
  return `okstudy.library.${[...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
let queue = Promise.resolve();
export function modelLibrary(scope, models, live, favorite) {
  const operation = queue
    .catch(() => {})
    .then(async () => {
      const previous = (await chrome.storage.local.get(scope))[scope] || {};
      let library = live ? updateLibrary(previous, models) : previous;
      if (favorite) library = toggleFavorite(library, favorite);
      if (live || favorite) await chrome.storage.local.set({ [scope]: library });
      return { models: decorateModels(models, library), favorites: library.favorites || [], scope };
    });
  queue = operation;
  return operation;
}
