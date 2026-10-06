import { build } from 'esbuild';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

await mkdir('js', { recursive: true });
await mkdir('assets/fonts', { recursive: true });
await mkdir('assets/katex', { recursive: true });
await build({
  entryPoints: [
    'src/background.js',
    'src/content.js',
    'src/options.js',
    'src/popup.js',
    'src/panel.js',
    'src/audio-player.js',
  ],
  bundle: true,
  outdir: 'js',
  format: 'iife',
  target: 'chrome116',
  minify: true,
  legalComments: 'eof',
});
await build({
  entryPoints: ['companion/host.js'],
  bundle: true,
  outfile: 'companion/dist/host.cjs',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  legalComments: 'eof',
});
await cp('node_modules/katex/dist/katex.min.css', 'assets/katex/katex.min.css');
await cp('node_modules/katex/dist/fonts', 'assets/katex/fonts', { recursive: true });
for (const subset of ['latin', 'latin-ext'])
  await cp(
    `node_modules/@fontsource-variable/manrope/files/manrope-${subset}-wght-normal.woff2`,
    `assets/fonts/manrope-${subset}.woff2`
  );
const mark = await readFile('assets/brand/mark.svg', 'utf8');
for (const size of [16, 32, 48, 128]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#121617"/><g transform="translate(15 31) scale(.875)">${mark.replace(/<svg[^>]*>|<\/svg>/g, '')}</g></svg>`;
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`icons/icon${size}.png`);
}
const licenses = await Promise.all(
  ['katex', 'marked', 'dompurify', 'jose', '@fontsource-variable/manrope'].map(async (name) => {
    for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'OFL.txt']) {
      try {
        return `\n## ${name}\n\n${await readFile(`node_modules/${name}/${file}`, 'utf8')}`;
      } catch {}
    }
    throw new Error(`Missing license: ${name}`);
  })
);
await writeFile('THIRD_PARTY_LICENSES.md', '# Third-party notices\n' + licenses.join('\n'));
console.log('OKStudy: extension and optional ChatGPT companion built.');
