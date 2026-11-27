// Cut round symbols out of a generated sheet. Finds each disc by its dark ink outline / opaque body,
// masks everything outside the disc (removes the model's glow) and saves trimmed square PNGs.
// Usage: node tools/cut-symbols.mjs <sheet.png> <outPrefix> <cols> <rows> <name1,name2,...> [size=192]
import sharp from 'sharp';

const [sheet, prefix, cols, rows, names, size = '192', shape = 'disc'] = process.argv.slice(2); // shape 'rect' keeps the whole drawing (no round mask)
const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, list = names.split(',');
const solid = (x, y) => data[(y * W + x) * 4 + 3] > 250;
// runs of rows/columns that contain solid pixels: first split the sheet into row bands, then each band into discs
const runs = (n, has) => { const out = []; let a = -1; for (let i = 0; i <= n; i++) { const on = i < n && has(i); if (on && a < 0) a = i; if (!on && a >= 0) { if (i - a > 40) out.push([a, i - 1]); a = -1; } } return out; };
const bands = runs(H, y => { let k = 0; for (let x = 0; x < W; x++) if (solid(x, y)) k++; return k > 12; });
if (bands.length !== +rows) console.log('WARNING: found', bands.length, 'rows, expected', rows);
const discs = [];
for (const [ay, by] of bands) {
  const cs = runs(W, x => { let k = 0; for (let y = ay; y <= by; y++) if (solid(x, y)) k++; return k > 12; });
  if (cs.length !== +cols) console.log('WARNING: found', cs.length, 'columns, expected', cols);
  for (const [ax, bx] of cs) {
    // tighten the vertical extent to this disc only
    const [[ty, uy]] = runs(H, y => { if (y < ay || y > by) return false; let k = 0; for (let x = ax; x <= bx; x++) if (solid(x, y)) k++; return k > 12; });
    discs.push([ax, bx, ty, uy]);
  }
}

for (let n = 0; n < discs.length; n++) {
  const name = list[n]; if (!name) continue;
  const [ax, bx, ay, by] = discs[n], x0 = 0, y0 = 0;
  const cx = x0 + (ax + bx + 1) / 2, cy = y0 + (ay + by + 1) / 2, rad = Math.max(bx - ax, by - ay) / 2 + 1;
  const side = Math.ceil(rad * 2) + 4, left = Math.round(cx - side / 2), top = Math.round(cy - side / 2);
  const out = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const sx = left + x, sy = top + y; if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const i = (sy * W + sx) * 4, o = (y * side + x) * 4;
    const d = Math.hypot(sx + 0.5 - cx, sy + 0.5 - cy);
    // keep solid pixels inside the disc; feather 1.5 px at the edge
    const edge = shape === 'rect' ? 1 : Math.max(0, Math.min(1, (rad - d) / 1.5));
    const a = shape === 'rect' ? data[i + 3] : data[i + 3] > 250 ? 255 : 0;
    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = Math.round(a * edge);
  }
  const file = `${prefix}-${name}.png`;
  await sharp(out, { raw: { width: side, height: side, channels: 4 } }).resize(+size, +size, { kernel: 'lanczos3' }).png().toFile(file);
  console.log(file, 'radius', rad.toFixed(1), 'w/h', bx - ax, by - ay);
}
