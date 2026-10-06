export const PROVIDERS = {
  gemini: {
    name: 'Gemini',
    image: 'gemini.png',
    keyUrl: 'https://aistudio.google.com/apikey',
    placeholder: 'AIza…',
    models: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', detail: 'Codzienna nauka' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', detail: 'Lżejszy model' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', detail: 'Złożone zadania · preview' },
    ],
  },
  claude: {
    name: 'Claude',
    image: 'claude.png',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-…',
    models: [
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', detail: 'Codzienna nauka' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', detail: 'Lżejszy model' },
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', detail: 'Złożone zadania' },
    ],
  },
  openai: {
    name: 'OpenAI',
    image: 'chatgpt.jpg',
    keyUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-…',
    models: [
      { id: 'gpt-6-luna', name: 'GPT-6 Luna', detail: 'Lżejszy model' },
      { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', detail: 'Codzienna nauka' },
      { id: 'gpt-6-astra', name: 'GPT-6 Astra', detail: 'Złożone zadania' },
    ],
  },
  grok: {
    name: 'Grok',
    image: 'grok.webp',
    keyUrl: 'https://console.x.ai',
    placeholder: 'xai-…',
    models: [{ id: 'grok-4.7', name: 'Grok 4.7', detail: 'Tekst, obrazy i wyszukiwanie' }],
  },
};
export const MODES = { tutor: 'Wyjaśnij', hint: 'Podpowiedz', express: 'Express' };
export const HISTORY_MAX = 40;
export const USAGE_URL = 'https://chatgpt.com/settings/usage';
export const defaultModels = () =>
  Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, p.models[0].id]));
export function normalizeSettings(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const models = defaultModels();
  for (const p of Object.keys(PROVIDERS)) {
    const value = raw.models?.[p] || (p === 'gemini' ? raw.model : '');
    if (typeof value === 'string' && /^[a-zA-Z0-9._:/-]{1,120}$/.test(value)) models[p] = value;
  }
  return {
    version: 2,
    provider: Object.hasOwn(PROVIDERS, raw.provider) ? raw.provider : 'gemini',
    models,
    mode: Object.hasOwn(MODES, raw.mode) ? raw.mode : 'tutor',
    pos: ['br', 'bl', 'tr', 'tl', 'bc'].includes(raw.pos) ? raw.pos : 'br',
    voice: ['off', 'both', 'only'].includes(raw.voice) ? raw.voice : raw.voice === true ? 'only' : 'off',
    theme: ['dark', 'light', 'system'].includes(raw.theme) ? raw.theme : 'dark',
    internet: raw.internet === true,
    persistentHistory: raw.persistentHistory === true,
    expressSize: Math.min(24, Math.max(11, Number(raw.expressSize) || 14)),
    expressOpacity: Math.min(1, Math.max(0.25, Number(raw.expressOpacity) || 0.85)),
    expressDuration: Math.min(30, Math.max(3, Number(raw.expressDuration) || 8)),
    expressAnswerOnly: raw.expressAnswerOnly === true,
    activityIndicator: ['full', 'minimal', 'off'].includes(raw.activityIndicator)
      ? raw.activityIndicator
      : 'full',
    systemVoice: typeof raw.systemVoice === 'string' ? raw.systemVoice.slice(0, 500) : '',
    speechRate: Math.min(1.4, Math.max(0.7, Number(raw.speechRate) || 1)),
    voiceEngine: raw.voiceEngine === 'openai' ? 'openai' : 'system',
    openaiVoice: [
      'marin',
      'cedar',
      'coral',
      'alloy',
      'ash',
      'ballad',
      'echo',
      'fable',
      'nova',
      'onyx',
      'sage',
      'shimmer',
      'verse',
    ].includes(raw.openaiVoice)
      ? raw.openaiVoice
      : 'marin',
    openaiAuth: raw.openaiAuth === 'chatgpt' ? 'chatgpt' : 'api',
    chatgptModel: typeof raw.chatgptModel === 'string' ? raw.chatgptModel.slice(0, 120) : '',
  };
}
export const modelLabel = (provider, id) => PROVIDERS[provider]?.models.find((m) => m.id === id)?.name || id;
export const safeURL = (value) => {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};
export { shortAnswer } from './text.js';
export function cropBounds(rect, imageWidth, imageHeight) {
  const fields = ['x', 'y', 'width', 'height', 'viewportWidth', 'viewportHeight'];
  if (
    !fields.every((k) => Number.isFinite(rect?.[k])) ||
    rect.viewportWidth <= 0 ||
    rect.viewportHeight <= 0 ||
    rect.width < 8 ||
    rect.height < 8
  )
    throw new Error('Nieprawidłowy obszar zaznaczenia.');
  const sx = imageWidth / rect.viewportWidth,
    sy = imageHeight / rect.viewportHeight;
  const x = Math.max(0, Math.floor(rect.x * sx)),
    y = Math.max(0, Math.floor(rect.y * sy));
  const width = Math.min(imageWidth, Math.ceil((rect.x + rect.width) * sx)) - x,
    height = Math.min(imageHeight, Math.ceil((rect.y + rect.height) * sy)) - y;
  if (width <= 0 || height <= 0) throw new Error('Zaznaczenie znajduje się poza ekranem.');
  return { x, y, width, height };
}
