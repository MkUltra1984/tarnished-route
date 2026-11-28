// Phone screenshot of one step, scrolled to its to-do list.  Usage: node tools/step-shot.mjs "<step title>" [baseUrl]
import { chromium } from 'playwright'; import fs from 'node:fs';
const R = JSON.parse(fs.readFileSync('app/data/route.json', 'utf8')), i = R.findIndex(s => s.title === process.argv[2]); if (i < 0) throw new Error('no such step');
const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
await p.goto((process.argv[3] || 'http://localhost:8123/') + '?step=' + i); await p.waitForSelector('.title'); await p.waitForTimeout(1200);
const name = 'shots/step-' + (i + 1) + '.png'; await p.screenshot({ path: name.replace('.png', '-top.png') });
await p.locator('#todo').scrollIntoViewIfNeeded(); await p.evaluate(() => document.querySelector('#todo').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300); await p.screenshot({ path: name }); await b.close(); console.log(name);
