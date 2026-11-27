// Screenshot a local page at a device size. Usage: node tools/shot.mjs <url-or-file> <out.png> [width] [height] [waitMs]
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [target, out, w = '1280', h = '800', wait = '2500'] = process.argv.slice(2);
let url = target;
if (!/^https?:|^file:/.test(target)) {
  const [file, query] = target.split('?');
  url = pathToFileURL(path.resolve(file)).href + (query ? '?' + query : '');
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', r => errors.push('failed: ' + r.url()));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out, errors.length ? '\n' + errors.join('\n') : '(no page errors)');

