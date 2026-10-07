import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build on Windows x64.');
const version = '0.1.0';
await build({
  entryPoints: ['desktop/bridge.js'],
  bundle: true,
  outfile: 'desktop/dist/bridge.cjs',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  legalComments: 'eof',
});
const root = resolve(`artifacts/desktop/build-${Date.now()}`);
await mkdir(root, { recursive: true });
await mkdir('releases', { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const runtime = await readFile(process.execPath);
const checks = await fetch(`https://nodejs.org/dist/${process.version}/SHASUMS256.txt`).then((r) => {
  if (!r.ok) throw new Error('Missing Node checksum');
  return r.text();
});
const expected = checks
  .split('\n')
  .find((l) => l.endsWith('  win-x64/node.exe'))
  ?.split(' ')[0];
if (sha(runtime) !== expected) throw new Error('Node binary does not match official distribution.');
const nodeLicense = await fetch(
  `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`
).then((r) => {
  if (!r.ok) throw new Error('Missing Node license');
  return r.text();
});
await writeFile(join(root, 'node.exe'), runtime);
await copyFile('desktop/dist/bridge.cjs', join(root, 'bridge.cjs'));
await writeFile(join(root, 'NODE-LICENSE.txt'), nodeLicense);
await copyFile('THIRD_PARTY_LICENSES.md', join(root, 'THIRD_PARTY_LICENSES.md'));
const icon = await readFile('icons/icon128.png'),
  head = Buffer.alloc(22);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(1, 4);
head[6] = head[7] = 128;
head.writeUInt16LE(1, 10);
head.writeUInt16LE(32, 12);
head.writeUInt32LE(icon.length, 14);
head.writeUInt32LE(22, 18);
const ico = resolve('artifacts/desktop/app.ico');
await writeFile(ico, Buffer.concat([head, icon]));
const hero = resolve('artifacts/desktop/hero.png');
await sharp('mobile/assets/focus-hero-v2.png')
  .resize(1000, 260, { fit: 'cover', position: 'centre' })
  .png()
  .toFile(hero);
const speechDir = join(process.env.WINDIR, 'Microsoft.NET/assembly/GAC_MSIL/System.Speech');
const speech = join(speechDir, (await readdir(speechDir))[0], 'System.Speech.dll');
const compiler = join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const refs = [
  'System.Windows.Forms.dll',
  'System.Drawing.dll',
  'System.Web.Extensions.dll',
  'System.Security.dll',
];
const common = [
  '/nologo',
  '/target:winexe',
  '/platform:x64',
  '/optimize+',
  `/win32icon:${ico}`,
  ...refs.map((r) => `/r:${r}`),
];
execFileSync(
  compiler,
  [
    ...common,
    `/r:${speech}`,
    `/out:${join(root, 'OKStudy.exe')}`,
    `/win32manifest:${resolve('desktop/windows/app.manifest')}`,
    `/resource:${resolve('icons/icon128.png')},mark.png`,
    `/resource:${hero},hero.png`,
    ...(await readdir('desktop/windows'))
      .filter((x) => x.endsWith('.cs'))
      .map((x) => resolve('desktop/windows', x)),
  ],
  { windowsHide: true, stdio: 'inherit' }
);
await writeFile(
  join(root, 'README.txt'),
  'OKStudy Windows 0.1.0\r\nUruchom OKStudy.exe. Ustaw połączenie i model.\r\nCtrl+Alt+O: zaznacz zadanie; Enter: wyślij; Esc: anuluj.\r\nCtrl+Alt+R: powtórz; Ctrl+Alt+K: przerwij.\r\nZamknięcie okna chowa aplikację przy zegarze. Zakończ kończy pracę.\r\nHistoria trwała jest opcjonalna i szyfrowana. Kadr wyłącznie w RAM do 5 minut.\r\nChatGPT współdzieli lokalny magazyn kont z modułem rozszerzenia. API rozlicza się osobno.\r\nInstalator: Windows 10/11 x64; bez podpisu wydawcy.\r\n'
);
const names = [
  'OKStudy.exe',
  'node.exe',
  'bridge.cjs',
  'NODE-LICENSE.txt',
  'THIRD_PARTY_LICENSES.md',
  'README.txt',
];
const hashes = Object.fromEntries(
  await Promise.all(names.map(async (n) => [n, sha(await readFile(join(root, n)))]))
);
await writeFile(
  join(root, 'bundle.json'),
  JSON.stringify({ version, nodeVersion: process.version, hashes }, null, 2)
);
const zip = resolve(`releases/OKStudy-Windows-${version}-portable.zip`),
  quote = (x) => `'${x.replaceAll("'", "''")}'`;
// Only the named generated archive can be replaced, never a directory tree.
const { unlink } = await import('node:fs/promises');
await unlink(zip).catch((e) => {
  if (e.code !== 'ENOENT') throw e;
});
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${quote(root)},${quote(zip)},[IO.Compression.CompressionLevel]::Optimal,$false)`,
  ],
  { windowsHide: true, stdio: 'inherit', env: { ...process.env, PSModulePath: '' } }
);
const setup = resolve(`releases/OKStudy-Windows-${version}-Setup.exe`);
execFileSync(
  compiler,
  [
    ...common,
    '/r:System.IO.Compression.dll',
    '/r:System.IO.Compression.FileSystem.dll',
    `/out:${setup}`,
    `/resource:${zip},payload.zip`,
    resolve('desktop/setup/Setup.cs'),
    resolve('desktop/windows/Native.cs'),
    resolve('desktop/windows/Store.cs'),
  ],
  { windowsHide: true, stdio: 'inherit' }
);
for (const f of [zip, setup]) await writeFile(f + '.sha256', sha(await readFile(f)) + '\n');
await writeFile('artifacts/desktop/latest.json', JSON.stringify({ root, zip, setup, version }, null, 2));
console.log(`Windows package ready: ${setup}`);
