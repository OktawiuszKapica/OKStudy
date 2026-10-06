import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

test(
  'standalone Windows installer validates IDs, preserves accounts and runs the bundled companion without system Node',
  { timeout: 120000 },
  async (t) => {
    if (process.platform !== 'win32') return t.skip('Windows installer');
    const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
    const installer = resolve(`releases/OKStudy-Companion-${version}.exe`);
    try {
      await access(installer);
    } catch {
      return t.skip('Build installer with npm run build:installer first');
    }
    const output = resolve(`artifacts/installer/test-${Date.now()}`),
      target = join(output, 'native-host');
    await mkdir(output, { recursive: true });
    const sentinel = join(output, 'chatgpt.credentials');
    await writeFile(sentinel, 'synthetic-account-do-not-touch');
    assert.throws(() =>
      execFileSync(installer, ['--test-install', target, '../invalid'], { windowsHide: true, timeout: 10000 })
    );
    const ids = ['a'.repeat(32), 'b'.repeat(32)];
    for (const id of ids)
      execFileSync(installer, ['--test-install', target, id], { windowsHide: true, timeout: 30000 });
    const manifest = JSON.parse(await readFile(join(target, 'pl.okstudy.chatgpt.json'), 'utf8'));
    assert.deepEqual(
      manifest.allowed_origins,
      ids.map((id) => `chrome-extension://${id}/`)
    );
    assert.equal(await readFile(sentinel, 'utf8'), 'synthetic-account-do-not-touch');
    const metadata = JSON.parse(await readFile(join(target, 'installed-version.json'), 'utf8'));
    assert.equal(
      createHash('sha256')
        .update(await readFile(join(target, 'host.cjs')))
        .digest('hex'),
      metadata.hashes['host.cjs']
    );
    const request = Buffer.from(JSON.stringify({ id: 'installer-test', action: 'status' }));
    const header = Buffer.alloc(4);
    header.writeUInt32LE(request.length);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        join(target, 'runtime', `node-${metadata.nodeVersion}.exe`),
        [join(target, 'host.cjs')],
        {
          windowsHide: true,
          env: { ...process.env, LOCALAPPDATA: join(output, 'empty-account') },
        }
      );
      let bytes = Buffer.alloc(0),
        settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdin.end();
        child.kill();
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('Bundled companion did not respond')), 15000);
      child.on('error', (error) => finish(error));
      child.on('exit', (code) => finish(new Error(`Companion exited before replying: ${code}`)));
      child.stdout.on('data', (data) => {
        bytes = Buffer.concat([bytes, data]);
        if (bytes.length >= 4 && bytes.length >= 4 + bytes.readUInt32LE()) {
          try {
            finish(null, JSON.parse(bytes.subarray(4, 4 + bytes.readUInt32LE()).toString()));
          } catch (error) {
            finish(error);
          }
        }
      });
      child.stdin.write(Buffer.concat([header, request]));
    });
    assert.equal(result.id, 'installer-test');
    assert.equal(result.ok, true);
    assert.equal(result.result.connected, false);
    execFileSync(installer, ['--preview', join(output, 'installer.png')], {
      windowsHide: true,
      timeout: 45000,
    });
    await writeFile(
      resolve('artifacts/installer/latest-test.json'),
      JSON.stringify({ output, testedAt: new Date().toISOString(), installer }, null, 2)
    );
  }
);
