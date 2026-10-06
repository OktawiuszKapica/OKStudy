import { appendFile } from 'node:fs/promises';
import { accessToken } from '../companion/auth.js';
globalThis.fetch = async () => {
  await appendFile(process.argv[2], 'refresh\n');
  return Response.json({ access_token: 'fresh-access', refresh_token: 'new-refresh', expires_in: 3600 });
};
if ((await accessToken(new AbortController().signal)) !== 'fresh-access') process.exitCode = 1;
else process.stdout.write('ok');
