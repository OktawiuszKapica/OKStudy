import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile, readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build on Windows x64.');
const version = '0.2.0';
const sdkVersion = '1.0.4258.31';
const quote = (x) => `'${x.replaceAll("'", "''")}'`;
const powershell = (text) => execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',text],{windowsHide:true,stdio:'inherit',env:{...process.env,PSModulePath:''}});
const sdkRoot=resolve(`artifacts/desktop/webview-sdk`),sdk=join(sdkRoot,'package');
await mkdir(sdkRoot,{recursive:true});
const sdkUrl=`https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/${sdkVersion}/microsoft.web.webview2.${sdkVersion}.nupkg`;
const sdkZip=join(sdkRoot,'sdk.zip');
try{await access(sdkZip);}catch{const r=await fetch(sdkUrl);if(!r.ok)throw new Error('Missing WebView2 SDK');await writeFile(sdkZip,Buffer.from(await r.arrayBuffer()));}
const registration=await fetch(`https://api.nuget.org/v3/registration5-gz-semver2/microsoft.web.webview2/${sdkVersion}.json`).then(r=>r.json());
if(!registration.catalogEntry?.startsWith('https://api.nuget.org/v3/catalog0/'))throw new Error('Invalid SDK metadata.');
const metadata=await fetch(registration.catalogEntry).then(r=>r.json());
if(metadata.packageHashAlgorithm!=='SHA512'||createHash('sha512').update(await readFile(sdkZip)).digest('base64')!==metadata.packageHash)throw new Error('WebView2 SDK checksum mismatch.');
try{await access(join(sdk,'lib/net462/Microsoft.Web.WebView2.Core.dll'));}catch{powershell(`Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${quote(sdkZip)},${quote(sdk)})`);}
const bootstrap=join(sdkRoot,'WebView2Bootstrapper.exe');
try{await access(bootstrap);}catch{const r=await fetch('https://go.microsoft.com/fwlink/p/?LinkId=2124703');if(!r.ok)throw new Error('Missing WebView2 bootstrapper');await writeFile(bootstrap,Buffer.from(await r.arrayBuffer()));}
powershell(`$sig=Get-AuthenticodeSignature -LiteralPath ${quote(bootstrap)}; if($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation,'){throw 'WebView2 bootstrapper signature is invalid'}`);
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
await mkdir(join(root,'ui'));
const uiNames=['index.html','studio.css','native.css','app.js','setup.html','setup.js'];
for(const name of uiNames)await copyFile(join('desktop/ui',name),join(root,'ui',name));
for(const name of ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll'])await copyFile(join(sdk,'lib/net462',name),join(root,name));
await copyFile(join(sdk,'runtimes/win-x64/native/WebView2Loader.dll'),join(root,'WebView2Loader.dll'));
await copyFile(join(sdk,'LICENSE.txt'),join(root,'WEBVIEW2-LICENSE.txt'));
await copyFile(bootstrap,join(root,'WebView2Bootstrapper.exe'));
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
const speechDir = join(process.env.WINDIR, 'Microsoft.NET/assembly/GAC_MSIL/System.Speech');
const speech = join(speechDir, (await readdir(speechDir))[0], 'System.Speech.dll');
const compiler = join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const refs = [
  'System.Windows.Forms.dll',
  'System.Drawing.dll',
  'System.Web.Extensions.dll',
  'System.Security.dll',
  join(root,'Microsoft.Web.WebView2.Core.dll'),
  join(root,'Microsoft.Web.WebView2.WinForms.dll'),
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
    ...(await readdir('desktop/windows'))
      .filter((x) => x.endsWith('.cs'))
      .map((x) => resolve('desktop/windows', x)),
  ],
  { windowsHide: true, stdio: 'inherit' }
);
await writeFile(
  join(root, 'README.txt'),
  `OKStudy Windows ${version}\r\nUruchom OKStudy.exe. Ustaw połączenie i model.\r\nCtrl+Alt+O: zaznacz zadanie; Enter: wyślij; Esc: anuluj.\r\nCtrl+Alt+R: powtórz; Ctrl+Alt+K: przerwij.\r\nPrzycisk OK: kliknij, aby zaznaczyć; przeciągnij, aby przenieść; prawy przycisk: menu.\r\nZamknięcie okna chowa aplikację przy zegarze. Zakończ kończy pracę.\r\nHistoria trwała jest opcjonalna i szyfrowana. Kadr wyłącznie w RAM do 5 minut.\r\nChatGPT współdzieli lokalny magazyn kont z modułem rozszerzenia. API rozlicza się osobno.\r\nOdinstalowanie: ustawienia Windows / Aplikacje albo Uninstall.exe (wersja zainstalowana).\r\nWindows 10/11 x64 i Microsoft WebView2; instalator uzupełnia brakujący runtime.\r\nPliki OKStudy bez podpisu wydawcy.\r\n`
);
const wizardZip=root+'.wizard.zip';
powershell(`Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${quote(join(root,'ui'))},${quote(wizardZip)},[IO.Compression.CompressionLevel]::Optimal,$false)`);
const wizardResources=[`/resource:${wizardZip},wizard.zip`,...['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','WebView2Bootstrapper.exe'].map(n=>`/resource:${join(root,n)},${n}`)];
const wizardSources=['desktop/setup/Setup.cs','desktop/windows/AssemblyInfo.cs','desktop/windows/WebShell.cs','desktop/windows/Native.cs','desktop/windows/Store.cs'].map(resolvePath=>resolve(resolvePath));
const wizardArgs=[...common,'/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll',`/win32manifest:${resolve('desktop/windows/app.manifest')}`,...wizardResources];
execFileSync(compiler,[...wizardArgs,`/out:${join(root,'Uninstall.exe')}`,...wizardSources],{windowsHide:true,stdio:'inherit'});
const names = [
  'OKStudy.exe',
  'Uninstall.exe',
  'node.exe',
  'bridge.cjs',
  'NODE-LICENSE.txt',
  'THIRD_PARTY_LICENSES.md',
  'README.txt',
  'Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','WEBVIEW2-LICENSE.txt','WebView2Bootstrapper.exe',
  ...uiNames.map(n=>'ui/'+n),
];
const hashes = Object.fromEntries(
  await Promise.all(names.map(async (n) => [n, sha(await readFile(join(root, n)))]))
);
await writeFile(
  join(root, 'bundle.json'),
  JSON.stringify({ product:'OKStudy.Desktop',version, nodeVersion: process.version,webviewSdk:sdkVersion, hashes }, null, 2)
);
const zip = resolve(`releases/OKStudy-Windows-${version}-portable.zip`);
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
    ...wizardArgs,
    `/out:${setup}`,
    `/resource:${zip},payload.zip`,
    ...wizardSources,
  ],
  { windowsHide: true, stdio: 'inherit' }
);
await (await import('node:fs/promises')).unlink(wizardZip);
for (const f of [zip, setup]) await writeFile(f + '.sha256', sha(await readFile(f)) + '\n');
await writeFile('artifacts/desktop/latest.json', JSON.stringify({ root, zip, setup, version }, null, 2));
console.log(`Windows package ready: ${setup}`);
