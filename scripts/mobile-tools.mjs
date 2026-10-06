// Portable Android toolchain. All downloads and caches remain under artifacts/.
import { mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
const root = resolve('artifacts/mobile-tools');
await mkdir(root, { recursive: true });
const exists = async (file) => access(file).then(() => true, () => false);
const ps = (value) => `'${value.replaceAll("'", "''")}'`;
async function download(url, file, checksum, algorithm = 'sha256') {
  const valid = async () => await exists(file) && createHash(algorithm).update(await readFile(file)).digest('hex') === checksum;
  if (await valid()) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${new URL(url).hostname}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  if (!await valid()) throw new Error(`Checksum mismatch: ${file}`);
  console.log(`Verified ${file}`);
}
function extract(file, directory) {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${ps(file)}, ${ps(directory)})`], { windowsHide: true, stdio: 'inherit' });
}
const javaRoot = join(root, 'java');
const sdk = join(root, 'sdk');
const gradleRoot = join(root, 'gradle');
await Promise.all([
  (async () => {
    if (await exists(javaRoot)) return;
    const info = await fetch('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse').then((r) => r.json());
    const pkg = info[0].binary.package;
    const file = join(root, 'jdk.zip');
    await download(pkg.link, file, pkg.checksum);
    extract(file, javaRoot);
  })(),
  (async () => {
    if (await exists(join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat'))) return;
    const file = join(root, 'commandline.zip');
    await download('https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip', file, '57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d', 'sha1');
    const stage = join(root, 'commandline-unpacked');
    if (!await exists(stage)) extract(file, stage);
    await mkdir(join(sdk, 'cmdline-tools'), { recursive: true });
    const { cp } = await import('node:fs/promises');
    await cp(join(stage, 'cmdline-tools'), join(sdk, 'cmdline-tools', 'latest'), { recursive: true });
  })(),
  (async () => {
    if (await exists(gradleRoot)) return;
    const url = 'https://services.gradle.org/distributions/gradle-8.13-bin.zip';
    const checksum = (await fetch(`${url}.sha256`).then(r => r.text())).trim();
    const file = join(root, 'gradle.zip');
    await download(url, file, checksum);
    extract(file, gradleRoot);
  })(),
]);
const java = join(javaRoot, (await readdir(javaRoot))[0]);
const gradle = join(gradleRoot, 'gradle-8.13', 'bin', 'gradle.bat');
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, GRADLE_USER_HOME: join(root, 'gradle-cache') };
await writeFile(join(root, 'paths.json'), JSON.stringify({ java, sdk, gradle, gradleCache: env.GRADLE_USER_HOME }, null, 2));
const run = (args, input = '') => new Promise((resolve, reject) => {
  const script = join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `""${script}" ${args.map(a => `"${a}"`).join(' ')}"`], { env, windowsHide: true, windowsVerbatimArguments: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const log = createWriteStream(join(root, 'sdk-setup.log'), { flags: 'a' });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  child.stdin.on('error', () => {}); child.stdin.end(input);
  child.on('error', reject);
  child.on('exit', code => { log.end(); code ? reject(new Error(`SDK setup failed (${code}); see sdk-setup.log`)) : resolve(); });
});
await run(['--licenses'], 'y\n'.repeat(100));
await run(['--install', 'platform-tools', 'platforms;android-36', 'build-tools;36.0.0'], 'y\n'.repeat(100));
console.log('Portable Android tools are ready.');
