// Cuts each map into a 256 px tile pyramid (app/tiles/<map>/<z>/<y>/<x>.jpg) so phones and tablets only load what is on screen.
// Uses the upscaled 16384 px map from assets/maps-up when it exists (zoom 0 to 6), otherwise the original 8192 px map (zoom 0 to 5).
// Writes app/tiles/meta.json with the deepest zoom level of every map.
// Usage: node tools/build-tiles.mjs [map ...]
import sharp from 'sharp';
import fs from 'node:fs';

const MAPS = { overland: 'Elden-Ring-Overland-v1-8192.jpg', underground: 'Elden-Ring-Underground-v1-8192.jpg', ashen: 'Elden-Ring-Ashen-Capital-v1-8192.jpg', shadow: 'Elden-Ring-Realm-of-Shadow-v1-8192.jpg' };
const TILE = 256, only = process.argv.slice(2);
const metaFile = 'app/tiles/meta.json', meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
for (const [name, file] of Object.entries(MAPS)) {
  if (only.length && !only.includes(name)) continue;
  const up = `assets/maps-up/${name}-16384.jpg`, src = fs.existsSync(up) ? up : `assets/maps/${file}`, MAXZ = src === up ? 6 : 5;
  fs.rmSync(`app/tiles/${name}`, { recursive: true, force: true });
  let count = 0, bytes = 0;
  for (let z = 0; z <= MAXZ; z++) {
    const size = TILE * 2 ** z, n = 2 ** z;
    const level = await sharp(src, { limitInputPixels: false }).resize(size, size, { kernel: 'lanczos3' }).raw().toBuffer();
    for (let y = 0; y < n; y++) {
      fs.mkdirSync(`app/tiles/${name}/${z}/${y}`, { recursive: true });
      const strip = level.subarray(y * TILE * size * 3, (y + 1) * TILE * size * 3); // one row of tiles, no copy
      await Promise.all(Array.from({ length: n }, (_, x) => {
        const out = `app/tiles/${name}/${z}/${y}/${x}.jpg`;
        return sharp(strip, { raw: { width: size, height: TILE, channels: 3 } }).extract({ left: x * TILE, top: 0, width: TILE, height: TILE }).jpeg({ quality: 84, mozjpeg: true }).toFile(out).then(i => { count++; bytes += i.size; });
      }));
    }
  }
  meta[name] = { maxZoom: MAXZ };
  fs.writeFileSync(metaFile, JSON.stringify(meta));
  console.log(name, 'from', src, '->', count, 'tiles,', (bytes / 1048576).toFixed(1), 'MB, zoom 0 to', MAXZ);
}
