import { session, signIn, signOut, selectAccount, models, accessToken } from '../companion/auth.js';
import { fetchModels } from '../src/model-catalog.js';
import { requestAI, responsesBody, normalizeSources } from '../src/providers.js';
import { readResponses } from '../src/stream.js';
import { expressResult, plainText } from '../src/text.js';

export function validateTask(a) {
  if (
    !a ||
    !['chatgpt', 'gemini', 'claude', 'openai', 'grok'].includes(a.provider) ||
    !/^[\w.:/-]{1,120}$/.test(a.model) ||
    !['express', 'tutor', 'hint'].includes(a.mode) ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.image || '') ||
    a.image.length > 24000000 ||
    (a.provider !== 'chatgpt' && (typeof a.key !== 'string' || !a.key || a.key.length > 4096))
  )
    throw new Error('Nieprawidłowe zadanie lub brak połączenia.');
  let task = 'Przeanalizuj zadanie w wybranym fragmencie ekranu.';
  if (a.fullScreen === true) {
    const x = a.focusX, y = a.focusY;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
      throw new Error('Nieprawidłowe wskazanie pytania.');
    task = `To cały ekran lub okno. Rozwiąż tylko jedno główne pytanie: najbliższe punktu ${Math.round(x * 100)}% szerokości i ${Math.round(y * 100)}% wysokości obrazu, licząc od lewego górnego rogu. Uwzględnij całą treść tego zadania i jego warianty ABCD. Pomijaj reklamy, nawigację i inne zadania. Jeśli kilka pytań jest równie blisko i nie można wybrać jednego, zwróć krótko: Wybierz fragment. Nie zgaduj, którego pytania dotyczy prośba.`;
  }
  return {
    provider: a.provider === 'chatgpt' ? 'openai' : a.provider,
    model: a.model,
    mode: a.mode,
    internet: a.internet === true,
    answerOnly: a.answerOnly === true,
    image: a.image,
    messages: [{ role: 'user', text: task }],
  };
}

export function startBridge(auth = { session, signIn, signOut, selectAccount, models, accessToken }) {
  const controllers = new Map();
  const send = (m) => {
    const data = JSON.stringify(m);
    if (Buffer.byteLength(data) > 900000) throw new Error('Odpowiedź jest za długa.');
    process.stdout.write(data + '\n');
  };
  const handle = async (m) => {
    if (!m || typeof m.id !== 'string' || !/^[\w-]{1,80}$/.test(m.id)) return;
    if (m.action === 'cancel') {
      controllers.get(m.targetId)?.abort();
      return;
    }
    if (['signin', 'select', 'signout'].includes(m.action)) for (const c of controllers.values()) c.abort();
    if (controllers.size >= 8 || controllers.has(m.id)) return;
    const c = new AbortController();
    controllers.set(m.id, c);
    const timeout = setTimeout(() => c.abort(), m.action === 'signin' ? 180000 : m.action === 'models' ? 20000 : 120000);
    try {
      let result;
      if (m.action === 'status') result = await auth.session();
      else if (m.action === 'signin') {
        await auth.signIn((url) => send({ id: m.id, event: 'authorize', url }), c.signal, m.accountId);
        // signIn returns public identity only. Windows needs the same full account
        // envelope as status/select, including activeId, before requesting models.
        result = await auth.session();
      }
      else if (m.action === 'select') result = await auth.selectAccount(m.accountId);
      else if (m.action === 'signout') result = await auth.signOut();
      else if (m.action === 'models') {
        if (m.provider === 'chatgpt') {
          const current = await auth.session();
          if (m.accountId !== current.activeId)
            throw new Error('Konto zostało zmienione. Odśwież połączenie.');
          result = await auth.models(c.signal);
        } else result = await fetchModels(m.provider, m.key, c.signal);
        result = result.filter((x) => /^[\w.:/-]{1,120}$/.test(x.id)).slice(0, 2000);
        if (!result.length) throw new Error('Usługa zwróciła pusty katalog modeli. Odśwież listę lub wpisz identyfikator modelu.');
        result = { models: result, source: 'live', updatedAt: Date.now() };
      } else if (m.action === 'infer') {
        const args = validateTask(m.args);
        if (m.args.provider === 'chatgpt') {
          const current = await auth.session();
          if (!current.connected || !current.sharing || current.activeId !== m.args.accountId)
            throw new Error('Konto zostało zmienione lub nie udostępnia planu. Połącz je ponownie.');
          const token = await auth.accessToken(c.signal);
          result = await readResponses(
            await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(responsesBody({ ...args, plan: true })),
              signal: c.signal,
            })
          );
        } else result = await requestAI(args, m.args.key, c.signal, () => {});
        result = {
          text:
            args.mode === 'express' ? expressResult(result.text, args.answerOnly) : plainText(result.text),
          sources: normalizeSources(result.sources || []),
        };
        if (!result.text?.trim()) throw new Error('Model nie zwrócił odpowiedzi.');
      } else throw new Error('Nieobsługiwana operacja.');
      c.signal.throwIfAborted();
      send({ id: m.id, ok: true, result });
    } catch (e) {
      send({
        id: m.id,
        ok: false,
        error: c.signal.aborted
          ? 'Operacja została przerwana lub przekroczyła czas oczekiwania.'
          : e instanceof TypeError
            ? 'Nie udało się połączyć z usługą. Sprawdź internet.'
            : String(e.message || 'Błąd usługi.').slice(0, 2000),
      });
    } finally {
      clearTimeout(timeout);
      controllers.delete(m.id);
    }
  };
  let buffer = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 32000000) {
      process.exitCode = 1;
      process.stdin.destroy();
      return;
    }
    let end;
    while ((end = buffer.indexOf(10)) >= 0) {
      try {
        void handle(JSON.parse(buffer.subarray(0, end).toString('utf8')));
      } catch {
        process.exitCode = 1;
        process.stdin.destroy();
        return;
      }
      buffer = buffer.subarray(end + 1);
    }
  });
  const close = () => {
    for (const c of controllers.values()) c.abort();
    process.exit(0);
  };
  process.stdin.on('end', close);
  process.stdin.on('error', close);
}

// Tests import validation without starting a process or touching an account.
if (process.argv.includes('--stdio')) startBridge();
