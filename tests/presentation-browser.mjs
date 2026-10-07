// Real MV3 pages, content scripts and offscreen audio; synthetic AI replies and
// a silent local WAV replace all provider calls. No accounts or paid API calls.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const root = resolve('.'),
  output = resolve('artifacts/presentation');
await mkdir(output, { recursive: true });
const server = createServer((_request, response) => {
  response.setHeader('Content-Security-Policy', "media-src 'none'");
  response.end(
    '<!doctype html><meta charset="utf-8"><title>Ćwiczenia OKStudy</title><style>body{font:20px system-ui;margin:80px;background:#eff1eb;color:#17261b}article{padding:40px;background:white;max-width:600px;border-radius:20px}h1{font-size:28px}</style><article><h1>Zadanie testowe</h1><p id="task">Wybierz odpowiedź: A, B, C czy D?</p></article>'
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const context = await chromium.launchPersistentContext(join(output, `profile-${Date.now()}`), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [
    '--enable-unsafe-extension-debugging',
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
  ],
});
const results = [],
  errors = [];
context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
const check = (label, condition) => {
  assert.ok(condition, label);
  results.push(label);
  console.log(`✓ ${label}`);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, predicate, label) {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (predicate(value)) return value;
    await pause(75);
  }
  throw new Error(`Timed out: ${label}`);
}
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).hostname,
    extension = `chrome-extension://${id}`;
  // Three seconds of silent PCM. Chromium sniffs the actual audio format; the
  // production endpoint returns MP3 in the same response/playback path.
  const wav = Buffer.alloc(44 + 8000 * 2 * 3);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  await worker.evaluate(
    (audio) => {
      globalThis.__fixture = {
        answer: '1. **C** — genetyka bada **dziedziczenie**.',
        delay: 450,
        fail: false,
        ttsFail: false,
        ttsDelay: 0,
        requests: [],
        audio,
      };
      globalThis.fetch = async (url, init) => {
        const fixture = globalThis.__fixture;
        if (!init.body) {
          if (String(url).includes('googleapis'))
            return Response.json({
              models: [
                { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
                ...(fixture.catalog || []),
              ],
            });
          if (String(url).includes('openai')) return Response.json({ data: [{ id: 'gpt-future-test' }] });
          throw new Error('Unexpected model catalog URL');
        }
        const body = JSON.parse(init.body);
        fixture.requests.push({ url: String(url), body, authorization: init.headers.Authorization });
        if (String(url) === 'https://api.openai.com/v1/audio/speech') {
          await new Promise((resolve) => setTimeout(resolve, fixture.ttsDelay));
          init.signal.throwIfAborted();
          return fixture.ttsFail
            ? new Response('insufficient_quota', { status: 429 })
            : new Response(new Uint8Array(fixture.audio));
        }
        if (!String(url).startsWith('https://generativelanguage.googleapis.com/'))
          throw new Error('Unexpected network request in test');
        const { delay, fail, hold } = fixture;
        const answer = JSON.stringify(body.system_instruction || body.systemInstruction).includes(
          'Wyjaśnij rozwiązanie'
        )
          ? 'Wyjaśnienie testowe: D wynika z podanych przesłanek.'
          : fixture.answer;
        if (hold)
          await new Promise((resolve) => {
            globalThis.__releaseAI = resolve;
          });
        else await new Promise((resolve) => setTimeout(resolve, delay));
        init.signal.throwIfAborted();
        if (fail) return new Response('insufficient_quota', { status: 429 });
        const event = { candidates: [{ content: { parts: [{ text: answer }] }, finishReason: 'STOP' }] };
        return new Response(`data: ${JSON.stringify(event)}\n\n`, {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      };
    },
    [...wav]
  );
  const options = await context.newPage();
  await options.goto(`${extension}/options.html#appearance`);
  await options.locator('#modes [data-mode="express"]').click();
  await options.locator('#expressAnswerOnly').check();
  await options.locator('#activityIndicator').selectOption('minimal');
  await options.locator('#duration').fill('30');
  await options.locator('#save').click();
  await options.getByText('Ustawienia zostały zapisane.', { exact: true }).waitFor();
  const send = (type, data = {}) =>
    options.evaluate(
      async ({ type, data }) => {
        const response = await chrome.runtime.sendMessage({ type, ...data });
        if (!response?.ok) throw new Error(response?.error);
        return response.data;
      },
      { type, data }
    );
  await send('settings.save', { keys: { gemini: 'fake-gemini-key' } });
  await options.reload();
  await options.locator('#expressAnswerOnly:checked').waitFor();
  check(
    'answer-only and indicator preferences persist and update their previews',
    (await options.locator('#activityIndicator').inputValue()) === 'minimal' &&
      (await options.locator('#expressSample').textContent()) === 'Dynamika Techniczna' &&
      (await options.locator('#activityMinimal').isVisible())
  );
  await options.screenshot({ path: join(output, 'settings-express.png'), fullPage: true });
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();
  const tabId = await worker.evaluate(
    async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id
  );
  const browserCDP = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await browserCDP.send('Target.getTargets', {
    filter: [{ type: 'tab', exclude: false }],
  });
  await browserCDP.send('Extensions.triggerAction', {
    id,
    targetId: targetInfos.find((target) => target.url.startsWith(url)).targetId,
  });
  const cdp = await context.newCDPSession(page);
  // DevTools can inspect a closed shadow root without weakening production isolation.
  const notes = async () => {
    const { root: document } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const found = [];
    const visit = (node) => {
      const attrs = node.attributes || [],
        index = attrs.indexOf('class');
      if (index >= 0 && attrs[index + 1].split(' ').includes('note')) found.push(node);
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) visit(child);
    };
    visit(document);
    return Promise.all(
      found.map(async (node) => {
        const { object } = await cdp.send('DOM.resolveNode', { nodeId: node.nodeId });
        const { result } = await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          returnByValue: true,
          functionDeclaration:
            'function(){const r=this.getBoundingClientRect(),s=getComputedStyle(this);return {text:this.textContent,classes:this.className,width:r.width,height:r.height,x:r.x,y:r.y,color:s.color,background:s.backgroundColor,opacity:s.opacity,pointerEvents:s.pointerEvents,buttons:this.querySelectorAll("button").length,dots:this.querySelectorAll(".dot").length,button:this.querySelector("button")?.getAttribute("aria-label")}}',
        });
        await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
        return result.value;
      })
    );
  };
  const fixture = (patch) => worker.evaluate((patch) => Object.assign(globalThis.__fixture, patch), patch);
  const speech = () =>
    worker.evaluate(async () => (await chrome.storage.session.get('okstudy.speech'))['okstudy.speech']);
  const snap = () => send('snapshot', { tabId });
  const job = async (expected) => {
    try {
      return await until(snap, (value) => value.job.status === expected, `job ${expected}`);
    } catch (e) {
      console.error('Synthetic job state:', JSON.stringify((await snap()).job));
      throw e;
    }
  };
  const launch = async () => {
    await page.bringToFront();
    await page.locator('#task').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await send('launch', { tabId, kind: 'text' });
    await job('running');
  };
  const answer = (expected) =>
    until(
      notes,
      (values) => values.some((note) => note.classes.includes('express') && note.text === expected),
      `answer ${expected}`
    );

  await send('settings.save', { settings: { expressAnswerOnly: false, activityIndicator: 'full' } });
  await launch();
  const full = await until(
    notes,
    (values) => values.some((note) => note.text.includes('analizuje zadanie')),
    'full indicator'
  );
  check('full progress keeps its readable message and cancel action', full[0].button === 'Przerwij analizę');
  await job('done');
  await answer('1. C — genetyka bada dziedziczenie.');
  check(
    'real Express overlay displays formatted model output without literal stars',
    !(await notes())[0].text.includes('*')
  );
  await page.screenshot({ path: join(output, 'express-clean.png') });

  await send('settings.save', { settings: { expressAnswerOnly: true, activityIndicator: 'minimal' } });
  await fixture({ answer: '{"answer":"D"}', hold: true });
  const before = (await snap()).history.length;
  await launch();
  const minimal = (
    await until(notes, (values) => values.some((note) => note.dots === 3), 'minimal indicator')
  ).find((note) => note.dots === 3);
  check(
    'minimal indicator is a 36×28px control with three dots',
    minimal.width === 36 && minimal.height === 28
  );
  await page.screenshot({ path: join(output, 'indicator-minimal.png') });
  await page.mouse.click(minimal.x + minimal.width / 2, minimal.y + minimal.height / 2);
  await job('idle');
  await worker.evaluate(() => globalThis.__releaseAI());
  await pause(150);
  check(
    'clicking the dots cancels analysis without a late answer',
    (await snap()).history.length === before && (await notes()).length === 0
  );
  await fixture({ delay: 450, hold: false });
  await launch();
  await job('done');
  await answer('D');
  check('ABCD answer-only displays exactly D', (await snap()).history[0].messages.at(-1).text === 'D');
  await fixture({ answer: '{"answer":"Dynamika Techniczna"}' });
  await launch();
  await job('done');
  await answer('Dynamika Techniczna');
  check(
    'open answer-only displays exactly Dynamika Techniczna',
    (await notes())[0].text === 'Dynamika Techniczna'
  );
  await page.screenshot({ path: join(output, 'answer-only.png') });

  await send('settings.save', { settings: { activityIndicator: 'off' } });
  await fixture({ fail: true, delay: 700 });
  await launch();
  await pause(80);
  check('off setting shows no activity message', (await notes()).length === 0);
  await job('error');
  const error = (
    await until(notes, (values) => values.some((note) => note.classes.includes('error')), 'small error')
  )[0];
  check(
    'failure shows only a tiny accessible exclamation mark',
    error.width === 24 &&
      error.height === 24 &&
      error.text.startsWith('!') &&
      error.button.includes('środków')
  );
  await page.screenshot({ path: join(output, 'indicator-error.png') });
  await pause(1650);
  check(
    'small error and toolbar badge disappear after 1.5 seconds',
    (await notes()).length === 0 &&
      (await worker.evaluate((tabId) => chrome.action.getBadgeText({ tabId }), tabId)) === ''
  );
  check('error details remain available in the panel state', (await snap()).job.error.includes('środków'));

  await options.reload();
  await options.locator('#voiceEngine').selectOption('openai');
  await options.locator('#openaiVoice').selectOption('cedar');
  await options.locator('#speechRate').fill('115');
  await options.locator('#speechKey').fill('fake-openai-key');
  await options.locator('#voice').selectOption('both');
  check(
    'OpenAI voice exposes costs and keeps the API key masked',
    (await options.locator('#speechKey').getAttribute('type')) === 'password' &&
      (await options.locator('.voice-disclosure').isVisible()) &&
      (await options.locator('#openaiVoice option').count()) === 13
  );
  await options.locator('#testVoice').click();
  await until(speech, (value) => value?.status === 'playing', 'preview playback');
  const contexts = await worker.evaluate(() =>
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  );
  const ttsRequest = await worker.evaluate(() =>
    globalThis.__fixture.requests.filter((request) => request.url.includes('/audio/speech')).at(-1)
  );
  check(
    'voice preview uses selected voice, tempo and draft OpenAI key in a real offscreen player',
    contexts.length === 1 &&
      ttsRequest.body.voice === 'cedar' &&
      ttsRequest.body.speed === 1.15 &&
      ttsRequest.authorization === 'Bearer fake-openai-key'
  );
  await until(speech, (value) => value?.status === 'idle', 'playback ended');
  check('actual audio playback reports completion', true);
  await options.locator('#save').click();
  await options.getByText('Ustawienia zostały zapisane.', { exact: true }).waitFor();
  await options.reload();
  await options.locator('#openaiSpeechFields').waitFor();
  check(
    'saved speech preferences survive reload without exposing the key',
    (await options.locator('#speechKey').inputValue()) === '' &&
      (await options.locator('#openaiVoice').inputValue()) === 'cedar'
  );
  await options.screenshot({ path: join(output, 'settings-voice.png'), fullPage: true });
  await options.setViewportSize({ width: 390, height: 844 });
  check(
    'new settings fit a narrow viewport',
    await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  );
  await options.screenshot({ path: join(output, 'settings-voice-narrow.png'), fullPage: true });
  await options.setViewportSize({ width: 1280, height: 900 });

  await fixture({ fail: false, delay: 450, answer: '{"answer":"D"}' });
  await launch();
  await job('done');
  await answer('D');
  await until(speech, (value) => value?.status === 'playing', 'automatic playback');
  check(
    'OpenAI reads a Gemini answer even when the task page forbids media',
    (await snap()).history[0].provider === 'gemini'
  );
  await send('cancel', { tabId });
  await until(speech, (value) => value?.status === 'idle', 'cancel playback');
  check('cancel also stops OpenAI audio after analysis has finished', (await notes()).length === 0);

  await send('speech.cache.clear');
  await fixture({ ttsFail: true });
  await launch();
  await job('done');
  await until(speech, (value) => value?.status === 'error', 'speech billing error');
  const preserved = await until(
    notes,
    (values) =>
      values.some((note) => note.classes.includes('error')) && values.some((note) => note.text === 'D'),
    'answer and speech error'
  );
  check(
    'speech failure preserves the answer and briefly shows the small error',
    preserved.length === 2 && (await snap()).history[0].messages.at(-1).text === 'D'
  );

  await fixture({ ttsFail: false });
  await send('settings.save', { settings: { voice: 'only' } });
  await launch();
  await job('done');
  await until(speech, (value) => value?.status === 'playing', 'voice-only playback');
  check('voice-only mode plays audio without a floating text answer', (await notes()).length === 0);
  await send('speech.stop');

  const current = (await snap()).history[0];
  await worker.evaluate((entryId) => chrome.storage.session.set({ 'okstudy.selected': entryId }), current.id);
  const panel = await context.newPage();
  await panel.goto(`${extension}/panel.html`);
  await panel.locator('#speakAnswer').waitFor();
  await panel.locator('#speakAnswer').click();
  await until(speech, (value) => value?.status === 'playing', 'panel playback');
  check(
    'panel read-aloud uses OpenAI and offers a stop action',
    (await panel.locator('#speakAnswer').getAttribute('aria-label')) === 'Zatrzymaj odczyt'
  );
  await panel.locator('#speakAnswer').click();
  await until(speech, (value) => value?.status === 'idle', 'panel stop');
  await send('speech.cache.clear');
  await fixture({ ttsDelay: 1200 });
  await panel.locator('#speakAnswer').click();
  await until(speech, (value) => value?.status === 'loading', 'pending speech');
  await panel.locator('#speakAnswer').click();
  await pause(1350);
  check('cancel during generation prevents delayed audio playback', (await speech()).status === 'idle');
  await fixture({ ttsDelay: 0 });
  const audioBefore = await worker.evaluate(
    () => globalThis.__fixture.requests.filter((request) => request.url.includes('/audio/speech')).length
  );
  await send('speech.read', { entryId: current.id, tabId });
  await until(speech, (value) => value?.status === 'playing', 'first cached recording');
  await send('speech.stop');
  await send('speech.read', { entryId: current.id, tabId });
  const cached = await until(speech, (value) => value?.status === 'playing', 'replayed recording');
  check(
    'replaying the same answer uses the recording without another API request',
    cached.fromCache === true &&
      (await worker.evaluate(
        () => globalThis.__fixture.requests.filter((request) => request.url.includes('/audio/speech')).length
      )) ===
        audioBefore + 1
  );
  await send('speech.stop');

  await send('settings.save', {
    settings: {
      voice: 'off',
      expressStyle: 'text',
      expressContrast: 'auto',
      expressOpacity: 1,
      activityIndicator: 'off',
    },
  });
  await launch();
  await job('done');
  await answer('D');
  const automatic = (
    await until(
      notes,
      (values) => values.some((note) => note.color === 'rgb(20, 32, 25)'),
      'automatic contrast'
    )
  )[0];
  check(
    'automatic contrast is readable on a light page without extra answer controls',
    automatic.buttons === 0 && automatic.pointerEvents === 'none'
  );
  await page.keyboard.down('Alt');
  await page.mouse.move(automatic.x + 6, automatic.y + 6);
  await page.mouse.down();
  await page.mouse.move(180, 370, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const moved = (await notes())[0];
  check('Alt-drag moves the answer without obscuring the rest of the page', moved.x < 300 && moved.y < 450);
  await launch();
  await job('done');
  await answer('D');
  const remembered = (await until(notes, (values) => values[0]?.x < 300, 'saved position'))[0];
  check(
    'the next answer restores the position for this website',
    Math.abs(remembered.x - moved.x) < 2 && Math.abs(remembered.y - moved.y) < 2
  );
  await send('settings.save', { settings: { expressContrast: 'subtle', expressOpacity: 0.05 } });
  await launch();
  await job('done');
  await answer('D');
  check(
    'the subtle option preserves a barely visible answer at 5% opacity',
    (await notes())[0].opacity === '0.05'
  );
  await send('settings.save', {
    settings: { expressStyle: 'card', expressOpacity: 1, expressContrast: 'auto' },
  });
  await launch();
  await job('done');
  await answer('D');
  check('card styling remains optional', (await notes())[0].classes.includes('express-card'));
  await page.screenshot({ path: join(output, 'express-card.png') });
  const explainAnswer = (await notes())[0];
  await page.keyboard.down('Alt');
  await page.mouse.click(
    explainAnswer.x + explainAnswer.width / 2,
    explainAnswer.y + explainAnswer.height / 2
  );
  await page.keyboard.up('Alt');
  await job('running');
  const explained = await job('done');
  check(
    'Alt-click requests a full explanation in the panel without adding an on-page label',
    explained.history[0].messages.length === 4 &&
      explained.history[0].mode === 'tutor' &&
      explained.settings.mode === 'express' &&
      explained.history[0].messages.at(-1).text.includes('Wyjaśnienie testowe')
  );

  await options.reload();
  await options.locator('#profile').selectOption('quick');
  check(
    'the discreet preset adjusts controls without changing the provider',
    (await options.locator('#opacity').inputValue()) === '35' &&
      (await send('snapshot')).settings.provider === 'gemini'
  );
  await options.locator('#profileName').fill('Moja powtórka');
  await options.locator('#saveProfile').click();
  await options.getByText('Profil został zapisany.', { exact: true }).waitFor();
  check(
    'custom profiles can be saved from the settings UI',
    (await send('profiles.list')).some((profile) => profile.name === 'Moja powtórka')
  );
  await options.locator('#save').click();
  await options.getByText('Ustawienia zostały zapisane.', { exact: true }).waitFor();
  await options.getByRole('link', { name: 'AI i połączenia', exact: true }).click();
  await fixture({
    catalog: [
      {
        name: 'models/new-google-family-test',
        displayName: 'Nowa nazwa Google — test',
        supportedGenerationMethods: ['generateContent'],
      },
    ],
  });
  await options.locator('#refreshModels').click();
  await until(
    () => options.locator('#model option[value="new-google-family-test"]').count(),
    (count) => count === 1,
    'live new model'
  );
  check('a renamed Google model appears from the live catalog without an extension update', true);
  check(
    'a new model gets a visible marker',
    (await options.locator('#model option[value="new-google-family-test"]').textContent()).includes('Nowy')
  );
  await options.locator('#model').selectOption('new-google-family-test');
  await options.locator('#favoriteModel').click();
  await until(
    () => options.locator('#favoriteModels button').count(),
    (count) => count === 1,
    'favorite model button'
  );
  check(
    'favorites have a quick switch and sort first',
    (await options.locator('#model option').first().getAttribute('value')) === 'new-google-family-test'
  );
  await options.locator('#save').click();
  await options.getByText('Ustawienia zostały zapisane.', { exact: true }).waitFor();
  await fixture({ catalog: [] });
  await options.locator('#refreshModels').click();
  await until(
    () => options.locator('#modelCatalogStatus').textContent(),
    (text) => text.includes('nie ma na liście'),
    'retired model warning'
  );
  check(
    'a removed model stays visible with a warning instead of silently switching',
    (await options.locator('#model').inputValue()) === 'new-google-family-test'
  );
  await send('settings.save', { settings: { models: { gemini: 'gemini-3.8-flash' } } });
  const popup = await context.newPage();
  await popup.goto(`${extension}/popup.html`);
  await popup.locator('.quick-preferences summary').click();
  await popup.locator('#quickIndicator').selectOption('minimal');
  await until(
    () => send('snapshot'),
    (value) => value.settings.activityIndicator === 'minimal',
    'quick setting'
  );
  check('popup quick settings save without opening the full settings page', true);
  await popup.locator('#quickProfile').selectOption('quick');
  await until(
    () => send('snapshot'),
    (value) => value.settings.activityIndicator === 'off',
    'quick profile'
  );
  check(
    'popup profiles apply the whole presentation preset',
    (await send('snapshot')).settings.expressOpacity === 0.35
  );
  await popup.setViewportSize({ width: 400, height: 950 });
  await popup.screenshot({ path: join(output, 'popup-quick-settings.png'), fullPage: true });
  check('no JavaScript errors in settings, content, panel or offscreen pages', errors.length === 0);
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify({ passed: results, errors, testedAt: new Date().toISOString() }, null, 2)
  );
} catch (error) {
  console.error(error);
  console.error('Browser errors:', errors);
  await writeFile(
    join(output, 'failure.json'),
    JSON.stringify({ passed: results, errors, error: error.message }, null, 2)
  );
  process.exitCode = 1;
} finally {
  await context.close();
  server.close();
}
