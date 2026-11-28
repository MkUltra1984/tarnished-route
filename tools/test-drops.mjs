// Checks that a boss's drops are not listed on their own and get ticked with the boss. Needs: node tools/serve.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:8123/', R = JSON.parse(fs.readFileSync('app/data/route.json', 'utf8')), MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8'));
const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true }), page = await ctx.newPage();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const scion0 = MK.list.findIndex(m => m[4] === 'Grafted Scion (Tutorial)'), at = R.findIndex(s => s.m.includes(scion0) || s.n.includes(scion0)), scion = MK.list.findIndex(m => m[4] === 'Grafted Scion (Tutorial)'), drops = MK.drops[scion];
ok(at >= 0, 'the Grafted Scion has a step: ' + (at + 1) + '. ' + R[at].title);
await page.goto(base + '?step=' + at); await page.waitForSelector('.title');
ok(await page.locator(`.chk[data-i="${scion}"]`).count() === 1, 'the boss is listed in its step');
for (const d of drops) ok(await page.locator(`.chk[data-i="${d}"]`).count() === 0, 'drop is not a row of its own: ' + MK.list[d][4]);
ok((await page.locator(`.chk[data-i="${scion}"] .cn small`).innerText()).includes('Golden Beast Crest Shield'), 'the boss row names its drops');
await page.locator(`.chk[data-i="${scion}"]`).scrollIntoViewIfNeeded(); await page.locator(`.chk[data-i="${scion}"] .box`).click(); await page.waitForTimeout(200);
let got = await page.evaluate(() => JSON.parse(localStorage.getItem('tarnished-route-v2')).got);
const K = i => MK.list[i].slice(0, 5).join('_');   // ticks are saved by map and position
ok(got[K(scion)] && drops.every(d => got[K(d)]), 'ticking the boss ticks its drops');
await page.screenshot({ path: 'shots/drops-belfries.png' });
await page.goto(base + '?tab=collection'); await page.waitForSelector('.group'); await page.locator('.group[data-c="Shields"]').click(); await page.waitForTimeout(300);
ok(await page.locator(`.row.got[data-i="${drops[0]}"]`).count() === 1, 'the drop shows as collected in the Collection tab');
await page.locator(`.row[data-i="${drops[0]}"] [data-tick]`).click(); await page.waitForTimeout(200);
got = await page.evaluate(() => JSON.parse(localStorage.getItem('tarnished-route-v2')).got);
ok(!got[K(scion)] && drops.every(d => !got[K(d)]), 'unticking the drop unticks the boss and its other drops');
await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
