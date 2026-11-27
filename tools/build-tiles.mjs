// Cuts each original 8192 px map into a 256 px tile pyramid (z/y/x.jpg) so phones and tablets only load what is on screen.
// Usage: node tools/build-tiles.mjs
import sharp from 'sharp';
import fs from 'node:fs';

const MAPS = { overland: 'Elden-Ring-Overland-v1-8192.jpg', underground: 'Elden-Ring-Underground-v1-8192.jpg', ashen: 'Elden-Ring-Ashen-Capital-v1-8192.jpg', shadow: 'Elden-Ring-Realm-of-Shadow-v1-8192.jpg' };
const TILE = 256, MAXZ = 5; // 256 * 2^5 = 8192
for (const [name, file] of Object.entries(MAPS)) {
  let count = 0, bytes = 0;
  for (let z = 0; z <= MAXZ; z++) {
    const size = TILE * 2 ** z, n = 2 ** z;
    const level = await sharp(`assets/maps/${file}`, { limitInputPixels: false }).resize(size, size, { kernel: 'lanczos3' }).raw().toBuffer();
    for (let y = 0; y < n; y++) {
      fs.mkdirSync(`app/tiles/${name}/${z}/${y}`, { recursive: true });
      for (let x = 0; x < n; x++) {
        const out = `app/tiles/${name}/${z}/${y}/${x}.jpg`;
        await sharp(level, { raw: { width: size, height: size, channels: 3 } }).extract({ left: x * TILE, top: y * TILE, width: TILE, height: TILE }).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
        count++; bytes += fs.statSync(out).size;
      }
    }
  }
  console.log(name, count, 'tiles', (bytes / 1048576).toFixed(1), 'MB');
}
