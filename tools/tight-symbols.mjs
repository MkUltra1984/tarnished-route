// Builds compact versions of a cut m3 symbol so the pictogram is as large as possible for the map space it covers.
//   t-<name>.png : "tight disc"  = the dark centre + pictogram only, with a thin rim in the group colour
//   p-<name>.png : "pictogram"   = the pictogram alone with a dark ink outline and a thin halo in the group colour
// Usage: node tools/tight-symbols.mjs <in-192.png> <outDir> <name> <#rimColour>
import sharp from 'sharp';

const [inF, outDir, name, colour] = process.argv.slice(2);
const S = 192, C = S / 2, R0 = Math.round(C * 0.72);           // radius of the dark centre inside the rings
const side = R0 * 2;
const inner = await sharp(inF).extract({ left: C - R0, top: C - R0, width: side, height: side }).ensureAlpha().raw().toBuffer();

// ---- tight disc ----
const circ = Buffer.from(`<svg width="${side}" height="${side}"><circle cx="${R0}" cy="${R0}" r="${R0 - 1}" fill="#fff"/></svg>`);
const core = await sharp(inner, { raw: { width: side, height: side, channels: 4 } }).composite([{ input: circ, blend: 'dest-in' }]).png().toBuffer();
const T = side + 28, tc = T / 2;
const rings = Buffer.from(`<svg width="${T}" height="${T}"><circle cx="${tc}" cy="${tc}" r="${tc}" fill="#17110c"/><circle cx="${tc}" cy="${tc}" r="${tc - 3}" fill="${colour}"/><circle cx="${tc}" cy="${tc}" r="${R0 + 1.5}" fill="#17110c"/></svg>`);
await sharp(rings).composite([{ input: core, left: 14, top: 14 }]).png().toFile(`${outDir}/t-${name}.png`);

// ---- pictogram only ----
const n = side * side, m = Buffer.alloc(n);
for (let p = 0; p < n; p++) {
  const x = p % side, y = (p / side) | 0, d = Math.hypot(x - R0, y - R0);
  const v = Math.max(inner[p * 4], inner[p * 4 + 1], inner[p * 4 + 2]);
  m[p] = d < R0 - 3 && v > 150 ? 255 : 0;                       // cream / gold paint = pictogram
}
const grey = b => sharp(b, { raw: { width: side, height: side, channels: 1 } });
const morph = async (sigma, thr) => grey(await grey(m).blur(sigma).extractChannel(0).raw().toBuffer()).threshold(thr).extractChannel(0).raw().toBuffer();
const body = await morph(1.6, 110);                              // closes ink hatching, drops speckle
const solid = await morph(7, 120);                               // fills interior holes (eye sockets, hood)
const ink = await morph(3.2, 28);                                // dark outline
const halo = await morph(5.5, 14);                               // thin coloured halo
const [cr, cg, cb] = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16));
const out = Buffer.alloc(n * 4);
let x0 = side, y0 = side, x1 = 0, y1 = 0;
for (let p = 0; p < n; p++) {
  const o = p * 4, isBody = body[p] > 127, isInk = ink[p] > 127 || solid[p] > 127, isHalo = halo[p] > 127;
  if (isBody) { out[o] = inner[o]; out[o + 1] = inner[o + 1]; out[o + 2] = inner[o + 2]; out[o + 3] = 255; }
  else if (isInk) { out[o] = 0x1b; out[o + 1] = 0x14; out[o + 2] = 0x0e; out[o + 3] = 255; }
  else if (isHalo) { out[o] = cr; out[o + 1] = cg; out[o + 2] = cb; out[o + 3] = 255; }
  if (out[o + 3]) { const x = p % side, y = (p / side) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
}
const w = x1 - x0 + 1, h = y1 - y0 + 1, sq = Math.max(w, h);
const cut = await sharp(out, { raw: { width: side, height: side, channels: 4 } }).extract({ left: x0, top: y0, width: w, height: h })
  .extend({ left: Math.floor((sq - w) / 2), right: Math.ceil((sq - w) / 2), top: Math.floor((sq - h) / 2), bottom: Math.ceil((sq - h) / 2), background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await sharp(cut).blur(0.6).png().toFile(`${outDir}/p-${name}.png`);  // takes the stair-steps off the mask edges
