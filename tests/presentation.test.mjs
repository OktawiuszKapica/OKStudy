import test from 'node:test';
import assert from 'node:assert/strict';
import { plainText, expressResult } from '../src/text.js';
import { speechText, createSystemSpeech } from '../src/speech.js';
import { normalizeSettings } from '../src/config.js';
import { requestAI, responsesBody } from '../src/providers.js';

test('Express removes Markdown formatting while retaining answer labels and mathematical operators', () => {
  assert.equal(
    plainText('1. **C** — genetyka bada **dziedziczenie**.\n2. _D_'),
    '1. C — genetyka bada dziedziczenie.\n2. D'
  );
  assert.equal(plainText('2 * 3 = 6; a_b + c_d; \\(x² = 9\\)'), '2 * 3 = 6; a_b + c_d; x² = 9');
  assert.equal(plainText('**Wniosek:** [tekst](https://example.com) &amp; `kod`'), 'Wniosek: tekst & kod');
  assert.equal(plainText('<script>alert(1)</script>\n\n**D**'), 'D');
});

test('answer-only extracts exactly the requested open answer or choice, never the surrounding explanation', () => {
  assert.equal(
    expressResult('{"answer":"Dynamika Techniczna","explanation":"Ignored"}', true),
    'Dynamika Techniczna'
  );
  assert.equal(expressResult('```json\n{"answer":"D"}\n```', true), 'D');
  assert.equal(expressResult('{"answer":"1. D\\n2. A, C"}', true), '1. D\n2. A, C');
  assert.equal(expressResult('**D** — krótkie wyjaśnienie', true), 'D');
  assert.equal(expressResult('**D** — krótkie wyjaśnienie', false), 'D — krótkie wyjaśnienie');
  for (const invalid of ['{"answer":null}', '{broken json', 'Uzasadnienie.\n\nWynik.'])
    assert.throws(() => expressResult(invalid, true), /samej odpowiedzi/);
});

test('existing preferences retain free speech and full progress while new options are validated', () => {
  const initial = normalizeSettings({ voice: true });
  assert.equal(initial.voice, 'only');
  assert.equal(initial.voiceEngine, 'system');
  assert.equal(initial.expressAnswerOnly, false);
  assert.equal(initial.activityIndicator, 'full');
  const custom = normalizeSettings({
    expressAnswerOnly: true,
    activityIndicator: 'off',
    voiceEngine: 'openai',
    openaiVoice: 'cedar',
    speechRate: 1.2,
  });
  assert.equal(custom.expressAnswerOnly, true);
  assert.equal(custom.activityIndicator, 'off');
  assert.equal(custom.openaiVoice, 'cedar');
  assert.equal(custom.speechRate, 1.2);
  const invalid = normalizeSettings({
    activityIndicator: 'bad',
    voiceEngine: 'bad',
    openaiVoice: 'bad',
    speechRate: 999,
  });
  assert.equal(invalid.activityIndicator, 'full');
  assert.equal(invalid.voiceEngine, 'system');
  assert.equal(invalid.openaiVoice, 'marin');
  assert.equal(invalid.speechRate, 1.4);
});

test('speech sends plain text within the API input limit', () => {
  assert.equal(speechText('**Dynamika Techniczna**'), 'Dynamika Techniczna');
  assert.ok(speechText('Długi tekst odpowiedzi. '.repeat(300)).length <= 4000);
});

test('all provider paths including the ChatGPT companion request the answer-only format', async (t) => {
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    bodies.push(JSON.parse(init.body));
    const events = String(url).includes('googleapis')
      ? [{ candidates: [{ content: { parts: [{ text: '{"answer":"D"}' }] }, finishReason: 'STOP' }] }]
      : String(url).includes('anthropic')
        ? [
            { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"answer":"D"}' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
            { type: 'message_stop' },
          ]
        : [
            {
              type: 'response.completed',
              response: { output: [{ content: [{ type: 'output_text', text: '{"answer":"D"}' }] }] },
            },
          ];
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
  const args = {
    mode: 'express',
    answerOnly: true,
    internet: false,
    model: 'test',
    messages: [{ role: 'user', text: 'ABCD?' }],
  };
  for (const provider of ['gemini', 'claude', 'openai', 'grok']) {
    const result = await requestAI(
      { ...args, provider },
      'fake-test-key',
      new AbortController().signal,
      () => {}
    );
    assert.equal(expressResult(result.text, true), 'D');
  }
  for (const body of [...bodies, responsesBody({ ...args, plan: true })])
    assert.match(JSON.stringify(body), /TYLKO ODPOWIEDŹ/);
});

test('system voice cancellation prevents delayed speech and respects the selected voice and speed', async (t) => {
  const voices = [
    { voiceURI: 'polish', lang: 'pl-PL', name: 'Polski' },
    { voiceURI: 'chosen', lang: 'pl-PL', name: 'Wybrany' },
  ];
  const spoken = [];
  const previous = { synth: globalThis.speechSynthesis, utterance: globalThis.SpeechSynthesisUtterance };
  globalThis.speechSynthesis = {
    cancel() {},
    resume() {},
    getVoices: () => voices,
    speak: (value) => spoken.push(value),
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  t.after(() => {
    globalThis.speechSynthesis = previous.synth;
    globalThis.SpeechSynthesisUtterance = previous.utterance;
  });
  const speaker = createSystemSpeech();
  speaker.speak('Nie czytaj');
  speaker.stop();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(spoken.length, 0);
  speaker.speak('**D**', { systemVoice: 'chosen', speechRate: 1.2 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(spoken[0].voice.voiceURI, 'chosen');
  assert.equal(spoken[0].text, 'D');
  assert.equal(spoken[0].rate, 1.2);
  speaker.stop();
});
