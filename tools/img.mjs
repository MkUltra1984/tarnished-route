// Generate an image with the OpenAI Images API. Key comes from the OPENAI_API_KEY environment variable.
// Usage: node tools/img.mjs <out.png> "<prompt>" [size] [reference.png ...]
import fs from 'node:fs';
import path from 'node:path';

const [out, prompt, size = '1024x1024', ...refs] = process.argv.slice(2);
const key = process.env.OPENAI_API_KEY;
const model = process.env.IMG_MODEL || 'gpt-image-2';
if (!key) { console.log('OPENAI_API_KEY is not set'); process.exit(1); }

let res;
if (refs.length) {
  const fd = new FormData();
  fd.append('model', model); fd.append('prompt', prompt); fd.append('size', size); fd.append('background', process.env.IMG_BG || 'transparent');
  for (const r of refs) fd.append('image[]', new Blob([fs.readFileSync(r)], { type: 'image/png' }), path.basename(r));
  res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
} else {
  res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, size, background: process.env.IMG_BG || 'transparent', output_format: 'png' })
  });
}
const j = await res.json();
if (!res.ok) { console.log('ERROR', res.status, j.error && j.error.message); process.exit(1); }
const d = j.data[0];
const buf = d.b64_json ? Buffer.from(d.b64_json, 'base64') : Buffer.from(await (await fetch(d.url)).arrayBuffer());
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log('saved', out, buf.length, 'bytes', j.usage ? JSON.stringify(j.usage) : '');
