import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModels, fetchModels, accountCatalog, MODEL_TTL } from '../src/model-catalog.js';
import { expressTheme, positionWithin } from '../src/appearance.js';
import {
  saveProfile,
  applyProfile,
  listProfiles,
  savePosition,
  loadPosition,
  originOf,
} from '../src/preferences.js';
import { normalizeSettings } from '../src/config.js';
import {
  speechCacheId,
  cacheSpeech,
  cachedSpeech,
  clearSpeechCache,
  reserveSpeech,
  speechUsage,
} from '../src/speech-cache.js';

function mockStorage() {
  const values = {
    'okstudy.settings.v2': normalizeSettings({
      provider: 'claude',
      voiceEngine: 'openai',
      models: { claude: 'chosen-model' },
    }),
    'okstudy.keys.v2': { claude: 'fake-secret' },
  };
  const area = {
    async setAccessLevel() {},
    async get(keys) {
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]]));
    },
    async set(patch) {
      Object.assign(values, patch);
    },
    async remove(key) {
      delete values[key];
    },
  };
  globalThis.chrome = { storage: { local: area, session: area, sync: area } };
  return values;
}
test('live model parsing accepts future names and filters non-text models without inventing capabilities', () => {
  assert.deepEqual(
    parseModels('gemini', {
      models: [
        {
          name: 'models/new-google-family',
          displayName: 'New Google model',
          supportedGenerationMethods: ['generateContent'],
        },
        { name: 'models/embed', supportedGenerationMethods: ['embedContent'] },
      ],
    }),
    [{ id: 'new-google-family', name: 'New Google model' }]
  );
  assert.equal(
    parseModels('openai', {
      data: [{ id: 'gpt-future-astra' }, { id: 'tts-1' }, { id: 'text-embedding-3-large' }],
    }).length,
    1
  );
  assert.deepEqual(
    parseModels('claude', {
      data: [
        { id: 'future', display_name: 'Future Claude', capabilities: { image_input: { supported: false } } },
      ],
    })[0],
    { id: 'future', name: 'Future Claude', image: false }
  );
  assert.deepEqual(
    parseModels('grok', {
      models: [{ id: 'future', input_modalities: ['text', 'image'], output_modalities: ['text'] }],
    })[0],
    { id: 'future', name: 'future', image: true }
  );
  assert.throws(() => parseModels('openai', {}), /format/);
});
test('Google and Claude catalogs follow pagination using credentials only in headers', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    const parsed = new URL(url);
    const google = parsed.hostname.includes('googleapis');
    const second = parsed.searchParams.has(google ? 'pageToken' : 'after_id');
    return Response.json(
      google
        ? {
            models: [
              { name: `models/model-${second ? 2 : 1}`, supportedGenerationMethods: ['generateContent'] },
            ],
            ...(!second ? { nextPageToken: 'next-google' } : {}),
          }
        : { data: [{ id: `claude-${second ? 2 : 1}` }], has_more: !second, last_id: 'next-claude' }
    );
  });
  assert.equal((await fetchModels('gemini', 'fake-private-key')).length, 2);
  assert.equal((await fetchModels('claude', 'fake-private-key')).length, 2);
  assert.ok(calls.every((call) => !call.url.includes('fake-private-key')));
  assert.equal(calls[1].init.headers['x-goog-api-key'], 'fake-private-key');
  assert.ok(calls[3].url.includes('after_id=next-claude'));
});
test('model cache is account-specific, expires, refreshes on demand and retains useful data after failure', async (t) => {
  const stored = mockStorage();
  let calls = 0,
    fail = false;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (fail) throw new TypeError('network');
    return Response.json({ data: [{ id: `gpt-future-${calls}` }] });
  });
  const first = await accountCatalog('openai', 'fake-key-a');
  assert.equal(first.source, 'live');
  assert.equal((await accountCatalog('openai', 'fake-key-a')).source, 'cache');
  assert.equal(calls, 1);
  const forced = await accountCatalog('openai', 'fake-key-a', true);
  assert.notEqual(forced.models[0].id, first.models[0].id);
  stored['okstudy.catalog.openai'].updatedAt -= MODEL_TTL + 1;
  assert.equal((await accountCatalog('openai', 'fake-key-a')).source, 'live');
  fail = true;
  const failed = await accountCatalog('openai', 'fake-key-a', true);
  assert.equal(failed.source, 'cache');
  assert.match(failed.warning, /odświeżyć/);
  const other = await accountCatalog('openai', 'fake-key-b', true);
  assert.equal(other.source, 'bundled');
  assert.ok(!JSON.stringify(stored).includes('fake-key-a'));
});
test('text can stay faint while automatic contrast follows light and dark backgrounds', () => {
  assert.equal(normalizeSettings({ expressOpacity: 0.05 }).expressOpacity, 0.05);
  assert.equal(expressTheme({ expressContrast: 'subtle' }, [255, 255, 255]).color, '#e8eddc');
  assert.equal(expressTheme({ expressContrast: 'auto' }, [255, 255, 255]).color, '#142019');
  assert.equal(expressTheme({ expressContrast: 'auto' }, [15, 15, 15]).color, '#f6f8f1');
  assert.deepEqual(positionWithin({ x: 1, y: 1 }, 200, 40, 390, 844), { left: 186, top: 800 });
});
test('profiles preserve provider, model, speech billing choice and secrets', async () => {
  mockStorage();
  const saved = await saveProfile('Moja powtórka', {
    mode: 'express',
    expressOpacity: 0.15,
    provider: 'grok',
    voiceEngine: 'system',
    keys: { openai: 'do-not-store' },
  });
  assert.equal(saved.settings.provider, undefined);
  assert.equal(saved.settings.keys, undefined);
  const result = await applyProfile(saved.id);
  assert.equal(result.mode, 'express');
  assert.equal(result.expressOpacity, 0.15);
  assert.equal(result.provider, 'claude');
  assert.equal(result.models.claude, 'chosen-model');
  assert.equal(result.voiceEngine, 'openai');
  assert.equal((await listProfiles()).length, 4);
});
test('positions are bounded and isolated by website origin', async () => {
  mockStorage();
  await savePosition(originOf('https://example.com/path?private=content'), { x: 5, y: -1 });
  const same = await loadPosition('https://example.com');
  assert.equal(same.x, 1);
  assert.equal(same.y, 0);
  assert.equal(await loadPosition('https://other.example'), null);
  assert.equal(originOf('chrome://settings'), null);
});
test('audio replay cache separates keys, voices and speed; is bounded and deletable', async () => {
  mockStorage();
  const id = await speechCacheId('fake-key', 'D', 'marin', 1);
  assert.notEqual(id, await speechCacheId('other-key', 'D', 'marin', 1));
  assert.notEqual(id, await speechCacheId('fake-key', 'D', 'marin', 1.1));
  await cacheSpeech(id, 'data:audio/mpeg;base64,AAAA');
  assert.equal(await cachedSpeech(id), 'data:audio/mpeg;base64,AAAA');
  await cacheSpeech('too-big', 'A'.repeat(3 * 1024 * 1024));
  assert.equal(await cachedSpeech('too-big'), undefined);
  await clearSpeechCache();
  assert.equal(await cachedSpeech(id), undefined);
});
test('daily voice limit reserves concurrent attempts atomically and resets on a new day', async () => {
  const stored = mockStorage();
  const results = await Promise.allSettled([
    reserveSpeech({ speechDailyLimit: 1 }, () => true),
    reserveSpeech({ speechDailyLimit: 1 }, () => true),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await speechUsage()).count, 1);
  stored['okstudy.speechUsage'].day = 'old-day';
  await reserveSpeech({ speechDailyLimit: 1 }, () => true);
  assert.equal((await speechUsage()).count, 1);
});
