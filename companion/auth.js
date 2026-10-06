import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { withVault, hostId } from './vault.js';
import { setTimeout as delay } from 'node:timers/promises';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { apiError } from '../src/stream.js';

const AUTH = 'https://auth.openai.com/api/accounts';
const RESOURCE = 'https://api.openai.com/v1';
const jwks = createRemoteJWKSet(new URL('https://auth.openai.com/.well-known/jwks.json'));
let signingIn = false,
  generation = 0,
  pendingRegistration,
  selectedAccountId;
function current(epoch) {
  if (epoch !== generation) throw new Error('Konto zostało odłączone lub zmienione.');
}
const active = (vault) => {
  if (selectedAccountId === undefined) selectedAccountId = vault.activeId;
  return vault.accounts.find((a) => a.client_id === selectedAccountId);
};
async function save(record, epoch, signal, activate = false) {
  await withVault(
    (vault) => {
      const index = vault.accounts.findIndex((a) => a.client_id === record.client_id);
      if (index >= 0) vault.accounts[index] = record;
      else vault.accounts.push(record);
      if (activate) vault.activeId = record.client_id;
    },
    {
      write: true,
      guard: () => {
        current(epoch);
        signal?.throwIfAborted();
      },
    }
  );
  if (activate) selectedAccountId = record.client_id;
}
export function publicSession(record) {
  return record?.subject && record?.access_token
    ? {
        connected: true,
        sharing: record.scopes?.includes('chatgpt.tokens.use.direct') === true,
        email: record.email || '',
        subject: record.subject,
      }
    : { connected: false, sharing: false };
}
export const session = () =>
  withVault((vault) => ({
    ...publicSession(active(vault)),
    activeId: selectedAccountId,
    accounts: vault.accounts.map((a) => ({
      id: a.client_id,
      label: `${a.email || 'Konto ChatGPT'} · ${a.client_id.slice(-6)}`,
      connected: !!a.access_token,
    })),
  }));
export async function selectAccount(id) {
  generation++;
  await withVault(
    (vault) => {
      if (!vault.accounts.some((a) => a.client_id === id)) throw new Error('Nie znaleziono tego konta.');
      vault.activeId = id;
    },
    { write: true }
  );
  selectedAccountId = id;
  return session();
}
async function tokenRequest(values, signal) {
  const response = await fetch(`${AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
    signal,
  });
  if (!response.ok)
    throw new Error('OpenAI odrzuciło odnowienie lub potwierdzenie logowania. Zaloguj się ponownie.');
  return response.json();
}
export async function validateIdentity(token, clientId, nonce, expectedSubject, keySet = jwks) {
  const { payload } = await jwtVerify(token, keySet, {
    issuer: 'https://auth.openai.com',
    audience: clientId,
  });
  if (
    !payload.sub ||
    !payload.exp ||
    (nonce && payload.nonce !== nonce) ||
    (expectedSubject && payload.sub !== expectedSubject)
  )
    throw new Error('Nie udało się potwierdzić tożsamości konta ChatGPT.');
  return payload;
}
export function validateCallback(url, state, issuedId) {
  if (url.searchParams.get('state') !== state) throw new Error('Nieprawidłowe potwierdzenie logowania.');
  if (url.searchParams.has('error')) throw new Error('Logowanie zostało anulowane lub nie udzielono zgody.');
  const clientId = url.searchParams.get('client_id') || issuedId;
  if (
    !clientId ||
    clientId === 'dynamic_agent_client' ||
    !/^[\w-]{1,200}$/.test(clientId) ||
    (issuedId && clientId !== issuedId)
  )
    throw new Error('Nieprawidłowa rejestracja aplikacji.');
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) throw new Error('Brak kodu logowania.');
  return { clientId, code };
}
export async function signIn(authorize, signal, accountId) {
  if (signingIn) throw new Error('Logowanie jest już otwarte. Dokończ je w przeglądarce.');
  signingIn = true;
  const epoch = ++generation;
  let server;
  try {
    const previous = await withVault((vault) => {
      const id = accountId === '__new' ? pendingRegistration : accountId || active(vault)?.client_id;
      const record = vault.accounts.find((a) => a.client_id === id);
      if (accountId && accountId !== '__new' && !record)
        throw new Error('Nie znaleziono wybranego konta. Dodaj je ponownie.');
      return record;
    });
    const host = await hostId(),
      state = randomBytes(32).toString('base64url'),
      nonce = randomBytes(32).toString('base64url'),
      verifier = randomBytes(48).toString('base64url');
    let resolveCallback, rejectCallback;
    const callback = new Promise((resolve, reject) => {
      resolveCallback = resolve;
      rejectCallback = reject;
    });
    callback.catch(() => {});
    server = createServer((req, res) => {
      const u = new URL(req.url, redirect);
      if (
        req.method !== 'GET' ||
        u.pathname !== '/auth/callback' ||
        req.headers.host !== `127.0.0.1:${server.address().port}`
      ) {
        res.writeHead(404).end();
        return;
      }
      try {
        const result = validateCallback(u, state, previous?.client_id);
        res
          .writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'",
          })
          .end('OKStudy: możesz zamknąć tę kartę i wrócić do ustawień rozszerzenia.');
        resolveCallback(result);
      } catch (error) {
        res
          .writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
          .end('Nie udało się potwierdzić logowania. Wróć do OKStudy.');
        // Foreign state must not cancel the user's pending transaction.
        if (u.searchParams.get('state') === state) rejectCallback(error);
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
    const params = {
      client_id: previous?.client_id || 'dynamic_agent_client',
      ext_agent_host_id: host,
      response_type: 'code',
      redirect_uri: redirect,
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      resource: RESOURCE,
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    };
    if (previous?.id_token) params.id_token_hint = previous.id_token;
    if (!previous?.client_id) params.agent_name_hint = 'OKStudy';
    const abort = () => rejectCallback(new Error('Logowanie przerwane.'));
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      authorize(`${AUTH}/authorize?${new URLSearchParams(params)}`);
      const { code, clientId } = await callback;
      signal.throwIfAborted();
      current(epoch);
      // Keep registration on a failed exchange so a fresh attempt reuses this ID.
      if (!previous?.client_id) {
        await save({ client_id: clientId, scopes: [] }, epoch, signal);
        pendingRegistration = clientId;
      }
      const tokens = await tokenRequest(
        {
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: redirect,
          resource: RESOURCE,
        },
        signal
      );
      const identity = await validateIdentity(tokens.id_token, clientId, nonce, previous?.subject);
      const record = {
        client_id: clientId,
        subject: identity.sub,
        email: identity.email || '',
        id_token: tokens.id_token,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000,
        scopes: String(tokens.scope || '').split(' '),
      };
      if (!record.access_token) throw new Error('Logowanie nie udostępniło dostępu do modeli.');
      signal.throwIfAborted();
      await save(record, epoch, signal, true);
      pendingRegistration = null;
      return publicSession(record);
    } finally {
      signal.removeEventListener('abort', abort);
    }
  } finally {
    server?.closeAllConnections();
    server?.close();
    signingIn = false;
  }
}
export async function accessToken(signal) {
  const epoch = generation;
  const result = await withVault(
    async (vault) => {
      signal?.throwIfAborted();
      current(epoch);
      const record = active(vault);
      if (!record?.scopes?.includes('chatgpt.tokens.use.direct') || !record.access_token)
        throw new Error('Zaloguj się i zezwól OKStudy na korzystanie z planu ChatGPT.');
      if (record.expires_at > Date.now() + 60000) return { token: record.access_token, sharing: true };
      if (!record.refresh_token) throw new Error('Połączenie wygasło. Zaloguj się ponownie.');
      const data = await tokenRequest(
        {
          grant_type: 'refresh_token',
          client_id: record.client_id,
          refresh_token: record.refresh_token,
          resource: RESOURCE,
        },
        AbortSignal.timeout(20000)
      );
      if (!data.access_token) throw new Error('Nie udało się odnowić połączenia.');
      if (data.id_token) await validateIdentity(data.id_token, record.client_id, null, record.subject);
      Object.assign(record, {
        access_token: data.access_token,
        refresh_token: data.refresh_token || record.refresh_token,
        id_token: data.id_token || record.id_token,
        expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
        scopes: data.scope ? data.scope.split(' ') : record.scopes,
      });
      return { token: record.access_token, sharing: record.scopes.includes('chatgpt.tokens.use.direct') };
    },
    { write: true }
  );
  // Always persist a rotating refresh token, even if the originating request
  // was cancelled. Logout/switch is serialized after this write.
  signal?.throwIfAborted();
  current(epoch);
  if (!result.sharing) throw new Error('Korzystanie z planu ChatGPT nie jest włączone.');
  return result.token;
}
async function revoke(record) {
  if (!record?.refresh_token) return true;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const discovery = await fetch('https://auth.openai.com/.well-known/openid-configuration', {
        signal: AbortSignal.timeout(5000),
      });
      if (!discovery.ok) throw new Error('discovery');
      const endpoint = new URL((await discovery.json()).revocation_endpoint);
      if (endpoint.origin !== 'https://auth.openai.com') throw new Error('Invalid revocation endpoint');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: record.refresh_token,
          token_type_hint: 'refresh_token',
          client_id: record.client_id,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 200) return true;
      if (response.status < 500) return false;
    } catch {}
    if (!attempt) await delay(500);
  }
  return false;
}
export async function signOut() {
  generation++;
  const remoteRevoked = await withVault(
    async (vault) => {
      const record = active(vault),
        revoked = await revoke(record);
      if (record)
        for (const key of ['access_token', 'refresh_token', 'id_token', 'expires_at', 'scopes'])
          delete record[key];
      return revoked;
    },
    { write: true }
  );
  return { ...(await session()), remoteRevoked };
}
export async function models(signal) {
  const token = await accessToken(signal);
  const res = await fetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!res.ok) throw apiError(res.status, await res.text());
  const data = await res.json();
  return (data.models || [])
    .filter((m) => m.visibility === 'list' && typeof m.slug === 'string')
    .map((m) => ({ id: m.slug, name: m.display_name || m.slug }));
}
