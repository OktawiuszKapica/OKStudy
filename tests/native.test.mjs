import test from 'node:test';
import assert from 'node:assert/strict';

let instance = 0;
const originalChrome = globalThis.chrome;
test.after(() => {
  globalThis.chrome = originalChrome;
});

async function client(connectNative) {
  globalThis.chrome = {
    runtime: { connectNative },
    permissions: { contains: async () => true },
  };
  return import(`../src/native.js?native-test=${++instance}`);
}

function mockPort() {
  const listeners = {};
  return {
    sent: [],
    onMessage: {
      addListener: (fn) => {
        listeners.message = fn;
      },
    },
    onDisconnect: {
      addListener: (fn) => {
        listeners.disconnect = fn;
      },
    },
    postMessage(message) {
      this.sent.push(message);
    },
    respond(message) {
      listeners.message(message);
    },
    disconnect(reason) {
      chrome.runtime.lastError = reason ? { message: reason } : undefined;
      listeners.disconnect();
      delete chrome.runtime.lastError;
    },
  };
}

test('missing native API gives reload instructions even when permission is granted', async () => {
  const { nativeRequest } = await client(undefined);
  await assert.rejects(nativeRequest('signin'), (error) => {
    assert.equal(error.code, 'NATIVE_API_UNAVAILABLE');
    assert.match(error.message, /chrome:\/\/extensions.*przeładuj OKStudy/);
    assert.doesNotMatch(error.message, /is not a function/);
    return true;
  });
});

test('native disconnects distinguish missing installation, access denial and launch failure', async () => {
  for (const [reason, code, instruction] of [
    ['Specified native messaging host not found.', 'NATIVE_HOST_NOT_FOUND', /Zainstaluj/],
    [
      'Access to the specified native messaging host is forbidden.',
      'NATIVE_HOST_FORBIDDEN',
      /identyfikatorem/,
    ],
    ['Failed to start native messaging host.', 'NATIVE_HOST_START_FAILED', /Node.js 22/],
    ['Native host has exited.', 'NATIVE_HOST_DISCONNECTED', /Spróbuj ponownie/],
  ]) {
    const port = mockPort();
    const { nativeRequest } = await client(() => port);
    const check = assert.rejects(nativeRequest('status'), (error) => {
      assert.equal(error.code, code);
      assert.match(error.message, instruction);
      return true;
    });
    port.disconnect(reason);
    await check;
  }
});

test('installing a missing host can be retried without reloading; pending requests are cleared', async () => {
  const ports = [];
  const { nativeRequest } = await client((name) => {
    assert.equal(name, 'pl.okstudy.chatgpt');
    const port = mockPort();
    ports.push(port);
    return port;
  });
  const first = assert.rejects(nativeRequest('status'), { code: 'NATIVE_HOST_NOT_FOUND' });
  const second = assert.rejects(nativeRequest('signin'), { code: 'NATIVE_HOST_NOT_FOUND' });
  assert.equal(ports.length, 1);
  ports[0].disconnect('Specified native messaging host not found.');
  await Promise.all([first, second]);
  const retry = nativeRequest('status');
  assert.equal(ports.length, 2);
  const request = ports[1].sent[0];
  ports[1].respond({ id: request.id, ok: true, result: { connected: false, accounts: [] } });
  assert.deepEqual(await retry, { connected: false, accounts: [] });
  ports[1].disconnect();
});
