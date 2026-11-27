// Seam test: repaint an N x N block of overlapping tiles through the image API, stitch with feathered overlaps,
// and report per-tile alignment and seam differences.
// Usage: node tools/repaint-block.mjs <map.jpg> <left> <top> <n> <outdir> [styleRef.png]
import sharp from 'sharp';
import fs from 'node:fs';

const [src, L0, T0, N, outdir, styleRef] = process.argv.slice(2);
const left0 = +L0, top0 = +T0, n = +N, TILE = 1024, OV = 128, STEP = TILE - OV;
const key = process.env.OPENAI_API_KEY, model = process.env.IMG_MODEL || 'gpt-image-2';
fs.mkdirSync(outdir, { recursive: true });
const PROMPT = 'Repaint the first image, a fantasy world map tile, as a richly detailed, crisp, hand-painted dark-fantasy map with sharp ink linework and deeper colours. Keep every coastline, road, river, lake, cliff, building and landmark in exactly the same position and shape; do not add, remove or move anything. ' +
  (styleRef ? 'Match the colour palette, water colour, brightness and painting style of the second image exactly so that neighbouring tiles join seamlessly. ' : '') + 'No text, no labels, no icons, no border, no vignette.';
let usage = { input: 0, output: 0, calls: 0 };

async function repaint(buf, name) {
  const file = `${outdir}/${name}.png`;
  if (fs.existsSync(file)) return fs.readFileSync(file);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const fd = new FormData();
    fd.append('model', model); fd.append('prompt', PROMPT); fd.append('size', '1024x1024'); fd.append('background', 'opaque');
    fd.append('image[]', new Blob([buf], { type: 'image/png' }), 'tile.png');
    if (styleRef) fd.append('image[]', new Blob([fs.readFileSync(styleRef)], { type: 'image/png' }), 'style.png');
    const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
    const j = await res.json();
    if (res.ok) {
      if (j.usage) { usage.input += j.usage.input_tokens; usage.output += j.usage.output_tokens; } usage.calls++;
      const out = await sharp(Buffer.from(j.data[0].b64_json, 'base64')).resize(TILE, TILE).png().toBuffer();
      fs.writeFileSync(file, out); return out;
    }
    console.log(name, 'attempt', attempt, 'ERROR', res.status, j.error && j.error.message);
  }
  throw new Error('tile failed: ' + name);
}
const grey = b => sharp(b).greyscale().raw().toBuffer();
async function shift(orig, rep) { // best shift within +-10 px
  const a = await grey(orig), b = await grey(rep); let best = null;
  for (let dy = -10; dy <= 10; dy += 2) for (let dx = -10; dx <= 10; dx += 2) {
    let s = 0, c = 0; for (let y = 30; y < 994; y += 6) for (let x = 30; x < 994; x += 6) { const d = a[y * TILE + x] - b[(y + dy) * TILE + (x + dx)]; s += d * d; c++; }
    if (!best || s / c < best.e) best = { dx, dy, e: s / c };
  } return best;
}

const tiles = [];
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) tiles.push({ r, c, left: left0 + c * STEP, top: top0 + r * STEP });
// run 3 at a time
for (let i = 0; i < tiles.length; i += 3) await Promise.all(tiles.slice(i, i + 3).map(async t => {
  t.orig = await sharp(src).extract({ left: t.left, top: t.top, width: TILE, height: TILE }).png().toBuffer();
  t.rep = await repaint(t.orig, `t${t.r}-${t.c}`);
  t.shift = await shift(t.orig, t.rep);
  console.log(`tile ${t.r},${t.c} shift ${t.shift.dx},${t.shift.dy}`);
}));

// seam difference in the raw overlaps (mean absolute RGB difference, 0-255)
async function seam(a, b, horizontal) {
  const ra = await sharp(a.rep).extract(horizontal ? { left: STEP, top: 0, width: OV, height: TILE } : { left: 0, top: STEP, width: TILE, height: OV }).raw().toBuffer();
  const rb = await sharp(b.rep).extract(horizontal ? { left: 0, top: 0, width: OV, height: TILE } : { left: 0, top: 0, width: TILE, height: OV }).raw().toBuffer();
  let s = 0; for (let i = 0; i < ra.length; i++) s += Math.abs(ra[i] - rb[i]); return s / ra.length;
}
const at = (r, c) => tiles.find(t => t.r === r && t.c === c);
const seams = [];
for (const t of tiles) { if (t.c < n - 1) seams.push(await seam(t, at(t.r, t.c + 1), true)); if (t.r < n - 1) seams.push(await seam(t, at(t.r + 1, t.c), false)); }

// stitch: each tile gets an alpha ramp over its left/top overlap where a neighbour exists
const size = TILE + (n - 1) * STEP, layers = [], hard = [];
for (const t of tiles) {
  const mask = Buffer.alloc(TILE * TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let a = 1; if (t.c > 0 && x < OV) a *= x / OV; if (t.r > 0 && y < OV) a *= y / OV; mask[y * TILE + x] = Math.round(a * 255);
  }
  const rgba = await sharp(t.rep).removeAlpha().joinChannel(mask, { raw: { width: TILE, height: TILE, channels: 1 } }).png().toBuffer();
  layers.push({ input: rgba, left: t.c * STEP, top: t.r * STEP });
  hard.push({ input: t.rep, left: t.c * STEP, top: t.r * STEP });
}
const base = { create: { width: size, height: size, channels: 3, background: '#000' } };
await sharp(base).composite(layers).png().toFile(`${outdir}/stitched.png`);
await sharp(base).composite(hard).png().toFile(`${outdir}/stitched-no-blend.png`);
await sharp(src).extract({ left: left0, top: top0, width: size, height: size }).png().toFile(`${outdir}/original.png`);
const maxShift = Math.max(...tiles.map(t => Math.max(Math.abs(t.shift.dx), Math.abs(t.shift.dy))));
console.log(JSON.stringify({ tiles: tiles.length, size, maxShiftPx: maxShift, seamMeanDiff: +(seams.reduce((a, b) => a + b, 0) / seams.length).toFixed(1), seamWorst: +Math.max(...seams).toFixed(1), usage }));
