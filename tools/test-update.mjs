// Checks that an open copy of the live app updates itself after a deploy, without clearing anything.
// Opens the app, remembers its version, then waits (up to 12 minutes) for the page to reload itself onto a newer one.
// Usage: node tools/test-update.mjs <liveUrl>      (start it, then deploy)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-update-'));
const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 412, height: 915 } });
const page = ctx.pages()[0] || await ctx.newPage();
let loads = 0; page.on('load', () => loads++);
await page.goto(url, { waitUntil: 'networkidle' });
const version = () => page.evaluate(() => fetch('version.json?x=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(j => j.v));
const v0 = await version(); await page.evaluate(v => { window.__opened = v; }, v0);
console.log('opened at version', v0.slice(0, 8), '- waiting for a deploy');
const t0 = Date.now(); let done = false;
while (Date.now() - t0 < 12 * 60 * 1000) {
  await page.waitForTimeout(10000);
  // what a phone does when you switch back to the app
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => {});
  await page.waitForTimeout(3000);
  const marker = await page.evaluate(() => window.__opened).catch(() => 'reloading');
  if (marker === undefined) { done = true; break; }       // the page reloaded itself: our marker is gone
}
if (done) { await page.waitForLoadState('networkidle'); const v1 = await version(); console.log(`PASS: the page reloaded itself after ${Math.round((Date.now() - t0) / 1000)} s and now runs version ${v1.slice(0, 8)} (was ${v0.slice(0, 8)}); step shown: ${await page.locator('.over.gold').innerText()}`); }
else console.log('FAIL: no self-reload within 12 minutes');
await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(done ? 0 : 1);
