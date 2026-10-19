/** Pixels for a module matrix: RGBA, `scale` pixels per module, a quiet zone of `margin` modules. */
export function rasterize(modules: boolean[][], scale = 8, margin = 4, dark = [0, 0, 0], light = [255, 255, 255]) {
  const n = modules.length;
  const width = (n + margin * 2) * scale;
  const rgba = new Uint8ClampedArray(width * width * 4);
  for (let py = 0; py < width; py++) {
    const y = Math.floor(py / scale) - margin;
    for (let px = 0; px < width; px++) {
      const x = Math.floor(px / scale) - margin;
      const on = y >= 0 && y < n && x >= 0 && x < n && modules[y][x];
      const c = on ? dark : light;
      const o = (py * width + px) * 4;
      rgba[o] = c[0];
      rgba[o + 1] = c[1];
      rgba[o + 2] = c[2];
      rgba[o + 3] = 255;
    }
  }
  return { width, height: width, rgba };
}
