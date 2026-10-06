import { session, signIn, signOut, selectAccount, models, accessToken } from './auth.js';
import { readResponses } from '../src/stream.js';
import { responsesBody, normalizeSources } from '../src/providers.js';

const controllers = new Map();
let buffer = Buffer.alloc(0);
function send(message) {
  const data = Buffer.from(JSON.stringify(message));
  if (data.length > 900000) throw new Error('Odpowiedź jest za długa.');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(data.length);
  process.stdout.write(Buffer.concat([header, data]));
}
async function handle(message) {
  const { id, action } = message;
  if (typeof id !== 'string') return;
  if (action === 'cancel') {
    controllers.get(message.targetId)?.abort();
    return;
  }
  if (action === 'signout' || action === 'select') for (const c of controllers.values()) c.abort();
  const controller = new AbortController();
  controllers.set(id, controller);
  const timer = setTimeout(() => controller.abort(), action === 'signin' ? 180000 : 120000);
  try {
    let result;
    if (action === 'status') result = await session();
    else if (action === 'signin')
      result = await signIn(
        (url) => send({ id, event: 'authorize', url }),
        controller.signal,
        message.accountId
      );
    else if (action === 'select') result = await selectAccount(message.accountId);
    else if (action === 'signout') result = await signOut();
    else if (action === 'models') result = await models(controller.signal);
    else if (action === 'infer') {
      const a = message.args;
      if (
        !a ||
        !/^[\w.:/-]{1,120}$/.test(a.model) ||
        !['tutor', 'hint', 'express'].includes(a.mode) ||
        !Array.isArray(a.messages) ||
        a.messages.length > 40 ||
        a.messages.some(
          (m) =>
            !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string' || m.text.length > 100000
        ) ||
        (a.image && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.image) || a.image.length > 24000000))
      )
        throw new Error('Nieprawidłowe zadanie.');
      const token = await accessToken(controller.signal);
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(responsesBody({ ...a, plan: true })),
        signal: controller.signal,
      });
      let last = 0;
      result = await readResponses(response, (text) => {
        if (Date.now() - last > 100) {
          last = Date.now();
          send({ id, event: 'delta', text: text.slice(0, 150000) });
        }
      });
      result.sources = normalizeSources(result.sources || []);
    } else throw new Error('Nieobsługiwana operacja.');
    controller.signal.throwIfAborted();
    send({ id, ok: true, result });
  } catch (error) {
    send({
      id,
      ok: false,
      error: controller.signal.aborted
        ? 'Operacja została przerwana lub przekroczyła czas oczekiwania.'
        : error.message,
    });
  } finally {
    clearTimeout(timer);
    controllers.delete(id);
  }
}
process.stdin.on('data', (data) => {
  buffer = Buffer.concat([buffer, data]);
  while (buffer.length >= 4) {
    const size = buffer.readUInt32LE();
    if (size > 32000000) process.exit(1);
    if (buffer.length < size + 4) break;
    let message;
    try {
      message = JSON.parse(buffer.subarray(4, 4 + size).toString('utf8'));
    } catch {
      process.exit(1);
    }
    buffer = buffer.subarray(4 + size);
    void handle(message);
  }
});
process.stdin.on('end', () => {
  for (const c of controllers.values()) c.abort();
  process.exit(0);
});
