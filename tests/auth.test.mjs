import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { SignJWT, generateKeyPair } from 'jose';

const sandbox = await mkdtemp(join(tmpdir(), 'okstudy-auth-test-'));
process.env.LOCALAPPDATA = sandbox;
const {
  validateCallback,
  validateIdentity,
  publicSession,
  signIn,
  session,
  signOut,
  selectAccount,
  accessToken,
} = await import('../companion/auth.js');
const { withVault } = await import('../companion/vault.js');
const originalFetch = globalThis.fetch;
test.after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

test('OAuth callback rejects foreign state, missing/different client and denied consent', () => {
  const u = (q) => new URL(`http://127.0.0.1/auth/callback?${q}`);
  assert.throws(() => validateCallback(u('state=foreign&code=x&client_id=oaiapp_test'), 'expected'));
  assert.throws(() => validateCallback(u('state=s&code=x'), 's'));
  assert.throws(() => validateCallback(u('state=s&code=x&client_id=oaiapp_other'), 's', 'oaiapp_test'));
  assert.throws(() => validateCallback(u('state=s&error=access_denied'), 's'));
  assert.deepEqual(validateCallback(u('state=s&code=x'), 's', 'oaiapp_test'), {
    clientId: 'oaiapp_test',
    code: 'x',
  });
});
test('ID token validation checks signature, issuer, audience, nonce, expiry and subject', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const token = (overrides) =>
    new SignJWT({ sub: 'user-test', nonce: 'nonce-test', ...overrides })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://auth.openai.com')
      .setAudience('oaiapp_test')
      .setExpirationTime('5m')
      .sign(privateKey);
  const good = await token();
  assert.equal(
    (await validateIdentity(good, 'oaiapp_test', 'nonce-test', 'user-test', publicKey)).sub,
    'user-test'
  );
  for (const params of [
    ['other-client', 'nonce-test', 'user-test'],
    ['oaiapp_test', 'foreign-nonce', 'user-test'],
    ['oaiapp_test', 'nonce-test', 'other-user'],
  ])
    await assert.rejects(validateIdentity(good, ...params, publicKey));
  const wrongKey = await generateKeyPair('RS256');
  await assert.rejects(validateIdentity(good, 'oaiapp_test', 'nonce-test', '', wrongKey.publicKey));
  const expired = await new SignJWT({ sub: 'user-test', nonce: 'nonce-test' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://auth.openai.com')
    .setAudience('oaiapp_test')
    .setExpirationTime(1)
    .sign(privateKey);
  await assert.rejects(validateIdentity(expired, 'oaiapp_test', 'nonce-test', '', publicKey));
});
test('public session never exposes tokens; registration alone cannot enable inference', () => {
  const result = publicSession({
    subject: 'test',
    access_token: 'SECRET',
    refresh_token: 'REFRESH',
    id_token: 'IDTOKEN',
    scopes: [],
  });
  assert.equal(result.connected, true);
  assert.equal(result.sharing, false);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.equal(publicSession({ client_id: 'oaiapp_test', scopes: [] }).connected, false);
});
test('failed code exchange retains issued registration; foreign callback cannot end login', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(String(url).includes('/oauth/token'));
    return new Response('{"error":"invalid_grant"}', { status: 400 });
  });
  let ready;
  const opened = new Promise((resolve) => {
    ready = resolve;
  });
  const controller = new AbortController();
  const login = signIn((url) => ready(new URL(url)), controller.signal, '__new');
  const rejected = assert.rejects(login, /odrzuciło/);
  const authorization = await opened;
  const callback = new URL(authorization.searchParams.get('redirect_uri'));
  assert.equal(callback.hostname, '127.0.0.1');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  callback.search = new URLSearchParams({ state: 'foreign', code: 'fake', client_id: 'oaiapp_retained' });
  assert.equal((await originalFetch(callback)).status, 400);
  callback.searchParams.set('state', authorization.searchParams.get('state'));
  assert.equal((await originalFetch(callback)).status, 200);
  await rejected;
  const s = await session();
  assert.equal(s.connected, false);
  assert.ok(s.accounts.some((a) => a.id === 'oaiapp_retained'));
  let reopened;
  const nextOpened = new Promise((resolve) => {
    reopened = resolve;
  });
  const next = signIn((url) => reopened(new URL(url)), controller.signal, 'oaiapp_retained');
  const cancelled = assert.rejects(next);
  const nextURL = await nextOpened;
  assert.equal(nextURL.searchParams.get('client_id'), 'oaiapp_retained');
  assert.equal(nextURL.searchParams.has('agent_name_hint'), false);
  controller.abort();
  await cancelled;
});
test('vault protects tokens on Windows; logout retains registration and attempts remote revocation', async (t) => {
  await withVault(
    (v) => {
      v.activeId = 'oaiapp_active';
      v.accounts.push({
        client_id: 'oaiapp_active',
        subject: 'user',
        email: 'test@example.invalid',
        access_token: 'only-a-test-token',
        refresh_token: 'only-a-test-refresh',
        scopes: ['chatgpt.tokens.use.direct'],
        expires_at: Date.now() + 600000,
      });
    },
    { write: true }
  );
  if (process.platform === 'win32')
    assert.ok(
      !(await readFile(join(sandbox, 'OKStudy', 'chatgpt.credentials'), 'utf8')).includes('only-a-test-token')
    );
  let revocations = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('openid-configuration'))
      return Response.json({ revocation_endpoint: 'https://auth.openai.com/revoke' });
    assert.equal(String(url), 'https://auth.openai.com/revoke');
    assert.equal(init.body.get('client_id'), 'oaiapp_active');
    revocations++;
    return new Response(null, { status: 200 });
  });
  await selectAccount('oaiapp_active');
  // Another browser changing its default must not switch this process's account.
  await withVault(
    (v) => {
      v.activeId = 'oaiapp_retained';
    },
    { write: true }
  );
  assert.equal(await accessToken(new AbortController().signal), 'only-a-test-token');
  const result = await signOut();
  assert.equal(result.remoteRevoked, true);
  assert.equal(result.connected, false);
  assert.equal(revocations, 1);
  assert.ok(result.accounts.some((a) => a.id === 'oaiapp_active'));
  await assert.rejects(accessToken(new AbortController().signal));
  await assert.rejects(selectAccount('unknown'));
});
test('two native host processes serialize one rotating refresh', async () => {
  await withVault(
    (v) => {
      v.activeId = 'oaiapp_refresh';
      v.accounts.push({
        client_id: 'oaiapp_refresh',
        subject: 'test-user',
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        scopes: ['chatgpt.tokens.use.direct'],
        expires_at: 1,
      });
    },
    { write: true }
  );
  const marker = join(sandbox, 'refresh-count');
  const child = () =>
    new Promise((resolvePromise, reject) => {
      const p = spawn(process.execPath, ['tests/refresh-worker.mjs', marker], {
        cwd: resolve('.'),
        env: { ...process.env },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '',
        err = '';
      p.stdout.on('data', (b) => (out += b));
      p.stderr.on('data', (b) => (err += b));
      p.on('error', reject);
      p.on('exit', (code) => (code === 0 ? resolvePromise(out) : reject(new Error(err))));
    });
  assert.deepEqual(await Promise.all([child(), child()]), ['ok', 'ok']);
  assert.equal((await readFile(marker, 'utf8')).trim(), 'refresh');
  await withVault((v) => {
    const a = v.accounts.find((a) => a.client_id === 'oaiapp_refresh');
    assert.equal(a.refresh_token, 'new-refresh');
  });
});
test('bundled native host reads split length-prefixed input and returns public status', async () => {
  const isolated = join(sandbox, 'native-protocol');
  await mkdir(isolated);
  await new Promise((resolvePromise, reject) => {
    const p = spawn(process.execPath, ['companion/dist/host.cjs'], {
      env: { ...process.env, LOCALAPPDATA: isolated },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error('Native protocol timeout'));
    }, 15000);
    let output = Buffer.alloc(0);
    p.stdout.on('data', (b) => {
      output = Buffer.concat([output, b]);
      if (output.length < 4 || output.length < 4 + output.readUInt32LE()) return;
      try {
        const result = JSON.parse(output.subarray(4, 4 + output.readUInt32LE()));
        assert.equal(result.ok, true);
        assert.equal(result.result.connected, false);
        clearTimeout(timer);
        p.stdin.end();
        resolvePromise();
      } catch (e) {
        reject(e);
      }
    });
    p.on('error', reject);
    p.stderr.resume();
    const body = Buffer.from(JSON.stringify({ id: 'test', action: 'status' })),
      size = Buffer.alloc(4);
    size.writeUInt32LE(body.length);
    p.stdin.write(size.subarray(0, 2));
    p.stdin.write(Buffer.concat([size.subarray(2), body]));
  });
});
