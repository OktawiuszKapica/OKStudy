// Windows integration test. Install companion/install.ps1 for this checkout's
// extension ID first. The browser and native host use an isolated LOCALAPPDATA;
// OpenAI navigation is intercepted and no account or paid API is used.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

if (process.platform !== 'win32') throw new Error('Native companion integration requires Windows.');
const root = resolve('.');
const output = resolve('artifacts/native-browser');
const run = join(output, `run-${Date.now()}`);
await mkdir(join(run, 'account-data'), { recursive: true });
const context = await chromium.launchPersistentContext(join(run, 'profile'), {
  channel: 'chromium',
  headless: true,
  env: { ...process.env, LOCALAPPDATA: join(run, 'account-data') },
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
const results = [],
  errors = [];
const check = (label, value) => {
  assert.ok(value, label);
  results.push(label);
  console.log(`✓ ${label}`);
};
context.on('page', (page) =>
  page.on('pageerror', (error) => errors.push({ page: new URL(page.url()).pathname, error: error.message }))
);
await context.route('https://**/*', (route) => route.abort());
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).hostname;
  const availability = await worker.evaluate(async () => ({
    available: typeof chrome.runtime.connectNative === 'function',
    permitted: await chrome.permissions.contains({ permissions: ['nativeMessaging'] }),
  }));
  check(
    'native API and permission are available on the first worker start',
    availability.available && availability.permitted
  );
  // Exercise the reported failure without changing permissions or the user's browser.
  await worker.evaluate(() => {
    globalThis.__nativeOriginal = chrome.runtime.connectNative.bind(chrome.runtime);
    chrome.runtime.connectNative = undefined;
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('#providers button').nth(2).click();
  await page.locator('[data-auth="chatgpt"]').click();
  await page.locator('#signIn').click();
  await page.waitForFunction(() => !document.getElementById('signIn').disabled);
  check(
    'missing API explains how to reload without a raw TypeError',
    /przeładuj OKStudy/.test(await page.locator('#authStatus').innerText()) &&
      !/is not a function/.test(await page.locator('#authStatus').innerText()) &&
      !(await page.locator('#companionHelp').evaluate((el) => el.open))
  );

  await worker.evaluate(() => {
    chrome.runtime.connectNative = () => globalThis.__nativeOriginal('pl.okstudy.uninstalled_test_host');
  });
  await page.locator('#signIn').click();
  await page.waitForFunction(() => !document.getElementById('signIn').disabled);
  check(
    'missing host shows installation help and can be retried',
    /Nie znaleziono modułu/.test(await page.locator('#authStatus').innerText()) &&
      (await page.locator('#companionHelp').evaluate((el) => el.open))
  );

  await worker.evaluate(() => {
    chrome.runtime.connectNative = globalThis.__nativeOriginal;
  });
  const session = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'chatgpt.status' }));
  assert.ok(session.ok, session.error || 'Install the native companion for this extension ID.');
  check(
    'real Chromium connects to the installed Node companion with an isolated empty account',
    session.data.connected === false && session.data.accounts.length === 0
  );

  // Chrome-created tabs can navigate before Playwright attaches its route.
  // Intercept at tabs.create so this test cannot contact the OAuth service.
  await worker.evaluate(() => {
    const createTab = chrome.tabs.create.bind(chrome.tabs);
    chrome.tabs.create = (options) => {
      globalThis.__testAuthorizationURL = options.url;
      return createTab({ ...options, url: 'about:blank' });
    };
  });
  const authorizePage = context.waitForEvent('page');
  await page.locator('#signIn').click();
  const authPage = await authorizePage;
  await authPage.waitForURL('about:blank');
  const authorization = new URL(await worker.evaluate(() => globalThis.__testAuthorizationURL));
  check(
    'first login click requests the official authorization page through the real native host',
    authorization.origin === 'https://auth.openai.com' &&
      authorization.pathname === '/api/accounts/authorize' &&
      authorization.searchParams.get('code_challenge_method') === 'S256' &&
      !!authorization.searchParams.get('state') &&
      !!authorization.searchParams.get('nonce')
  );
  const callback = new URL(authorization.searchParams.get('redirect_uri'));
  assert.equal(callback.hostname, '127.0.0.1');
  callback.searchParams.set('state', authorization.searchParams.get('state'));
  callback.searchParams.set('error', 'access_denied');
  // Complete only the local callback with a synthetic denial, never an OpenAI token.
  await fetch(callback);
  await page.waitForFunction(() => !document.getElementById('signIn').disabled);
  check(
    'cancelled authorization returns control to settings for another attempt',
    (await page.locator('#authStatus').innerText()).length > 0 &&
      (await page.locator('#authStatus').evaluate((el) => el.classList.contains('is-error')))
  );
  check('native login checks produce no browser JavaScript errors', errors.length === 0);
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify({ passed: results, errors, extensionId, testedAt: new Date().toISOString() }, null, 2)
  );
} catch (error) {
  console.error('Browser errors:', errors);
  await writeFile(
    join(output, 'failure.json'),
    JSON.stringify({ passed: results, errors, error: error.message }, null, 2)
  );
  throw error;
} finally {
  await context.close();
}
