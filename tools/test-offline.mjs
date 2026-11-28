// Offline check against the published app (the offline worker only runs on https).
// One visit, then no network: does the app still start, with icons, cards and data?
// Usage: node tools/test-offline.mjs [url=https://mkultra1984.github.io/tarnished-route/]
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://mkultra1984.github.io/tarnished-route/';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 412, height: 800 }, deviceScaleFactor: 2, hasTouch: true }), page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));

await page.goto(url); await page.waitForSelector('.title');
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'first visit: the offline worker is in charge of the page');
await page.waitForTimeout(6000);   // the app fetches icons and card data once the worker is there

await ctx.setOffline(true);
await page.reload(); await page.waitForSelector('.title', { timeout: 20000 }).catch(() => {});
ok(await page.locator('.title').count() === 1, 'offline: the app starts and shows a step');
const icons = await page.locator('.tab img').evaluateAll(els => els.map(e => e.complete && e.naturalWidth > 0));
ok(icons.length === 6 && icons.every(Boolean), `offline: all tab icons are there (${icons.filter(Boolean).length} of ${icons.length})`);
const sym = await page.locator('.chk .ci').first().evaluate(e => e.complete && e.naturalWidth > 0).catch(() => false);
ok(sym, 'offline: the symbols of the objectives are there');
await page.locator('.tab[data-t="bosses"]').click(); await page.waitForSelector('.row');
await page.locator('.row .txt').nth(3).click(); await page.waitForTimeout(800);
ok(await page.locator('.card h2').count() === 1 && await page.locator('.card li').count() > 3, 'offline: a boss card opens with its text (card data was saved)');
ok(errors.length === 0, 'offline: no page errors' + (errors[0] ? ': ' + errors[0] : ''));

// a server that answers with an error must not blank the app: the saved copy is used
await ctx.setOffline(false);
await ctx.route('**/data/route.json', r => r.fulfill({ status: 500, body: 'error' })).catch(() => {});
await page.reload(); await page.waitForSelector('.title', { timeout: 20000 }).catch(() => {});
ok(await page.locator('.title').count() === 1, 'the app still starts when the server would answer the route data with an error (checked as far as the browser lets a test reach the worker)');

await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
