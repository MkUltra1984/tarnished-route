// Soften a cut symbol so it sits in the (soft, painted) map instead of looking pasted on top.
// Output is 96 px (2x asset for a 48 px marker). Levels: 0 crisp, 1 soft, 2 softer, 3 softest.
// Usage: node tools/soften.mjs <in.png> <out.png> <level> [outSize=96]
import sharp from 'sharp';

const [inF, outF, level = '1', outSize = '96'] = process.argv.slice(2);
// blur is in output pixels; k pulls contrast toward a mid sepia; sat scales saturation
const L = [{ blur: 0, k: 1, sat: 1 }, { blur: 0.9, k: 0.9, sat: 0.92 }, { blur: 1.5, k: 0.82, sat: 0.85 }, { blur: 2.2, k: 0.74, sat: 0.78 }][+level];
const mid = [118, 106, 86];
let s = sharp(inF).resize(+outSize, +outSize, { kernel: 'lanczos3' });
if (L.blur) s = s.blur(L.blur);
if (L.sat !== 1) s = s.modulate({ saturation: L.sat });
if (L.k !== 1) s = s.linear([L.k, L.k, L.k, 1], [mid[0] * (1 - L.k), mid[1] * (1 - L.k), mid[2] * (1 - L.k), 0]);
await s.png().toFile(outF);
