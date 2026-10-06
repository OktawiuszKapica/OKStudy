import { normalizeSettings } from './config.js';
import { getSettings, updateSettings, serial } from './storage.js';

export const PROFILE_FIELDS = [
  'mode',
  'voice',
  'pos',
  'expressSize',
  'expressOpacity',
  'expressDuration',
  'expressAnswerOnly',
  'expressStyle',
  'expressContrast',
  'expressWidth',
  'activityIndicator',
];
export const PRESETS = [
  {
    id: 'study',
    name: 'Nauka',
    settings: {
      mode: 'tutor',
      voice: 'off',
      activityIndicator: 'full',
      expressOpacity: 1,
      expressStyle: 'card',
      expressContrast: 'auto',
    },
  },
  {
    id: 'quick',
    name: 'Dyskretna odpowiedź',
    settings: {
      mode: 'express',
      expressAnswerOnly: true,
      voice: 'off',
      activityIndicator: 'off',
      expressStyle: 'text',
      expressContrast: 'subtle',
      expressOpacity: 0.35,
    },
  },
  {
    id: 'listen',
    name: 'Słuchanie',
    settings: { mode: 'express', expressAnswerOnly: true, voice: 'only', activityIndicator: 'minimal' },
  },
];
const PROFILE_KEY = 'okstudy.profiles',
  POSITION_KEY = 'okstudy.positions';
export async function listProfiles() {
  return [...PRESETS, ...((await chrome.storage.local.get(PROFILE_KEY))[PROFILE_KEY] || [])];
}
export async function applyProfile(id) {
  const profile = (await listProfiles()).find((profile) => profile.id === id);
  if (!profile) throw new Error('Nie znaleziono profilu.');
  return updateSettings(profile.settings);
}
export function saveProfile(name, settings) {
  return serial(async () => {
    name = String(name || '')
      .trim()
      .slice(0, 40);
    if (!name) throw new Error('Nadaj nazwę profilowi.');
    const saved = (await chrome.storage.local.get(PROFILE_KEY))[PROFILE_KEY] || [];
    const existing = saved.find((profile) => profile.name === name);
    if (!existing && saved.length >= 8)
      throw new Error('Możesz zapisać 8 własnych profili. Usuń jeden z nich.');
    const normalized = normalizeSettings(settings || (await getSettings()));
    const profile = {
      id: existing?.id || crypto.randomUUID(),
      name,
      custom: true,
      settings: Object.fromEntries(PROFILE_FIELDS.map((key) => [key, normalized[key]])),
    };
    await chrome.storage.local.set({
      [PROFILE_KEY]: [profile, ...saved.filter((item) => item.id !== profile.id)],
    });
    return profile;
  });
}
export function deleteProfile(id) {
  return serial(async () => {
    const saved = (await chrome.storage.local.get(PROFILE_KEY))[PROFILE_KEY] || [];
    await chrome.storage.local.set({ [PROFILE_KEY]: saved.filter((profile) => profile.id !== id) });
  });
}
export function originOf(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}
export async function loadPosition(origin) {
  if (!origin) return null;
  return (await chrome.storage.local.get(POSITION_KEY))[POSITION_KEY]?.[origin] || null;
}
export function savePosition(origin, value) {
  return serial(async () => {
    if (!origin || !Number.isFinite(value?.x) || !Number.isFinite(value?.y))
      throw new Error('Nieprawidłowa pozycja odpowiedzi.');
    const saved = (await chrome.storage.local.get(POSITION_KEY))[POSITION_KEY] || {};
    const position = {
      x: Math.min(1, Math.max(0, value.x)),
      y: Math.min(1, Math.max(0, value.y)),
      at: Date.now(),
    };
    saved[origin] = position;
    const limited = Object.fromEntries(
      Object.entries(saved)
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, 200)
    );
    await chrome.storage.local.set({ [POSITION_KEY]: limited });
    return position;
  });
}
export const clearPositions = () => chrome.storage.local.remove(POSITION_KEY);
