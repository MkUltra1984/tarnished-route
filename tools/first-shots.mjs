// Phone screenshots of the first steps of the route. Usage: node tools/first-shots.mjs [url] [count]
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:8123/', n = +(process.argv[3] || 8);
const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, serviceWorkers: 'block' }), p = await c.newPage();
await p.goto(url); await p.waitForSelector('.done', { timeout: 30000 });
for (let i = 1; i <= n; i++) { await p.waitForTimeout(1500); await p.screenshot({ path: `shots/app-first-${i}.png` }); await p.click('.done'); }
await b.close();
