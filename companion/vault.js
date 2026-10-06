import { mkdir, readFile, writeFile, rename, rm, stat, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const directory = join(process.env.LOCALAPPDATA || join(homedir(), '.config'), 'OKStudy');
const file = join(directory, 'chatgpt.credentials'),
  lock = join(directory, 'credentials.lock');
let queue = Promise.resolve();
function protect(value, decrypt = false) {
  if (process.platform !== 'win32') return Promise.resolve(value);
  return new Promise((resolve, reject) => {
    // Use .NET directly: inherited PowerShell 7 module paths can prevent the
    // Windows PowerShell Security module from loading in native hosts.
    const common =
      '$ErrorActionPreference="Stop"; [void][Reflection.Assembly]::LoadWithPartialName("System.Security"); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); ';
    const code =
      common +
      (decrypt
        ? '[Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))'
        : '[Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.resume();
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('Nie można otworzyć systemowego magazynu poświadczeń.'));
    });
    child.on('close', (exit) => {
      clearTimeout(timer);
      exit === 0
        ? resolve(output)
        : reject(new Error('Nie można odczytać lub zabezpieczyć połączenia ChatGPT.'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(decrypt ? value : Buffer.from(value, 'utf8').toString('base64'));
  });
}
async function acquire() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const until = Date.now() + 45000;
  while (true) {
    try {
      await mkdir(lock);
      await writeFile(join(lock, 'owner'), String(process.pid), { flag: 'wx' });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const pid = Number(await readFile(join(lock, 'owner'), 'utf8'));
        if (Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
          } catch (e) {
            if (e.code === 'ESRCH') {
              await rm(join(lock, 'owner'), { force: true });
              await rmdir(lock);
              continue;
            }
          }
        }
      } catch (e) {
        if (e.code === 'ENOENT') {
          try {
            if (Date.now() - (await stat(lock)).mtimeMs > 60000) await rmdir(lock);
          } catch {}
        }
      }
      if (Date.now() > until) throw new Error('Moduł ChatGPT jest zajęty w innym oknie. Spróbuj ponownie.');
      await delay(100);
    }
  }
}
async function writeAtomic(value) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, await protect(JSON.stringify(value)), { mode: 0o600 });
    await rename(tmp, file);
  } finally {
    await rm(tmp, { force: true });
  }
}
// The process-wide queue plus a file lock serialize rotating refresh tokens
// across browser profiles. Each operation rereads the latest protected record.
export function withVault(task, { write = false, guard = () => {} } = {}) {
  const next = queue.then(async () => {
    await acquire();
    try {
      guard();
      let vault;
      try {
        vault = JSON.parse(await protect(await readFile(file, 'utf8'), true));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        vault = { version: 2, activeId: null, accounts: [] };
      }
      if (!Array.isArray(vault.accounts))
        vault = { version: 2, activeId: vault.client_id || null, accounts: vault.client_id ? [vault] : [] };
      const before = structuredClone(vault);
      const result = await task(vault);
      guard();
      if (write && JSON.stringify(vault) !== JSON.stringify(before)) {
        await writeAtomic(vault);
        try {
          guard();
        } catch (e) {
          await writeAtomic(before);
          throw e;
        }
      }
      return result;
    } finally {
      await rm(join(lock, 'owner'), { force: true });
      await rmdir(lock);
    }
  });
  queue = next.catch(() => {});
  return next;
}
export async function hostId() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'host-id');
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const id = `urn:uuid:${randomUUID()}`;
  try {
    await writeFile(path, id, { mode: 0o600, flag: 'wx' });
    return id;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    return (await readFile(path, 'utf8')).trim();
  }
}
