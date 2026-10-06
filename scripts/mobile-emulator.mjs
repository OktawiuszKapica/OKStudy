import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { openSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const paths = JSON.parse(await readFile('artifacts/mobile-tools/paths.json', 'utf8'));
const root = resolve('artifacts/mobile-tools');
const env = { ...process.env, JAVA_HOME: paths.java, ANDROID_HOME: paths.sdk, ANDROID_SDK_ROOT: paths.sdk,
  ANDROID_USER_HOME: join(root, 'android-user'), ANDROID_AVD_HOME: join(root, 'avd-root') };
await mkdir(env.ANDROID_AVD_HOME, { recursive: true });
const run = (name, args, input = '') => new Promise((resolve, reject) => {
  const tool = join(paths.sdk, 'cmdline-tools/latest/bin', `${name}.bat`);
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `""${tool}" ${args.map(a => `"${a}"`).join(' ')}"`], { env, windowsHide: true, windowsVerbatimArguments: true, stdio: ['pipe', 'inherit', 'inherit'] });
  child.stdin.on('error', () => {}); child.stdin.end(input);
  child.on('error', reject); child.on('exit', code => code ? reject(new Error(`${name} failed (${code})`)) : resolve());
});
const adb = (args) => execFileSync(join(paths.sdk, 'platform-tools/adb.exe'), ['-s', 'emulator-5580', ...args], { env, windowsHide: true, timeout: 30000 });
switch (process.argv[2]) {
  case 'prepare':
    await run('sdkmanager', ['--install', 'emulator', 'system-images;android-35;default;x86_64'], 'y\n'.repeat(50));
    if (!await access(join(env.ANDROID_AVD_HOME, 'OKStudyTest.ini')).then(() => true, () => false))
      await run('avdmanager', ['create', 'avd', '-n', 'OKStudyTest', '-k', 'system-images;android-35;default;x86_64', '-p', join(root, 'OKStudyTest.avd'), '-d', 'pixel_4'], 'no\n');
    break;
  case 'start': {
    const log = openSync(join(root, 'emulator.log'), 'a');
    const child = spawn(join(paths.sdk, 'emulator/emulator.exe'), ['-avd', 'OKStudyTest', '-port', '5580', '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot', '-memory', '2560', '-cores', '2', '-gpu', 'host', '-feature', '-Vulkan'], { env, windowsHide: true, detached: true, stdio: ['ignore', log, log] });
    await writeFile(join(root, 'emulator-pid.txt'), String(child.pid)); child.unref(); console.log('Started isolated headless emulator', child.pid); break;
  }
  case 'status': console.log(adb(['shell', 'getprop', 'sys.boot_completed']).toString()); break;
  case 'screenshot': await writeFile(join(root, 'android-screen.png'), adb(['exec-out', 'screencap', '-p'])); break;
  case 'stop': console.log(adb(['emu', 'kill']).toString()); break;
  default: throw new Error('Use prepare, start, status, screenshot, or stop');
}
