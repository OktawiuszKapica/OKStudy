export function inspectPixels(pixels, width, height) {
  if (width < 120 || height < 45) return 'Kadr jest mały. Powiększ zadanie lub zaznacz większy fragment.';
  let min = 255,
    max = 0,
    edge = 0,
    count = 0;
  const grey = (index) =>
    0.2126 * pixels[index * 4] + 0.7152 * pixels[index * 4 + 1] + 0.0722 * pixels[index * 4 + 2];
  // Input is sampled to at most 256 x 256 by the caller.
  const w = Math.min(256, width),
    h = Math.min(256, height);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = grey(y * w + x);
      min = Math.min(min, v);
      max = Math.max(max, v);
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const i = y * w + x,
          d = grey(i - 1) + grey(i + 1) + grey(i - w) + grey(i + w) - 4 * v;
        edge += d * d;
        count++;
      }
    }
  if (max - min < 18) return 'Kadr ma bardzo niski kontrast. Sprawdź, czy zadanie jest widoczne.';
  if (count && edge / count < 8)
    return 'Obraz może być rozmyty lub prawie pusty. Sprawdź podgląd przed wysłaniem.';
  return '';
}
export function inspectRegion(image, rect) {
  const x = (rect.x * image.naturalWidth) / rect.viewportWidth,
    y = (rect.y * image.naturalHeight) / rect.viewportHeight;
  const width = Math.max(1, Math.floor((rect.width * image.naturalWidth) / rect.viewportWidth));
  const height = Math.max(1, Math.floor((rect.height * image.naturalHeight) / rect.viewportHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(256, width);
  canvas.height = Math.min(256, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return inspectPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, width, height);
}
