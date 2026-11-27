// Removes tile-to-tile colour jumps from a stitched AI repaint.
// Idea: final = consistent low-frequency colour + the repaint's high-frequency painted detail.
// The consistent colour comes from the seamless ORIGINAL map, pushed through one colour lookup table
// that is learned from all tiles at once (original colour -> average repaint colour).
// Usage: node tools/harmonize.mjs <original.png> <stitched.png> <out.png> [sigma]
import sharp from 'sharp';

const [origF, repF, outF, sig = '20'] = process.argv.slice(2);
const sigma = +sig, G = 17; // LUT nodes per channel
const load = async (f, blur) => { let s = sharp(f).removeAlpha(); if (blur) s = s.blur(sigma); const { data, info } = await s.raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const [Ob, R, Rb] = await Promise.all([load(origF, true), load(repF, false), load(repF, true)]);
const { w, h } = R, n = w * h;

// learn LUT with trilinear splatting
const sum = new Float64Array(G * G * G * 3), wt = new Float64Array(G * G * G);
const idx = (r, g, b) => (r * G + g) * G + b, sc = (G - 1) / 255;
for (let p = 0; p < n; p += 3) {
  const i = p * 3, fr = Ob.data[i] * sc, fg = Ob.data[i + 1] * sc, fb = Ob.data[i + 2] * sc;
  const r0 = Math.min(G - 2, fr | 0), g0 = Math.min(G - 2, fg | 0), b0 = Math.min(G - 2, fb | 0), dr = fr - r0, dg = fg - g0, db = fb - b0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const k = idx(r0 + a, g0 + b, b0 + c), wgt = (a ? dr : 1 - dr) * (b ? dg : 1 - dg) * (c ? db : 1 - db);
    wt[k] += wgt; sum[k * 3] += wgt * Rb.data[i]; sum[k * 3 + 1] += wgt * Rb.data[i + 1]; sum[k * 3 + 2] += wgt * Rb.data[i + 2];
  }
}
// global fallback gain for nodes never seen
let go = [0, 0, 0], gr = [0, 0, 0];
for (let p = 0; p < n; p += 50) for (let c = 0; c < 3; c++) { go[c] += Ob.data[p * 3 + c]; gr[c] += Rb.data[p * 3 + c]; }
const gain = gr.map((v, c) => v / Math.max(1, go[c]));
const lut = new Float32Array(G * G * G * 3);
for (let r = 0; r < G; r++) for (let g = 0; g < G; g++) for (let b = 0; b < G; b++) {
  const k = idx(r, g, b), src = [r / sc, g / sc, b / sc];
  for (let c = 0; c < 3; c++) lut[k * 3 + c] = wt[k] > 2 ? sum[k * 3 + c] / wt[k] : Math.min(255, src[c] * gain[c]);
}
// apply: base = LUT(blurred original), detail = repaint - blurred repaint
const out = Buffer.alloc(n * 3);
for (let p = 0; p < n; p++) {
  const i = p * 3, fr = Ob.data[i] * sc, fg = Ob.data[i + 1] * sc, fb = Ob.data[i + 2] * sc;
  const r0 = Math.min(G - 2, fr | 0), g0 = Math.min(G - 2, fg | 0), b0 = Math.min(G - 2, fb | 0), dr = fr - r0, dg = fg - g0, db = fb - b0;
  let v0 = 0, v1 = 0, v2 = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const k = idx(r0 + a, g0 + b, b0 + c) * 3, wgt = (a ? dr : 1 - dr) * (b ? dg : 1 - dg) * (c ? db : 1 - db);
    v0 += wgt * lut[k]; v1 += wgt * lut[k + 1]; v2 += wgt * lut[k + 2];
  }
  const c0 = v0 + R.data[i] - Rb.data[i], c1 = v1 + R.data[i + 1] - Rb.data[i + 1], c2 = v2 + R.data[i + 2] - Rb.data[i + 2];
  out[i] = c0 < 0 ? 0 : c0 > 255 ? 255 : c0; out[i + 1] = c1 < 0 ? 0 : c1 > 255 ? 255 : c1; out[i + 2] = c2 < 0 ? 0 : c2 > 255 ? 255 : c2;
}
await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(outF);
console.log('harmonized', outF, w + 'x' + h);
