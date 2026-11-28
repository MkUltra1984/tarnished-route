// Gives new tab icons the exact ink and parchment tones of the existing ones (a gradient map over their brightness).
// Usage: node tools/match-tab-icons.mjs <source.png> <name>     writes app/icons/tab-<name>.png
import sharp from 'sharp';
const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
const px = async (f, size) => { const im = sharp(f).ensureAlpha(); const { data, info } = await (size ? im.trim().resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }) : im).raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
// reference ramp: average colour of the old icons per brightness band
const bands = Array.from({ length: 16 }, () => [0, 0, 0, 0]); let lo = 255, hi = 0;
for (const n of ['route', 'bosses', 'collection', 'quests']) { const { data } = await px(`app/icons/tab-${n}.png`);
  for (let o = 0; o < data.length; o += 4) { if (data[o + 3] < 200) continue; const l = lum(data[o], data[o + 1], data[o + 2]), b = bands[Math.min(15, l >> 4)]; b[0] += data[o]; b[1] += data[o + 1]; b[2] += data[o + 2]; b[3]++; lo = Math.min(lo, l); hi = Math.max(hi, l); } }
const ramp = bands.map(b => b[3] > 20 ? [b[0] / b[3], b[1] / b[3], b[2] / b[3]] : null);
const at = l => { let i = Math.min(15, Math.max(0, Math.round(l) >> 4)), d = 0; while (!ramp[i - d] && !ramp[i + d]) d++; return ramp[i - d] || ramp[i + d]; };
const [src, name] = process.argv.slice(2), im = await px(src, 72); let slo = 255, shi = 0;
for (let o = 0; o < im.data.length; o += 4) if (im.data[o + 3] > 200) { const l = lum(im.data[o], im.data[o + 1], im.data[o + 2]); slo = Math.min(slo, l); shi = Math.max(shi, l); }
for (let o = 0; o < im.data.length; o += 4) { if (!im.data[o + 3]) continue; const l = lum(im.data[o], im.data[o + 1], im.data[o + 2]), t = (l - slo) / Math.max(1, shi - slo), c = at(lo + t * (hi - lo)); im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; }
await sharp(im.data, { raw: { width: im.w, height: im.h, channels: 4 } }).png().toFile(`app/icons/tab-${name}.png`); console.log('tab-' + name, 'matched');
