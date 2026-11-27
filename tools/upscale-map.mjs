// Upscale an 8192 px map to 16384 px with Real-ESRGAN (local, on the graphics card). No repaint: geometry is exact.
// The upscaler cannot hold a whole map at once, so the map is fed in 2048 px blocks, each with 64 px of real
// neighbouring map around it. The padding is thrown away afterwards, so blocks meet exactly and without seams.
// Usage: node tools/upscale-map.mjs <name> <assets/maps/file-8192.jpg>
// Output: assets/maps-up/<name>-16384.jpg and shots/upscale-<name>-joins.jpg (close-ups across block joins).
import sharp from 'sharp';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [name, src] = process.argv.slice(2);
const SRC = 8192, B = 2048, PAD = 64, N = SRC / B, OUT = SRC * 2, OB = B * 2;
const exe = 'tools/bin/realesrgan/realesrgan-ncnn-vulkan.exe', tmp = `assets/maptest/up-${name}`;
fs.mkdirSync(tmp, { recursive: true }); fs.mkdirSync('assets/maps-up', { recursive: true });

// the source with a mirrored border, so edge blocks get padding too
const padded = await sharp(src, { limitInputPixels: false }).removeAlpha().extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'mirror' }).raw().toBuffer();
const PW = SRC + 2 * PAD;
const big = Buffer.alloc(OUT * OUT * 3);
const t0 = Date.now();
for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
  const inF = `${tmp}/in-${by}-${bx}.png`, upF = `${tmp}/up-${by}-${bx}.png`;
  if (!fs.existsSync(upF)) {
    await sharp(padded, { raw: { width: PW, height: PW, channels: 3 }, limitInputPixels: false }).extract({ left: bx * B, top: by * B, width: B + 2 * PAD, height: B + 2 * PAD }).png({ compressionLevel: 1 }).toFile(inF);
    execFileSync(exe, ['-i', inF, '-o', upF, '-n', 'realesrgan-x4plus', '-s', '4', '-g', '0', '-m', 'tools/bin/realesrgan/models'], { stdio: 'ignore' });
    fs.unlinkSync(inF);
  }
  // x4 result -> x2, then drop the padding
  const blk = await sharp(upF, { limitInputPixels: false }).removeAlpha().resize((B + 2 * PAD) * 2, (B + 2 * PAD) * 2, { kernel: 'lanczos3' }).extract({ left: PAD * 2, top: PAD * 2, width: OB, height: OB }).raw().toBuffer();
  for (let y = 0; y < OB; y++) blk.copy(big, ((by * OB + y) * OUT + bx * OB) * 3, y * OB * 3, (y + 1) * OB * 3);
  console.log(`block ${by * N + bx + 1}/${N * N} done, ${Math.round((Date.now() - t0) / 1000)} s`);
}
const whole = () => sharp(big, { raw: { width: OUT, height: OUT, channels: 3 }, limitInputPixels: false });
await whole().jpeg({ quality: 93 }).toFile(`assets/maps-up/${name}-${OUT}.jpg`);
// close-ups centred on block joins (where a seam would show), 3 x 3 sheet of 800 px crops at full resolution
const spots = []; for (const jy of [1, 2, 3]) for (const jx of [1, 2, 3]) spots.push([jx * OB - 400, jy * OB - 400]);
const crops = await Promise.all(spots.map(([l, t]) => whole().extract({ left: l, top: t, width: 800, height: 800 }).png().toBuffer()));
await sharp({ create: { width: 2400 + 40, height: 2400 + 40, channels: 3, background: '#000' } }).composite(crops.map((c, i) => ({ input: c, left: 10 + (i % 3) * 810, top: 10 + ((i / 3) | 0) * 810 }))).jpeg({ quality: 92 }).toFile(`shots/upscale-${name}-joins.jpg`);
console.log('saved', `assets/maps-up/${name}-${OUT}.jpg`);
