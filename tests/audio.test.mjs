import test from 'node:test';
import assert from 'node:assert/strict';
import { startRemoteSpeech, stopRemoteSpeech, finishRemoteSpeech, SPEECH_STATE } from '../src/audio.js';

test('OpenAI speech isolates API credentials, supports cancellation, and never falls back to account tokens', async (t) => {
  const stored = {
    'okstudy.settings.v2': {},
    'okstudy.keys.v2': { openai: 'fake-openai-key', gemini: 'fake-gemini-key' },
  };
  const messages = [],
    calls = [];
  let hasPlayer = false,
    creations = 0;
  const area = {
    async setAccessLevel() {},
    async get(keys) {
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, stored[key]]));
    },
    async set(values) {
      Object.assign(stored, values);
    },
    async remove() {},
  };
  globalThis.chrome = {
    storage: { local: area, session: area, sync: area },
    runtime: {
      getURL: (name) => `chrome-extension://test/${name}`,
      async getContexts() {
        return hasPlayer ? [{}] : [];
      },
      async getPlatformInfo() {},
      async sendMessage(message) {
        messages.push(message);
        return { ok: true };
      },
    },
    offscreen: {
      async createDocument() {
        hasPlayer = true;
        creations++;
      },
    },
  };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, ...init, body: JSON.parse(init.body) });
    return new Response(new Uint8Array([1, 2, 3]));
  });
  t.after(async () => {
    await stopRemoteSpeech();
    delete globalThis.chrome;
  });
  const settings = {
    voiceEngine: 'openai',
    openaiVoice: 'cedar',
    speechRate: 1.2,
    provider: 'gemini',
    openaiAuth: 'chatgpt',
  };
  const first = await startRemoteSpeech('**Dynamika Techniczna**', settings, {
    tabId: 1,
    entryId: 'entry-1',
  });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/speech');
  assert.equal(calls[0].headers.Authorization, 'Bearer fake-openai-key');
  assert.equal(calls[0].body.input, 'Dynamika Techniczna');
  assert.equal(calls[0].body.voice, 'cedar');
  assert.equal(calls[0].body.speed, 1.2);
  assert.equal(stored[SPEECH_STATE].status, 'playing');
  assert.ok(!JSON.stringify(messages).includes('fake-openai-key'));
  assert.ok(!JSON.stringify(stored[SPEECH_STATE]).includes('audio'));
  await stopRemoteSpeech(2);
  assert.equal(stored[SPEECH_STATE].status, 'playing', 'unrelated tab must not stop playback');
  await finishRemoteSpeech('stale-id');
  assert.equal(stored[SPEECH_STATE].status, 'playing');
  await finishRemoteSpeech(first.id);
  assert.equal(stored[SPEECH_STATE].status, 'idle');
  stored[SPEECH_STATE] = { status: 'playing', id: 'survived-worker', tabId: 4, entryId: 'saved-entry' };
  await stopRemoteSpeech(2);
  assert.equal(stored[SPEECH_STATE].status, 'playing', 'worker restart must retain playback in another tab');
  await finishRemoteSpeech('old-recording');
  assert.equal(stored[SPEECH_STATE].status, 'playing');
  await finishRemoteSpeech('survived-worker');
  assert.equal(stored[SPEECH_STATE].status, 'idle');
  await startRemoteSpeech('D', settings, {}, 'fake-draft-key');
  assert.equal(calls[1].headers.Authorization, 'Bearer fake-draft-key');
  assert.equal(creations, 1, 'reuse the offscreen player');
  await stopRemoteSpeech();
  delete stored['okstudy.keys.v2'].openai;
  const beforeMissing = calls.length;
  await assert.rejects(startRemoteSpeech('D', settings), /abonament ChatGPT/);
  assert.equal(calls.length, beforeMissing, 'missing key cannot use OAuth or another provider key');
  stored['okstudy.keys.v2'].openai = 'fake-openai-key';
  let failCalls = 0;
  globalThis.fetch = async () => {
    failCalls++;
    return new Response('insufficient_quota SECRET', { status: 429 });
  };
  await assert.rejects(startRemoteSpeech('D', settings), /środków/);
  assert.equal(failCalls, 1, 'no retry that could cause duplicate speech billing');
  assert.ok(!stored[SPEECH_STATE].error.includes('SECRET'));
  let release, reached;
  const started = new Promise((resolve) => {
    reached = resolve;
  });
  globalThis.fetch = async () => {
    reached();
    await new Promise((resolve) => {
      release = resolve;
    });
    return new Response(new Uint8Array([1]));
  };
  const beforePlay = messages.filter((message) => message.type === 'play').length;
  const cancelled = startRemoteSpeech('Stare nagranie', settings, { tabId: 1 });
  await started;
  await stopRemoteSpeech(1);
  release();
  assert.deepEqual(await cancelled, { cancelled: true });
  assert.equal(messages.filter((message) => message.type === 'play').length, beforePlay);
  assert.equal(stored[SPEECH_STATE].status, 'idle');
});
