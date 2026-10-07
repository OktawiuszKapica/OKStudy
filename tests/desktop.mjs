// Windows/Node integration: only an owned synthetic window is captured.
// No user account, user screenshot or live service endpoint is used.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';

const meta = JSON.parse(await readFile('artifacts/desktop/latest.json', 'utf8'));
const output = resolve('artifacts/desktop/verification');
await mkdir(output, { recursive: true });
const preload = join(output, 'mock.cjs');
await writeFile(
  preload,
  `globalThis.fetch=async(url,init={})=>{
 if(String(url)==='https://api.openai.com/v1/models')return Response.json({data:[{id:'mock-model'}]});
 if(String(url)!=='https://api.openai.com/v1/responses')throw new Error('Unexpected network request blocked');
 const body=JSON.parse(init.body);
 if(body.model==='slow-model')await new Promise((r,j)=>{const t=setTimeout(r,5000);init.signal.addEventListener('abort',()=>{clearTimeout(t);j(new Error('Cancelled'));},{once:true});});
 if(body.model==='missing-model')return new Response('model_not_found',{status:404});
 const text=JSON.stringify({answer:'Zażółć gęślą jaźń'});
 return new Response('data: '+JSON.stringify({type:'response.completed',response:{output:[{content:[{type:'output_text',text}]}]}})+'\\n\\n');
};\n`
);
const options = {
  windowsHide: true,
  env: { ...process.env, NODE_OPTIONS: `--require "${preload.replaceAll('\\', '/')}"` },
};
const node = spawn(join(meta.root, 'node.exe'), [join(meta.root, 'bridge.cjs'), '--stdio'], {
  ...options,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const waiting = new Map();
let stderr = '';
node.stderr.on('data', (d) => (stderr += d));
node.on('error', (e) => {
  for (const p of waiting.values()) p.reject(e);
});
node.on('exit', (code) => {
  for (const p of waiting.values()) p.reject(new Error(`Bridge exited ${code}: ${stderr}`));
  waiting.clear();
});
node.stdin.on('error', (e) => {
  for (const p of waiting.values()) p.reject(e);
});
const lines = createInterface({ input: node.stdout });
lines.on('line', (line) => {
  const m = JSON.parse(line);
  const p = waiting.get(m.id);
  if (p) {
    waiting.delete(m.id);
    p.resolve(m);
  }
});
const call = (m) =>
  new Promise((resolve, reject) => {
    waiting.set(m.id, { resolve, reject });
    node.stdin.write(JSON.stringify(m) + '\n');
  });
const args = {
  provider: 'openai',
  model: 'mock-model',
  mode: 'express',
  answerOnly: true,
  key: 'mock-key',
  image: 'data:image/png;base64,YQ==',
};
const results = [];
try {
  const catalog = await call({ id: 'catalog', action: 'models', provider: 'openai', key: 'mock-key' });
  assert.equal(catalog.result.models[0].id, 'mock-model');
  results.push('bundled catalog protocol');
  const inference = await call({ id: 'infer', action: 'infer', args });
  assert.equal(inference.result.text, 'Zażółć gęślą jaźń');
  results.push('UTF-8 answer-only protocol');
  const denied = await call({ id: 'missing', action: 'infer', args: { ...args, model: 'missing-model' } });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /niedostępny/);
  assert.ok(!JSON.stringify(denied).includes('mock-key'));
  results.push('safe provider failure');
  const invalid = await call({
    id: 'bad',
    action: 'infer',
    args: { ...args, image: 'https://private/image' },
  });
  assert.equal(invalid.ok, false);
  results.push('external image rejection');
  const slow = call({ id: 'slow', action: 'infer', args: { ...args, model: 'slow-model' } });
  await new Promise((r) => setTimeout(r, 80));
  node.stdin.write(JSON.stringify({ id: 'cancel', action: 'cancel', targetId: 'slow' }) + '\n');
  assert.equal((await slow).ok, false);
  results.push('cancellation without late answer');
  const run = async (command, argumentsList) => {
    console.log('Sprawdzam: '+argumentsList[0]);
    const p = spawn(command, argumentsList, { ...options, stdio: 'pipe' });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    const code = await new Promise((r, j) => {
      p.on('error', j);
      p.on('exit', r);
      setTimeout(() => {
        if (p.exitCode === null) {
          p.kill();
          j(new Error('Synthetic test timeout'));
        }
      }, argumentsList[0].startsWith('--test-')?90000:60000).unref();
    });
    assert.equal(code, 0, out);
  };
  await run(join(meta.root, 'OKStudy.exe'), ['--self-check']);
  results.push('native encryption/image/catalog checks');
  await run(join(meta.root, 'OKStudy.exe'), ['--capture-check']);
  results.push('real Windows capture of owned test window, hotkey registration, click-through answer');
  await run(join(meta.root, 'OKStudy.exe'), ['--self-check-bridge', meta.root]);
  results.push('C# to bundled Node catalog and UTF-8 inference');
  await run(meta.setup, ['--test-install', join(output, 'install')]);
  results.push('installer allowlist/hash extraction');
  const bundle = JSON.parse(await readFile(join(output, 'install/bundle.json'), 'utf8'));
  const { createHash } = await import('node:crypto');
  for (const [name, hash] of Object.entries(bundle.hashes))
    assert.equal(
      createHash('sha256')
        .update(await readFile(join(output, 'install', name)))
        .digest('hex'),
      hash
    );
  results.push('installed files match payload hashes');
  const sentinel=join(output,'settings.dat');await writeFile(sentinel,'settings remain');
  await run(meta.setup,['--test-install',join(output,'install')]);
  assert.equal(await readFile(sentinel,'utf8'),'settings remain');results.push('update preserves settings outside application files');
  await run(meta.setup,['--test-uninstall',join(output,'install')]);
  assert.equal(await readFile(sentinel,'utf8'),'settings remain');
  const {access}=await import('node:fs/promises');await assert.rejects(access(join(output,'install/OKStudy.exe')));results.push('uninstall removes application and preserves settings');
  assert.equal(stderr, '');
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify({ version:meta.version,passed: results, liveRequests: false, userScreensCaptured: false, ownedTestWindowCaptured:true }, null, 2)
  );
  console.log(results.map((x) => '✓ ' + x).join('\n'));
} finally {
  lines.close();
  node.stdin.end();
  node.kill();
}
