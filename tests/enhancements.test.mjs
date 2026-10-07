import test from 'node:test';
import assert from 'node:assert/strict';
import { updateLibrary, decorateModels, toggleFavorite, libraryScope } from '../src/model-tools.js';
import { inspectPixels } from '../src/image-quality.js';
import { validateTask } from '../desktop/bridge.js';
import { readResponses } from '../src/stream.js';

test('desktop/account streams collect done events once, exclude analysis and still require success', async () => {
  const read = (events) =>
    readResponses(new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')));
  const finish = { type: 'response.completed', response: { status: 'completed', error: null, output: [] } };
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', channel: 'analysis' } },
    { type: 'response.output_text.delta', output_index: 0, delta: 'hidden' },
    { type: 'response.output_text.delta', output_index: 1, delta: 'D' },
    { type: 'response.output_text.done', output_index: 1, text: 'D' },
    { type: 'response.content_part.done', output_index: 1, part: { type: 'output_text', text: 'D' } },
    {
      type: 'response.output_item.done',
      output_index: 1,
      item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'D' }] },
    },
  ];
  assert.equal((await read([...events, finish])).text, 'D');
  assert.equal(
    (await read([{ type: 'response.output_text.done', text: 'only done' }, finish])).text,
    'only done'
  );
  await assert.rejects(read(events), /ukończeniem/);
  await assert.rejects(
    read([...events, finish, { type: 'response.failed', response: { error: { code: 'bad' } } }])
  );
  await assert.rejects(read([...events, { ...finish, response: { error: { code: 'bad' } } }]));
  await assert.rejects(read([{ type: 'response.refusal.done', refusal: 'refused' }, finish]));
});

test('new markers require a real baseline, expire and do not renew on refresh', () => {
  const old = [{ id: 'old', name: 'Old' }],
    next = [...old, { id: 'new', name: 'New' }];
  const first = updateLibrary({}, old, 100);
  assert.deepEqual(first.fresh, {});
  const added = updateLibrary(first, next, 200);
  assert.equal(decorateModels(next, added, 201)[1].isNew, true);
  const refreshed = updateLibrary(added, next, 300);
  assert.equal(refreshed.fresh.new, 200);
  assert.equal(decorateModels(next, refreshed, 86400201)[1].isNew, false);
  assert.deepEqual(updateLibrary(refreshed, old, 400).fresh, {});
});
test('favorites keep chosen order, cap at eight and never invent retired models', () => {
  let library = {};
  for (let i = 0; i < 8; i++) library = toggleFavorite(library, `m${i}`);
  assert.throws(() => toggleFavorite(library, 'ninth'), /8 ulubionych/);
  assert.throws(() => toggleFavorite(library, 'invalid space'));
  const actual = [{ id: 'm2' }, { id: 'm1' }, { id: 'unstarred' }];
  assert.deepEqual(
    decorateModels(actual, library).map((m) => m.id),
    ['m1', 'm2', 'unstarred']
  );
  assert.equal(decorateModels(actual, library).length, 3);
  assert.equal(toggleFavorite(library, 'm1').favorites.includes('m1'), false);
});
test('catalog metadata is scoped by provider and credential without plaintext', async () => {
  const scopes = await Promise.all([
    libraryScope('openai', 'key-a'),
    libraryScope('openai', 'key-b'),
    libraryScope('gemini', 'key-a'),
    libraryScope('chatgpt', 'account-a'),
  ]);
  assert.equal(new Set(scopes).size, 4);
  assert.ok(scopes.every((s) => !s.includes('key-') && !s.includes('account-')));
});
test('local crop check warns about tiny, blank and blurred crops, accepts sharp detail', () => {
  const w = 256,
    h = 100,
    pixels = new Uint8ClampedArray(w * h * 4);
  pixels.fill(255);
  assert.match(inspectPixels(pixels, w, h), /kontrast/);
  assert.match(inspectPixels(pixels, 50, 20), /mały/);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) pixels[(y * w + x) * 4 + c] = x;
  assert.match(inspectPixels(pixels, w, h), /rozmyty/);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) pixels[(y * w + x) * 4 + c] = x % 8 < 4 && y % 8 < 4 ? 0 : 255;
  assert.equal(inspectPixels(pixels, w, h), '');
});
test('Windows bridge enforces bounded image-only independent requests and explicit provider', () => {
  const input = {
    provider: 'openai',
    model: 'model-test',
    mode: 'express',
    image: 'data:image/png;base64,YQ==',
    key: 'mock',
    answerOnly: true,
    messages: [{ role: 'assistant', text: 'D' }],
  };
  const task = validateTask(input);
  assert.equal(task.messages.length, 1);
  assert.equal(task.messages[0].role, 'user');
  assert.ok(!task.messages[0].text.includes('D'));
  for (const change of [
    { provider: 'unknown' },
    { model: '../ bad' },
    { image: 'https://private.test/image' },
    { key: '' },
    { key: 'x'.repeat(4097) },
  ])
    assert.throws(() => validateTask({ ...input, ...change }));
  assert.equal(validateTask({ ...input, provider: 'chatgpt', key: '' }).provider, 'openai');
});
