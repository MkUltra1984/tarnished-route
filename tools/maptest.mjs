// Produces map treatment samples from one 1024x1024 crop of the overland map (Limgrave).
import sharp from 'sharp';
import fs from 'node:fs';

const src = 'assets/maps/Elden-Ring-Overland-v1-8192.jpg', out = 'assets/maptest';
fs.mkdirSync(out, { recursive: true });
const crop = () => sharp(src).extract({ left: 2970, top: 5750, width: 1024, height: 1024 });
await crop().png().toFile(`${out}/original.png`);
// Regrade A "Dusk": darker, slightly desaturated, cooler shadows so gold UI and markers pop
await crop().modulate({ brightness: 0.72, saturation: 0.8 }).linear(1.12, -14).tint({ r: 232, g: 222, b: 205 }).png().toFile(`${out}/grade-dusk.png`);
// Regrade B "Gilded": warm sepia-gold tone, moderate contrast
await crop().modulate({ brightness: 0.86, saturation: 0.55 }).tint({ r: 226, g: 200, b: 150 }).linear(1.15, -12).png().toFile(`${out}/grade-gilded.png`);
// Regrade C "Vivid": richer colours and contrast, unsharp mask for crisper linework
await crop().modulate({ brightness: 0.95, saturation: 1.3 }).linear(1.18, -16).sharpen({ sigma: 1.2, m1: 1.2, m2: 2.5 }).png().toFile(`${out}/grade-vivid.png`);
// centre 512 crop, plain 2x stretch (what zooming past native looks like today)
await crop().extract({ left: 256, top: 256, width: 512, height: 512 }).resize(1024, 1024, { kernel: 'cubic' }).png().toFile(`${out}/zoom-plain.png`);
await crop().extract({ left: 256, top: 256, width: 512, height: 512 }).png().toFile(`${out}/zoom-in.png`);
console.log('samples written');
