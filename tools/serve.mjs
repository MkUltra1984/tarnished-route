// Tiny static server for testing the app locally. Usage: node tools/serve.mjs [port=8123]   then open http://localhost:8123/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('app'), port = +(process.argv[2] || 8123);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  let p = path.normalize(path.join(root, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(buf);
  });
}).listen(port, '127.0.0.1', () => console.log('serving app/ on http://localhost:' + port));
