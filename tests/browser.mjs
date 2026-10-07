import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const root = resolve('.'),
  output = resolve('artifacts/browser');
await mkdir(output, { recursive: true });
const server = createServer((_q, r) =>
  r.end(
    '<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Ćwiczenia z matematyki</title><style>body{font:20px system-ui;background:#f3f0e8;color:#18241c;margin:80px;line-height:1.7}article{background:white;border:1px solid #bfc7b8;border-radius:20px;padding:36px;max-width:700px}h1{font-size:30px}p{font-size:22px}</style></head><body><article><small>MATEMATYKA · RÓWNANIA</small><h1>Rozwiąż równanie kwadratowe</h1><p id="task">x² − 5x + 6 = 0</p><p>Znajdź oba rozwiązania i sprawdź wynik.</p></article></body></html>'
  )
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
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
const errors = [],
  results = [];
context.on('page', (page) =>
  page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message}`))
);
const check = (label, value) => {
  assert.ok(value, label);
  results.push(label);
  console.log(`✓ ${label}`);
};
let worker;
try {
  worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).hostname,
    extension = `chrome-extension://${id}`;
  // Mock at the actual service-worker boundary: no real API keys or paid calls.
  await worker.evaluate(() => {
    globalThis.__testRequests = [];
    globalThis.__testDelay = 0;
    globalThis.__testFail = false;
    const nativeFetch = fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('data:')) return nativeFetch(url, init);
      if (!String(url).startsWith('https://generativelanguage.googleapis.com/'))
        throw new Error('Unexpected network request in test');
      const body = JSON.parse(init.body);
      globalThis.__testRequests.push(body);
      const wait = globalThis.__testDelay;
      const answer =
        body.contents.length > 1
          ? 'Możemy rozłożyć wielomian na dwa czynniki: \\(x-2)(x-3)=0\\). Każdy z czynników może być zerem.'
          : '### Rozwiążmy to krok po kroku\n\nMamy równanie \\(x^2-5x+6=0\\).\n\n1. Szukamy dwóch liczb, których suma to **5**, a iloczyn to **6**.\n2. Są to **2** i **3**, więc zapisujemy:\n\n\\[(x-2)(x-3)=0\\]\n\n3. Przyrównujemy każdy czynnik do zera.\n\n**Wniosek:** \\(x=2\\) lub \\(x=3\\).';
      const bodyStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const event = (obj) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
          controller.enqueue(
            event({ candidates: [{ content: { parts: [{ text: answer.slice(0, 80) }] } }] })
          );
          const timer = setTimeout(() => {
            if (globalThis.__testFail) {
              controller.enqueue(event({ error: { code: 429, message: 'insufficient_quota' } }));
            } else
              controller.enqueue(
                event({
                  candidates: [{ content: { parts: [{ text: answer.slice(80) }] }, finishReason: 'STOP' }],
                })
              );
            controller.close();
          }, wait);
          init.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              try {
                controller.error(new DOMException('Aborted', 'AbortError'));
              } catch {}
            },
            { once: true }
          );
        },
      });
      return new Response(bodyStream, { headers: { 'Content-Type': 'text/event-stream' } });
    };
  });
  const options = await context.newPage();
  await options.goto(`${extension}/options.html`);
  await options.locator('#providers button').first().waitFor();
  await options.locator('#apiKey').fill('test-key-not-real');
  await options.locator('#save').click();
  await options.getByText('Ustawienia zostały zapisane.', { exact: true }).waitFor();
  check('settings save in actual MV3 extension', (await options.locator('#apiKey').inputValue()) === '');
  await options.evaluate(() => document.fonts.ready);
  await writeFile(
    join(output, 'font-check.json'),
    JSON.stringify(
      await options.evaluate(() => ({
        body: getComputedStyle(document.body).fontFamily,
        button: getComputedStyle(document.getElementById('testKey')).fontFamily,
        loaded: document.fonts.check('500 14px Manrope'),
      })),
      null,
      2
    )
  );
  await options.screenshot({ path: join(output, 'settings-dark.png'), fullPage: true });
  await options.locator('#testKey').click();
  await options.getByText('Połączenie działa. Model odpowiedział poprawnie.', { exact: true }).waitFor();
  check(
    'connection test uses selected provider',
    (await worker.evaluate(() => globalThis.__testRequests.length)) === 1
  );
  await options.getByRole('link', { name: 'Odpowiedzi i wygląd' }).click();
  await options.locator('#theme').selectOption('light');
  await options.screenshot({ path: join(output, 'settings-light.png'), fullPage: true });
  await options.locator('#theme').selectOption('dark');
  await options.locator('#save').click();
  await options.setViewportSize({ width: 390, height: 844 });
  await options.getByRole('link', { name: 'AI i połączenia' }).click();
  check(
    'settings fit a narrow viewport',
    await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  );
  await options.screenshot({ path: join(output, 'settings-narrow.png'), fullPage: true });
  await options.setViewportSize({ width: 1280, height: 900 });
  const popup = await context.newPage();
  await popup.goto(`${extension}/popup.html`);
  await popup.locator('#providerName').getByText('Gemini').waitFor();
  await popup.locator('#connection').click();
  await popup.locator('#quickProvider').selectOption('openai:api');
  await popup.waitForFunction(() => document.getElementById('providerName').textContent === 'OpenAI');
  check(
    'popup changes provider without leaving the current task',
    (await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'snapshot' }))).data.settings.provider ===
      'openai'
  );
  await popup.locator('#quickProvider').selectOption('gemini:api');
  await popup.waitForFunction(() => document.getElementById('providerName').textContent === 'Gemini');
  await popup.locator('#quickModel').selectOption('gemini-3.5-flash-lite');
  await popup.waitForFunction(() => document.getElementById('modelName').textContent.includes('Flash-Lite'));
  check(
    'popup saves the model independently for each provider',
    (await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'snapshot' }))).data.settings.models
      .gemini === 'gemini-3.5-flash-lite'
  );
  await popup.locator('#quickModel').selectOption('gemini-3.8-flash');
  await popup.waitForFunction(() => document.getElementById('modelName').textContent === 'Gemini 3.8 Flash');
  await popup.locator('#connection').click();
  await popup.setViewportSize({ width: 400, height: 680 });
  await popup.screenshot({ path: join(output, 'popup.png'), fullPage: true });
  const panel = await context.newPage();
  await panel.goto(`${extension}/panel.html`);
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.screenshot({ path: join(output, 'panel-welcome.png'), fullPage: true });
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();
  const tabId = await worker.evaluate(
    async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
  );
  assert.ok(tabId);
  const send = (type, data = {}) =>
    options.evaluate(
      async ({ type, data }) => {
        const result = await chrome.runtime.sendMessage({ type, ...data });
        if (!result?.ok) throw new Error(result?.error);
        return result.data;
      },
      { type, data }
    );
  const waitJob = async (expected) => {
    for (let i = 0; i < 100; i++) {
      const s = await send('snapshot', { tabId });
      if (s.job.status === expected) return s;
      if (s.job.status === 'error' && expected !== 'error') throw new Error(s.job.error);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for ${expected}`);
  };
  // Invoke the real toolbar action through CDP to grant activeTab. Synthetic
  // page key events cannot trigger browser accelerators in headless Chromium.
  const browserCDP = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await browserCDP.send('Target.getTargets', {
    filter: [{ type: 'tab', exclude: false }],
  });
  const targetInfo = targetInfos.find((t) => t.type === 'tab' && t.url.startsWith(url));
  assert.ok(targetInfo, JSON.stringify(targetInfos));
  await browserCDP.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
  await page.locator('h1').click();
  await send('launch', { tabId, kind: 'screen' });
  let done = await waitJob('done');
  check('toolbar action grants activeTab and captures screenshot', done.history.length === 1);
  check(
    'captured screenshot reaches mock AI',
    await worker.evaluate(() =>
      globalThis.__testRequests.at(-1).contents[0].parts.some((p) => p.inline_data?.data)
    )
  );
  await worker.evaluate(async (tabId) => {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        try {
          await chrome.storage.local.get('okstudy.keys.v2');
          return false;
        } catch {
          return true;
        }
      },
    });
    if (!result[0].result) throw new Error('Content script can access secrets');
  }, tabId);
  check('page content script cannot access stored API keys', true);
  await send('launch', { tabId, kind: 'region' });
  await waitJob('selecting');
  await new Promise((r) => setTimeout(r, 300));
  await page.keyboard.press('ArrowRight');
  await page.screenshot({ path: join(output, 'selection-preview.png') });
  const countBefore = await worker.evaluate(() => globalThis.__testRequests.length);
  check('region does not upload before confirmation', countBefore === 2);
  await page.keyboard.press('Enter');
  done = await waitJob('done');
  check('confirmed crop finishes and is saved', done.history.length === 2);
  await send('followup', { tabId, id: done.history[0].id, question: 'Wyjaśnij prościej.' });
  done = await waitJob('done');
  // The launch acknowledgement can precede async history lookup; wait for 4 messages.
  for (let i = 0; i < 50 && done.history[0].messages.length < 4; i++) {
    await new Promise((r) => setTimeout(r, 100));
    done = await send('snapshot', { tabId });
  }
  check('follow-up retains conversation and image context', done.history[0].messages.length === 4);
  await worker.evaluate((id) => chrome.storage.session.set({ 'okstudy.selected': id }), done.history[0].id);
  await panel.locator('.message-assistant').first().waitFor();
  check('math renders using bundled KaTeX', (await panel.locator('.katex').count()) > 0);
  await panel.screenshot({ path: join(output, 'panel-answer.png'), fullPage: true });
  await panel.locator('#showHistory').click();
  await panel.locator('#historySearch').fill('czynniki');
  check('history searches answer content', (await panel.locator('.history-row').count()) === 1);
  await panel.locator('.history-row').click();
  const downloadPromise = panel.waitForEvent('download');
  await panel.locator('#exportAnswer').click();
  const download = await downloadPromise;
  await download.saveAs(join(output, 'exported-note.md'));
  check(
    'Markdown export contains conversation',
    (await readFile(join(output, 'exported-note.md'), 'utf8')).includes('Wyjaśnij prościej')
  );
  // Re-activate task tab before capturing again.
  await page.bringToFront();
  await worker.evaluate(() => {
    globalThis.__testDelay = 2000;
  });
  await send('launch', { tabId, kind: 'screen' });
  await waitJob('running');
  await send('cancel', { tabId });
  await new Promise((r) => setTimeout(r, 2200));
  const cancelled = await send('snapshot', { tabId });
  check(
    'cancelled stream never overwrites UI or history',
    cancelled.job.status === 'idle' && cancelled.history.length === 2
  );
  await worker.evaluate(() => {
    globalThis.__testDelay = 0;
    globalThis.__testFail = true;
  });
  await send('launch', { tabId, kind: 'screen' });
  const failed = await waitJob('error');
  check(
    'partial failed answer is not stored as success',
    failed.history.length === 2 && /środków/.test(failed.job.error)
  );
  await worker.evaluate(() => {
    globalThis.__testFail = false;
  });
  const beforeEscape = await worker.evaluate(() => globalThis.__testRequests.length);
  await send('launch', { tabId, kind: 'region' });
  await waitJob('selecting');
  await new Promise((r) => setTimeout(r, 300));
  await page.keyboard.press('Escape');
  await waitJob('idle');
  check(
    'Escape discards region without sending it',
    (await worker.evaluate(() => globalThis.__testRequests.length)) === beforeEscape
  );
  await worker.evaluate(() => {
    globalThis.__testDelay = 1500;
  });
  await send('launch', { tabId, kind: 'screen' });
  await waitJob('running');
  await worker.evaluate(() => {
    globalThis.__testDelay = 0;
  });
  // Text analysis avoids the screenshot API's two captures/second limit.
  await page.locator('#task').evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await send('launch', { tabId, kind: 'text' });
  done = await waitJob('done');
  await new Promise((r) => setTimeout(r, 1600));
  const replaced = await send('snapshot', { tabId });
  check(
    'new task replaces previous stream without a late history entry',
    replaced.history.length === 3 && replaced.history[0].source === 'text'
  );
  check(
    'text analysis sends no screenshot',
    await worker.evaluate(
      () => !globalThis.__testRequests.at(-1).contents[0].parts.some((p) => p.inline_data)
    )
  );
  await worker.evaluate(async () => {
    const key = 'okstudy.history.v2',
      records = (await chrome.storage.session.get(key))[key];
    const bad = {
      ...records[0],
      id: 'xss-test',
      messages: [
        {
          role: 'assistant',
          text: '<img src=x onerror="window.PWNED=true"><script>window.PWNED=true</script> [link](javascript:alert(1)) OKSTUDYMATHPLACEHOLDER99END \\(x^2\\)',
        },
      ],
    };
    await chrome.storage.session.set({ [key]: [bad, ...records], 'okstudy.selected': bad.id });
  });
  await panel
    .locator('#conversation')
    .getByText(/OKSTUDYMATHPLACEHOLDER99END/)
    .waitFor();
  check(
    'model Markdown cannot inject scripts, images or executable links',
    await panel.evaluate(
      () =>
        !window.PWNED &&
        !document.querySelector(
          '#conversation img,#conversation script,#conversation [onerror],#conversation a[href^="javascript:"]'
        )
    )
  );
  await send('history.delete', { id: 'xss-test' });
  await worker.evaluate((id) => chrome.storage.session.set({ 'okstudy.selected': id }), done.history[0].id);
  await panel.setViewportSize({ width: 320, height: 820 });
  check(
    'answer panel fits 320px width',
    await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  );
  await panel.locator('#verifyAnswer').click();
  await panel.locator('#verifySubmit:enabled').waitFor();
  await panel.locator('#verifyModel').selectOption('gemini-3.5-flash-lite');
  const beforeVerify = await send('snapshot', { tabId });
  const original = beforeVerify.history.find((e) => e.id === done.history[0].id);
  await panel.locator('#verifySubmit').click();
  let verified;
  for (let i = 0; i < 80; i++) {
    verified = await send('snapshot', { tabId });
    if (verified.history[0]?.verification) break;
    await new Promise((r) => setTimeout(r, 75));
  }
  check(
    'manual verification preserves the original answer and records a separate comparison',
    verified.history[0].verification?.originalId === original.id &&
      verified.history.some((e) => e.id === original.id)
  );
  check(
    'second model gets the original task without the first answer',
    await worker.evaluate(() => globalThis.__testRequests.at(-1).contents.length === 1)
  );
  await panel.locator('.message-label').filter({ hasText: 'PIERWSZA ODPOWIEDŹ' }).waitFor();
  check('both answers render in the panel', (await panel.locator('.message-assistant').count()) === 2);
  check('no browser JavaScript errors', errors.length === 0);
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify({ passed: results, errors, extensionId: id, testedAt: new Date().toISOString() }, null, 2)
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
