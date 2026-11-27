// Look transfer without seams.
// Learns a colour lookup table from ONE reference pair (original tile -> its liked repaint), then applies that
// look to any seamless original image. Optionally adds fine painted texture from a stitched repaint.
// Usage: node tools/look.mjs <refOriginal.png> <refRepaint.png> <target.png> <out.png> [detailSource.png] [detailSigma]
import sharp from 'sharp';

const [refO, refR, target, outF, detailF, dSig = '6'] = process.argv.slice(2);
const G = 25, sc = (G - 1) / 255, idx = (r, g, b) => (r * G + g) * G + b;
const raw = async (f, blur) => { let s = sharp(f).removeAlpha(); if (blur) s = s.blur(blur); const { data, info } = await s.raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

// train on lightly blurred pair so the table captures colour, not linework
const A = await raw(refO, 4), B = await raw(refR, 4);
const sum = new Float64Array(G * G * G * 3), wt = new Float64Array(G * G * G);
for (let p = 0; p < A.w * A.h; p++) {
  const i = p * 3, fr = A.data[i] * sc, fg = A.data[i + 1] * sc, fb = A.data[i + 2] * sc;
  const r0 = Math.min(G - 2, fr | 0), g0 = Math.min(G - 2, fg | 0), b0 = Math.min(G - 2, fb | 0), dr = fr - r0, dg = fg - g0, db = fb - b0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const k = idx(r0 + a, g0 + b, b0 + c), w = (a ? dr : 1 - dr) * (b ? dg : 1 - dg) * (c ? db : 1 - db);
    wt[k] += w; sum[k * 3] += w * B.data[i]; sum[k * 3 + 1] += w * B.data[i + 1]; sum[k * 3 + 2] += w * B.data[i + 2];
  }
}
// fill unseen nodes: nearest seen node's colour OFFSET applied to the node's own colour (keeps unseen hues, e.g. red, snow)
const seen = []; for (let k = 0; k < G * G * G; k++) if (wt[k] > 4) seen.push(k);
const lut = new Float32Array(G * G * G * 3);
for (let r = 0; r < G; r++) for (let g = 0; g < G; g++) for (let b = 0; b < G; b++) {
  const k = idx(r, g, b), own = [r / sc, g / sc, b / sc];
  if (wt[k] > 4) { for (let c = 0; c < 3; c++) lut[k * 3 + c] = sum[k * 3 + c] / wt[k]; continue; }
  let best = -1, bd = 1e9;
  for (const s of seen) { const sr = (s / (G * G)) | 0, sg = ((s / G) | 0) % G, sb = s % G, d = (sr - r) ** 2 + (sg - g) ** 2 + (sb - b) ** 2; if (d < bd) { bd = d; best = s; } }
  const sr = (best / (G * G)) | 0, sg = ((best / G) | 0) % G, sb = best % G, src = [sr / sc, sg / sc, sb / sc];
  const lum = (own[0] + own[1] + own[2]) / Math.max(1, src[0] + src[1] + src[2]);
  for (let c = 0; c < 3; c++) { const off = sum[best * 3 + c] / wt[best] - src[c]; lut[k * 3 + c] = Math.max(0, Math.min(255, own[c] + off * Math.min(1.5, Math.max(0.5, lum)))); }
}
const T = await raw(target), n = T.w * T.h, out = Buffer.alloc(n * 3);
let D = null, Db = null;
if (detailF) { D = (await raw(detailF)).data; Db = (await raw(detailF, +dSig)).data; }
for (let p = 0; p < n; p++) {
  const i = p * 3, fr = T.data[i] * sc, fg = T.data[i + 1] * sc, fb = T.data[i + 2] * sc;
  const r0 = Math.min(G - 2, fr | 0), g0 = Math.min(G - 2, fg | 0), b0 = Math.min(G - 2, fb | 0), dr = fr - r0, dg = fg - g0, db = fb - b0;
  let v = [0, 0, 0];
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const k = idx(r0 + a, g0 + b, b0 + c) * 3, w = (a ? dr : 1 - dr) * (b ? dg : 1 - dg) * (c ? db : 1 - db);
    v[0] += w * lut[k]; v[1] += w * lut[k + 1]; v[2] += w * lut[k + 2];
  }
  for (let c = 0; c < 3; c++) { let x = v[c]; if (D) x += (D[i + c] - Db[i + c]) * 0.9; out[i + c] = x < 0 ? 0 : x > 255 ? 255 : x; }
}
await sharp(out, { raw: { width: T.w, height: T.h, channels: 3 } }).png().toFile(outF);
console.log('look applied ->', outF);
