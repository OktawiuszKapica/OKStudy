import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
const releases = resolve('releases'),
  stage = join(releases, `stage-${Date.now()}`, 'OKStudy');
await mkdir(stage, { recursive: true });
const files = [
  'manifest.json',
  'options.html',
  'popup.html',
  'panel.html',
  'js',
  'icons',
  'assets',
  'gemini.png',
  'claude.png',
  'chatgpt.jpg',
  'grok.webp',
  'revolut-qr.jpg',
  'README.md',
  'THIRD_PARTY_LICENSES.md',
  'docs',
];
for (const file of files) await cp(file, join(stage, file), { recursive: true });
await mkdir(join(stage, 'companion'), { recursive: true });
for (const file of ['dist', 'install.ps1'])
  await cp(join('companion', file), join(stage, 'companion', file), { recursive: true });
const zip = join(releases, `OKStudy-${version}.zip`);
if (process.platform === 'win32') {
  const ps = (value) => `'${value.replaceAll("'", "''")}'`;
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; if (Test-Path -LiteralPath ${ps(zip)}) { Remove-Item -LiteralPath ${ps(zip)} }; [IO.Compression.ZipFile]::CreateFromDirectory(${ps(stage)}, ${ps(zip)}, [IO.Compression.CompressionLevel]::Optimal, $true)`,
    ],
    { windowsHide: true, stdio: 'inherit', env: { ...process.env, PSModulePath: '' } }
  );
} else execFileSync('zip', ['-qr', zip, 'OKStudy'], { cwd: resolve(stage, '..'), stdio: 'inherit' });
const digest = createHash('sha256')
  .update(await readFile(zip))
  .digest('hex');
await writeFile(`${zip}.sha256`, `${digest}  OKStudy-${version}.zip\n`);
console.log(`Ready: ${zip}\nUnpacked: ${stage}`);
