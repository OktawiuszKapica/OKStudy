import test from 'node:test';
import assert from 'node:assert/strict';

function mockStorage(seed = {}) {
  const log = [],
    data = { local: {}, session: {}, sync: {}, ...structuredClone(seed) };
  const storage = {};
  for (const area of ['local', 'session', 'sync'])
    storage[area] = {
      async setAccessLevel(value) {
        log.push(`${area}.access:${value.accessLevel}`);
      },
      async get(keys) {
        return structuredClone(
          keys == null
            ? data[area]
            : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, data[area][k]]))
        );
      },
      async set(values) {
        log.push(`${area}.set`);
        Object.assign(data[area], structuredClone(values));
      },
      async remove(keys) {
        log.push(`${area}.remove`);
        for (const k of Array.isArray(keys) ? keys : [keys]) delete data[area][k];
      },
    };
  globalThis.chrome = { storage };
  return { data, log, storage };
}
const fresh = () => import(`../src/storage.js?test=${crypto.randomUUID()}`);
test('migration writes secrets locally before removing sync, preserves old preferences', async () => {
  const { data, log } = mockStorage({
    sync: { stealthSettings: { keys: { gemini: 'test-key' }, voice: true, model: 'legacy-model' } },
    session: { oksHistory: { items: ['stara odpowiedź'] } },
  });
  const s = await fresh();
  await s.initializeStorage();
  assert.equal(data.local[s.KEYS_KEY].gemini, 'test-key');
  assert.equal(data.sync.stealthSettings, undefined);
  assert.ok(log.indexOf('local.set') < log.indexOf('sync.remove'));
  assert.ok(log.includes('local.access:TRUSTED_CONTEXTS'));
  assert.equal((await s.getSettings()).voice, 'only');
  assert.equal((await s.getHistory())[0].messages[0].text, 'stara odpowiedź');
  assert.ok(!JSON.stringify(await s.getSettings()).includes('test-key'));
});
test('failed migration preserves synchronized keys for retry', async () => {
  const { data, storage } = mockStorage({ sync: { stealthSettings: { keys: { openai: 'keep-me' } } } });
  storage.local.set = async () => {
    throw new Error('disk full');
  };
  const s = await fresh();
  await assert.rejects(s.initializeStorage(), /disk full/);
  assert.equal(data.sync.stealthSettings.keys.openai, 'keep-me');
});
test('existing settings and missing key store recover legacy keys', async () => {
  const { data } = mockStorage({
    local: { 'okstudy.settings.v2': { mode: 'hint' } },
    sync: { stealthSettings: { keys: { openai: 'recover' } } },
  });
  const s = await fresh();
  await s.initializeStorage();
  assert.equal(data.local[s.KEYS_KEY].openai, 'recover');
  assert.equal((await s.getSettings()).mode, 'hint');
});
test('concurrent answers, privacy toggles, bounded history and deletion serialize without loss', async () => {
  const { data } = mockStorage();
  const s = await fresh();
  await Promise.all(
    Array.from({ length: 45 }, (_, i) =>
      s.saveEntry({ id: `e${i}`, messages: [{ role: 'assistant', text: String(i) }] })
    )
  );
  assert.equal((await s.getHistory()).length, 40);
  await Promise.all([
    s.updateSettings({ persistentHistory: true }),
    s.saveEntry({ id: 'extra', messages: [] }),
  ]);
  assert.equal(data.session[s.HISTORY_KEY], undefined);
  assert.equal((await s.getHistory())[0].id, 'extra');
  await s.updateSettings({ persistentHistory: false });
  assert.equal(data.local[s.HISTORY_KEY], undefined);
  await s.deleteHistory('extra');
  assert.ok(!(await s.getHistory()).some((e) => e.id === 'extra'));
  await s.deleteHistory();
  assert.deepEqual(await s.getHistory(), []);
});
test('cancellation during a write rolls back partial history', async () => {
  const { storage } = mockStorage();
  const s = await fresh();
  await s.initializeStorage();
  let alive = true;
  const original = storage.session.set;
  storage.session.set = async (value) => {
    await original(value);
    alive = false;
  };
  assert.equal(await s.saveEntry({ id: 'cancelled' }, () => alive), false);
  assert.deepEqual(await s.getHistory(), []);
});
