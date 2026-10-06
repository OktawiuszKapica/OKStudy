import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const paths = JSON.parse(await readFile('artifacts/mobile-tools/paths.json', 'utf8'));
const privateDir = resolve('mobile/private');
await mkdir(privateDir, { recursive: true }); await mkdir('releases', { recursive: true });
if (process.platform === 'win32') {
  const principal = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  execFileSync('icacls.exe', [privateDir, '/inheritance:r', '/grant:r', `${principal}:(OI)(CI)F`], { windowsHide: true, stdio: 'pipe' });
}
const keystore = join(privateDir, 'okstudy-mobile.p12'), password = join(privateDir, 'keystore-password.txt');
const exists = path => access(path).then(() => true, () => false);
const env = { ...process.env, JAVA_HOME: paths.java };
if (!await exists(keystore)) {
  // Never put signing passwords in source, CLI arguments, logs or the delivery ZIP.
  if (!await exists(password)) await writeFile(password, randomBytes(32).toString('hex'), { flag: 'wx' });
  execFileSync(join(paths.java, 'bin/keytool.exe'), ['-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12',
    '-storepass:file', password, '-keypass:file', password, '-alias', 'okstudy-mobile', '-keyalg', 'RSA', '-keysize', '3072',
    '-validity', '10000', '-dname', 'CN=OKStudy Mobile, O=OKStudy, C=PL'], { env, windowsHide: true, stdio: 'inherit' });
}
if (!await exists(password)) throw new Error('Signing password missing; preserve and restore the original mobile/private files.');
const source = await readFile('mobile/android/app/build.gradle', 'utf8');
const version = source.match(/versionName\s+'(\d+\.\d+\.\d+)'/)?.[1];
if (!version) throw new Error('Missing valid Android versionName');
const filename = `OKStudy-Mobile-${version}.apk`;
const output = resolve('releases', filename);
const signerJar = join(paths.sdk, 'build-tools/36.0.0/lib/apksigner.jar');
execFileSync(join(paths.java, 'bin/java.exe'), ['-jar', signerJar, 'sign', '--ks', keystore, '--ks-key-alias', 'okstudy-mobile',
  '--ks-pass', `file:${password}`, '--out', output,
  resolve('mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk')], { env, windowsHide: true, stdio: 'inherit' });
execFileSync(join(paths.java, 'bin/java.exe'), ['-jar', signerJar, 'verify', '--verbose', '--print-certs', output], { env, windowsHide: true, stdio: 'inherit' });
const bytes = await readFile(output), sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile(`releases/${filename}.sha256`, `${sha256}  ${filename}\n`);
console.log(`Signed APK: ${output} (${bytes.length} bytes); SHA256 ${sha256}`);
