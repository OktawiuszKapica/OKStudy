export function expressTheme(settings, background = [255, 255, 255]) {
  let dark = settings.expressContrast === 'light' || settings.expressContrast === 'subtle';
  if (settings.expressContrast === 'auto') {
    const linear = background.map((value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    dark = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 < 0.179;
  }
  const subtle = settings.expressContrast === 'subtle';
  return {
    color: subtle ? '#e8eddc' : dark ? '#f6f8f1' : '#142019',
    background: dark ? '#121917' : '#f7f9f3',
    border: dark ? '#54675a' : '#a9b7ac',
    shadow: subtle
      ? '0 1px 3px #000'
      : dark
        ? '0 1px 2px #000, 0 0 2px #000'
        : '0 1px 2px #fff, 0 0 2px #fff',
  };
}
export function positionWithin(position, width, height, viewportWidth, viewportHeight) {
  return {
    left: Math.max(0, viewportWidth - width - 8) * position.x + 4,
    top: Math.max(0, viewportHeight - height - 8) * position.y + 4,
  };
}
