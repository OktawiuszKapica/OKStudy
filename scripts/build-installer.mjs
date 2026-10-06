import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('Build the Windows x64 installer on Windows x64.');
const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
const nodeVersion = process.version;
const staging = resolve(`artifacts/installer/build-${Date.now()}`);
await mkdir(staging, { recursive: true });
await mkdir('releases', { recursive: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const checksums = await fetch(`https://nodejs.org/dist/${nodeVersion}/SHASUMS256.txt`).then((response) => {
  if (!response.ok) throw new Error('Cannot verify Node distribution');
  return response.text();
});
const expected = checksums
  .split('\n')
  .find((line) => line.endsWith('  win-x64/node.exe'))
  ?.split(' ')[0];
const runtime = await readFile(process.execPath);
if (!expected || sha(runtime) !== expected)
  throw new Error('Installed Node does not match the official Windows x64 release.');
const license = await fetch(`https://raw.githubusercontent.com/nodejs/node/${nodeVersion}/LICENSE`).then(
  (response) => {
    if (!response.ok) throw new Error('Missing Node license');
    return response.text();
  }
);
const files = {
  'node.exe': runtime,
  'host.cjs': await readFile('companion/dist/host.cjs'),
  'NODE-LICENSE.txt': Buffer.from(license),
};
for (const [name, data] of Object.entries(files)) await writeFile(join(staging, name), data);
await writeFile(
  join(staging, 'bundle.json'),
  JSON.stringify(
    {
      version,
      nodeVersion,
      hashes: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, sha(data)])),
    },
    null,
    2
  )
);
const payload = resolve(`artifacts/installer/payload-${Date.now()}.zip`);
const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${psQuote(staging)}, ${psQuote(payload)}, [IO.Compression.CompressionLevel]::Optimal, $false)`,
  ],
  { windowsHide: true, stdio: 'inherit', env: { ...process.env, PSModulePath: '' } }
);
// C#/.NET Framework ships with Windows; the installer needs no separate runtime.
const compiler = join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const output = resolve(`releases/OKStudy-Companion-${version}.exe`);
const icon = await readFile('icons/icon128.png'),
  header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = header[7] = 128;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(icon.length, 14);
header.writeUInt32LE(22, 18);
const iconPath = join(staging, 'app.ico');
await writeFile(iconPath, Buffer.concat([header, icon]));
execFileSync(
  compiler,
  [
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    '/optimize+',
    `/out:${output}`,
    `/win32icon:${iconPath}`,
    `/resource:${payload},payload.zip`,
    `/resource:${resolve('icons/icon128.png')},mark.png`,
    '/r:System.Windows.Forms.dll',
    '/r:System.Drawing.dll',
    '/r:System.IO.Compression.dll',
    '/r:System.IO.Compression.FileSystem.dll',
    '/r:System.Web.Extensions.dll',
    resolve('companion/setup/Setup.cs'),
  ],
  { windowsHide: true, stdio: 'inherit' }
);
await writeFile(`${output}.sha256`, `${sha(await readFile(output))}  OKStudy-Companion-${version}.exe\n`);
await copyFile(join(staging, 'bundle.json'), `${output}.json`);
console.log(`Windows installer: ${output}`);
