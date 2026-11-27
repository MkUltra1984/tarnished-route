// Full-map AI repaint: 4x4 large tiles (2816 px) with big overlaps, tone-matched and cross-faded.
// Usage: node tools/repaint-map.mjs <name> <source-8192.jpg>
import sharp from 'sharp';
import fs from 'node:fs';

const [name, src] = process.argv.slice(2);
const FULL = 8192, TILE = 2816, NT = 4, STEP = (FULL - TILE) / (NT - 1), OV = TILE - STEP, RAMP = 256, R0 = (OV - RAMP) / 2; // 4x4 tiles, overlap 1024
const key = process.env.OPENAI_API_KEY, model = process.env.IMG_MODEL || 'gpt-image-2';
const dir = `assets/repaint/${name}`; fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync('assets/maps2', { recursive: true });
const PROMPT = 'Repaint this fantasy world map as a richly detailed, crisp, hand-painted dark-fantasy map with sharp ink linework and deeper, richer colours: deep blue water, lush greens, pale parchment clouds. Keep every coastline, road, river, lake, cliff, building, banner, ship and landmark in exactly the same position and shape; keep each region in its own original colour family; do not add, remove or move anything. No text, no labels, no icons, no border, no vignette.';
const usage = { input: 0, output: 0, calls: 0 };

async function repaint(buf, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const fd = new FormData();
      fd.append('model', model); fd.append('prompt', PROMPT); fd.append('size', `${TILE}x${TILE}`); fd.append('background', 'opaque');
      fd.append('image[]', new Blob([buf], { type: 'image/png' }), 'tile.png');
      const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
      const j = await res.json();
      if (res.ok) { if (j.usage) { usage.input += j.usage.input_tokens; usage.output += j.usage.output_tokens; } usage.calls++; const out = Buffer.from(j.data[0].b64_json, 'base64'); fs.writeFileSync(file, out); return out; }
      console.log(file, 'attempt', attempt, 'ERROR', res.status, j.error && j.error.message);
    } catch (e) { console.log(file, 'attempt', attempt, 'network error', e.message); }
    await new Promise(r => setTimeout(r, 5000 * attempt));
  }
  throw new Error('tile failed: ' + file);
}
async function worstShift(orig, rep) { // local alignment on a 5x5 grid of 600 px windows, search +-16 px
  const a = await sharp(orig).greyscale().raw().toBuffer(), b = await sharp(rep).greyscale().raw().toBuffer(); let worst = 0;
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const x0 = 100 + gx * 670, y0 = 100 + gy * 670; let best = null, flat = 0, cnt = 0;
    for (let y = y0; y < y0 + 600; y += 20) for (let x = x0; x < x0 + 600; x += 20) { flat += Math.abs(a[y * TILE + x] - a[y * TILE + x + 8]); cnt++; }
    if (flat / cnt < 4) continue; // featureless window (open sea): shift is meaningless
    for (let dy = -16; dy <= 16; dy += 2) for (let dx = -16; dx <= 16; dx += 2) {
      let s = 0, n = 0; for (let y = y0; y < y0 + 600; y += 6) for (let x = x0; x < x0 + 600; x += 6) { const q = a[y * TILE + x] - b[(y + dy) * TILE + (x + dx)]; s += q * q; n++; }
      if (!best || s / n < best.e) best = { dx, dy, e: s / n };
    }
    worst = Math.max(worst, Math.abs(best.dx), Math.abs(best.dy));
  }
  return worst;
}

const tiles = [];
for (let r = 0; r < NT; r++) for (let c = 0; c < NT; c++) tiles.push({ r, c, x: c * STEP, y: r * STEP, gain: [1, 1, 1] });
for (let i = 0; i < tiles.length; i += 3) await Promise.all(tiles.slice(i, i + 3).map(async t => {
  const orig = await sharp(src).extract({ left: t.x, top: t.y, width: TILE, height: TILE }).png({ compressionLevel: 3 }).toBuffer();
  const raw = await repaint(orig, `${dir}/t${t.r}-${t.c}.png`);
  t.rep = await sharp(raw).resize(TILE, TILE).removeAlpha().png({ compressionLevel: 1 }).toBuffer();
  t.shift = await worstShift(orig, t.rep);
  console.log(`${name} tile ${t.r},${t.c} worst local shift ${t.shift}px`);
}));

// tone-match each tile to its already-placed left/top neighbours using the shared overlap
const mean = async (buf, region) => (await sharp(buf).extract(region).stats()).channels.slice(0, 3).map(c => c.mean);
const at = (r, c) => tiles.find(t => t.r === r && t.c === c);
for (const t of tiles) {
  const gs = [];
  if (t.c > 0) { const nb = at(t.r, t.c - 1), a = await mean(nb.rep, { left: STEP, top: 0, width: OV, height: TILE }), b = await mean(t.rep, { left: 0, top: 0, width: OV, height: TILE }); gs.push(a.map((v, i) => v * nb.gain[i] / Math.max(1, b[i]))); }
  if (t.r > 0) { const nb = at(t.r - 1, t.c), a = await mean(nb.rep, { left: 0, top: STEP, width: TILE, height: OV }), b = await mean(t.rep, { left: 0, top: 0, width: TILE, height: OV }); gs.push(a.map((v, i) => v * nb.gain[i] / Math.max(1, b[i]))); }
  if (gs.length) t.gain = [0, 1, 2].map(i => gs.reduce((s, g) => s + g[i], 0) / gs.length);
}
console.log(name, 'gains', tiles.map(t => t.gain.map(g => g.toFixed(2)).join('/')).join('  '));

// cross-fade in a 256 px band in the middle of each overlap
const layers = [];
for (const t of tiles) {
  const mask = Buffer.alloc(TILE * TILE);
  const ramp = v => v < R0 ? 0 : v >= R0 + RAMP ? 1 : (v - R0) / RAMP;
  for (let y = 0; y < TILE; y++) { const ay = t.r > 0 ? ramp(y) : 1; for (let x = 0; x < TILE; x++) mask[y * TILE + x] = Math.round(ay * (t.c > 0 ? ramp(x) : 1) * 255); }
  const rgb = await sharp(t.rep).linear(t.gain, [0, 0, 0]).raw().toBuffer();
  const rgba = await sharp(rgb, { raw: { width: TILE, height: TILE, channels: 3 } }).joinChannel(mask, { raw: { width: TILE, height: TILE, channels: 1 } }).raw().toBuffer();
  layers.push({ input: rgba, raw: { width: TILE, height: TILE, channels: 4 }, left: t.x, top: t.y });
  t.rep = null;
}
const full = await sharp({ create: { width: FULL, height: FULL, channels: 3, background: '#000' }, limitInputPixels: false }).composite(layers).png({ compressionLevel: 1 }).toBuffer();
await sharp(full, { limitInputPixels: false }).jpeg({ quality: 92 }).toFile(`assets/maps2/${name}-8192.jpg`);
await sharp(full, { limitInputPixels: false }).resize(2000, 2000).jpeg({ quality: 90 }).toFile(`shots/repaint-${name}.jpg`);
// close-ups centred on the four seam crossings, for inspection
const sx = k => k * STEP + OV / 2; const cross = [[sx(1), sx(1)], [sx(3), sx(1)], [sx(2), sx(2)], [sx(1), sx(3)]];
const crops = await Promise.all(cross.map(([cx, cy]) => sharp(full, { limitInputPixels: false }).extract({ left: Math.round(cx - 500), top: Math.round(cy - 500), width: 1000, height: 1000 }).png().toBuffer()));
await sharp({ create: { width: 2010, height: 2010, channels: 3, background: '#141414' } }).composite(crops.map((b, i) => ({ input: b, left: (i % 2) * 1010, top: (i >> 1) * 1010 }))).jpeg({ quality: 90 }).toFile(`shots/repaint-${name}-seams.jpg`);
console.log(JSON.stringify({ map: name, worstShiftPx: Math.max(...tiles.map(t => t.shift)), usage }));
