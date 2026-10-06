import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, cropBounds, shortAnswer, safeURL } from '../src/config.js';
import { readSSE, readResponses, apiError } from '../src/stream.js';
import { responsesBody, requestAI } from '../src/providers.js';

function stream(text, size = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size));
      c.close();
    },
  });
}
const event = (x) => `data: ${JSON.stringify(x)}\n\n`;
const response = (...events) =>
  new Response(stream(events.map(event).join('')), { headers: { 'Content-Type': 'text/event-stream' } });
const completed = (text) => ({
  type: 'response.completed',
  response: {
    output: [
      {
        content: [
          {
            type: 'output_text',
            text,
            annotations: [{ type: 'url_citation', url: 'https://example.com/', title: 'Źródło' }],
          },
        ],
      },
    ],
  },
});
const args = {
  provider: 'openai',
  model: 'model-test',
  mode: 'tutor',
  internet: true,
  messages: [{ role: 'user', text: 'Ile to 2 + 2?' }],
};

test('migration preserves custom models, speech-only preference and safe defaults', () => {
  const s = normalizeSettings({
    model: 'gemini-legacy',
    voice: true,
    models: { openai: 'custom-v1' },
    mode: 'express',
    expressSize: 999,
    provider: '__proto__',
  });
  assert.equal(s.models.gemini, 'gemini-legacy');
  assert.equal(s.models.openai, 'custom-v1');
  assert.equal(s.voice, 'only');
  assert.equal(s.mode, 'express');
  assert.equal(s.expressSize, 24);
  assert.equal(s.provider, 'gemini');
  assert.equal(normalizeSettings(null).persistentHistory, false);
  assert.equal(normalizeSettings({ keys: { openai: 'SECRET' } }).keys, undefined);
});
test('crop scales with device pixels and clips both edges', () => {
  assert.deepEqual(
    cropBounds(
      { x: 20, y: 10, width: 100, height: 50, viewportWidth: 1000, viewportHeight: 800 },
      2000,
      1600
    ),
    { x: 40, y: 20, width: 200, height: 100 }
  );
  assert.deepEqual(
    cropBounds({ x: -10, y: -10, width: 30, height: 30, viewportWidth: 100, viewportHeight: 100 }, 100, 100),
    { x: 0, y: 0, width: 20, height: 20 }
  );
  assert.throws(() => cropBounds({ x: NaN }, 100, 100));
  assert.throws(() =>
    cropBounds({ x: 110, y: 10, width: 10, height: 10, viewportWidth: 100, viewportHeight: 100 }, 100, 100)
  );
});
test('short answers preserve meaningful text and block unsafe links', () => {
  assert.equal(shortAnswer('TYP: OPEN\nODPOWIEDŹ: 42'), '42');
  assert.equal(shortAnswer('Długość wynosi 12 cm.'), 'Długość wynosi 12 cm.');
  assert.equal(shortAnswer('A, C'), 'A, C');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///C:/data'])
    assert.equal(safeURL(url), null);
});
test('SSE handles split UTF-8, CRLF across bytes and comments', async () => {
  const source =
    ': heartbeat\r\n\r\nevent: test\r\ndata: {"text":\r\ndata: "żółć"}\r\n\r\ndata: [DONE]\r\n\r\n';
  const events = [];
  for await (const e of readSSE(stream(source, 1))) events.push(e);
  assert.deepEqual(events, [{ text: 'żółć' }]);
});
test('Responses requires a completed event and rejects late failures', async () => {
  const delta = { type: 'response.output_text.delta', delta: 'Część odpowiedzi' };
  await assert.rejects(readResponses(response(delta)), /przed ukończeniem/);
  await assert.rejects(
    readResponses(
      response(delta, {
        type: 'response.failed',
        response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } },
      })
    ),
    /Limit planu/
  );
  await assert.rejects(readResponses(response({ type: 'response.incomplete' })), /przerwana/);
  const result = await readResponses(response(delta, completed('Pełna odpowiedź')));
  assert.equal(result.text, 'Pełna odpowiedź');
  assert.equal(result.sources[0].title, 'Źródło');
});
test('ChatGPT requests use supported input format without API-only limits', () => {
  const body = responsesBody({ ...args, plan: true, image: 'data:image/png;base64,AAAA' });
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.max_output_tokens, undefined);
  assert.equal(body.input[0].content[1].type, 'input_image');
  assert.equal(body.tools[0].type, 'web_search');
  assert.equal(responsesBody({ ...args, internet: false }).tools, undefined);
});
test('billing and subscription limits do not retry or expose upstream details', () => {
  for (const code of ['insufficient_quota', 'subscription_sharing_usage_limit_exceeded']) {
    const e = apiError(429, code + ' SECRET');
    assert.equal(e.retryable, false);
    assert.ok(!e.message.includes('SECRET'));
  }
  assert.equal(apiError(503).retryable, true);
});
test('provider adapters send correct image/search requests and ignore internal reasoning', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (String(url).includes('googleapis'))
      return response({
        candidates: [
          {
            content: { parts: [{ text: 'hidden', thought: true }, { text: 'Cztery' }] },
            finishReason: 'STOP',
            groundingMetadata: {
              groundingChunks: [{ web: { uri: 'https://example.com', title: 'Źródło' } }],
            },
          },
        ],
      });
    if (String(url).includes('anthropic'))
      return response(
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Cztery' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
        { type: 'message_stop' }
      );
    return response(completed('Cztery'));
  });
  for (const provider of ['gemini', 'claude', 'openai', 'grok']) {
    assert.equal(
      (
        await requestAI(
          { ...args, provider, image: 'data:image/png;base64,AAAA' },
          'test-only',
          new AbortController().signal,
          () => {}
        )
      ).text,
      'Cztery'
    );
  }
  assert.ok(!calls[0].url.includes('test-only'));
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'test-only');
  assert.deepEqual(calls[0].body.tools, [{ google_search: {} }]);
  assert.equal(calls[1].body.tools[0].name, 'web_search');
  assert.equal(calls[1].body.messages[0].content[1].type, 'image');
  assert.equal(calls[3].url, 'https://api.x.ai/v1/responses');
});
test('retry only before output; billing fails immediately; cancellation aborts backoff', async (t) => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    count++;
    return new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 });
  });
  await assert.rejects(requestAI(args, 'test', new AbortController().signal, () => {}));
  assert.equal(count, 1);
  globalThis.fetch = async () => {
    count++;
    return new Response('busy', { status: 503 });
  };
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(requestAI(args, 'test', controller.signal, () => {}));
  assert.equal(count, 2);
  globalThis.fetch = async () => {
    count++;
    return response(
      { type: 'response.output_text.delta', delta: 'Początek' },
      { type: 'error', error: { message: 'internal' } }
    );
  };
  await assert.rejects(requestAI(args, 'test', new AbortController().signal, () => {}));
  assert.equal(count, 3);
});
