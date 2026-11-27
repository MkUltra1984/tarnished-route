// Guided repaint: (1) repaint the whole map once at low resolution = global colour guide,
// (2) repaint each full-resolution tile with the matching guide crop as colour reference,
// (3) final = guide low frequencies + tile high frequencies, stitched with feathered overlaps.
// Usage: node tools/repaint-guided.mjs <map.jpg> <left> <top> <n> <outdir>
import sharp from 'sharp';
import fs from 'node:fs';

const [src, L0, T0, N, outdir] = process.argv.slice(2);
const left0 = +L0, top0 = +T0, n = +N, TILE = 1024, OV = 128, STEP = TILE - OV, SIGMA = 40;
const key = process.env.OPENAI_API_KEY, model = process.env.IMG_MODEL || 'gpt-image-2';
fs.mkdirSync(outdir, { recursive: true });
const usage = { input: 0, output: 0, calls: 0 };
const STYLE = 'a richly detailed, crisp, hand-painted dark-fantasy map with sharp ink linework and deep colours: deep blue sea, lush green lowlands, pale parchment clouds, scorched red wastelands where the original is red';

async function edit(images, prompt, size, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const fd = new FormData();
    fd.append('model', model); fd.append('prompt', prompt); fd.append('size', size); fd.append('background', 'opaque');
    images.forEach((b, i) => fd.append('image[]', new Blob([b], { type: 'image/png' }), `in${i}.png`));
    const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
    const j = await res.json();
    if (res.ok) { if (j.usage) { usage.input += j.usage.input_tokens; usage.output += j.usage.output_tokens; } usage.calls++; const out = Buffer.from(j.data[0].b64_json, 'base64'); fs.writeFileSync(file, out); return out; }
    console.log('attempt', attempt, 'ERROR', res.status, j.error && j.error.message);
    if (res.status === 400) throw new Error('bad request');
  }
  throw new Error('failed ' + file);
}

// 1. global colour guide (whole map in one picture)
const meta = await sharp(src).metadata(), FULL = meta.width;
const small = await sharp(src).resize(1024, 1024).png().toBuffer();
const guideRaw = await edit([small], `Repaint this entire fantasy world map as ${STYLE}. Keep every landmass, coastline and region in exactly the same position, shape and size; do not add, remove or move anything. No text, no labels, no icons, no border, no vignette.`, '1024x1024', `${outdir}/guide.png`);
const size = TILE + (n - 1) * STEP, gs = 1024 / FULL;
const gl = Math.round(left0 * gs), gt = Math.round(top0 * gs), gw = Math.round(size * gs);
const g1 = await sharp(guideRaw).resize(1024, 1024).png().toBuffer();
const g2 = await sharp(g1).extract({ left: gl, top: gt, width: gw, height: gw }).png().toBuffer();
const g3 = await sharp(g2).resize(size, size, { kernel: 'cubic' }).png().toBuffer();
const guideUp = await sharp(g3).blur(SIGMA).removeAlpha().raw().toBuffer();
await sharp(guideUp, { raw: { width: size, height: size, channels: 3 } }).png().toFile(`${outdir}/guide-block.png`);

// 2. tiles, each with its own guide crop as colour reference
const tiles = [];
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) tiles.push({ r, c, x: c * STEP, y: r * STEP });
const PROMPT = `Repaint the first image, a fantasy world map tile, as ${STYLE}. The second image is a blurred colour guide of this exact same tile: match its colours, brightness and water colour in every area exactly. Keep every coastline, road, river, lake, cliff, building and landmark from the first image in exactly the same position and shape; do not add, remove or move anything. No text, no labels, no icons, no border, no vignette.`;
for (let i = 0; i < tiles.length; i += 3) await Promise.all(tiles.slice(i, i + 3).map(async t => {
  const orig = await sharp(src).extract({ left: left0 + t.x, top: top0 + t.y, width: TILE, height: TILE }).png().toBuffer();
  const ref = await sharp(guideUp, { raw: { width: size, height: size, channels: 3 } }).extract({ left: t.x, top: t.y, width: TILE, height: TILE }).png().toBuffer();
  t.rep = await sharp(await edit([orig, ref], PROMPT, '1024x1024', `${outdir}/t${t.r}-${t.c}.png`)).resize(TILE, TILE).removeAlpha().png().toBuffer();
  console.log('tile', t.r, t.c, 'done');
}));

// 3. stitch with feathered overlaps, then swap low frequencies for the guide's
const layers = [];
for (const t of tiles) {
  const mask = Buffer.alloc(TILE * TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { let a = 1; if (t.c > 0 && x < OV) a *= x / OV; if (t.r > 0 && y < OV) a *= y / OV; mask[y * TILE + x] = Math.round(a * 255); }
  layers.push({ input: await sharp(t.rep).joinChannel(mask, { raw: { width: TILE, height: TILE, channels: 1 } }).png().toBuffer(), left: t.x, top: t.y });
}
const stitched = await sharp({ create: { width: size, height: size, channels: 3, background: '#000' } }).composite(layers).png().toBuffer();
fs.writeFileSync(`${outdir}/stitched.png`, stitched);
const R = await sharp(stitched).removeAlpha().raw().toBuffer(), Rb = await sharp(stitched).removeAlpha().blur(SIGMA).raw().toBuffer();
const out = Buffer.alloc(R.length);
for (let i = 0; i < R.length; i++) { const v = guideUp[i] + R[i] - Rb[i]; out[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
await sharp(out, { raw: { width: size, height: size, channels: 3 } }).png().toFile(`${outdir}/final.png`);
await sharp(src).extract({ left: left0, top: top0, width: size, height: size }).png().toFile(`${outdir}/original.png`);
console.log(JSON.stringify({ size, usage }));
