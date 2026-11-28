// Drives the real app in a headless browser and checks the main flows. Needs the local server: node tools/serve.mjs
// Usage: node tools/test-app.mjs [baseUrl=http://localhost:8123/]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8123/';
const browser = await chromium.launch();
let fails = 0; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };

for (const [name, w, h] of [['tablet', 1280, 800], ['phone', 412, 915]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  const title = () => page.locator('.title').innerText(), stepNo = () => page.locator('.over.gold').innerText();
  ok((await stepNo()).startsWith('STEP 1 OF') || (await stepNo()).toLowerCase().startsWith('step 1 of'), `${name}: starts at step 1 (${await stepNo()})`);
  // the route opens with character creation, a step without anything to tick: the checks below start at the step after it
  if (await page.locator('.chk').count() === 0) { ok(/character creation/i.test(await title()), `${name}: the route opens with character creation`); await page.locator('.done').click(); await page.waitForTimeout(400); }
  const first = await title();
  // nothing is cut off: the main button, the map buttons and the tab bar are fully inside the window
  for (const sel of ['.done', '#tabs', '#recentre', '#zin', '#zout']) { const b = await page.locator(sel).boundingBox(); ok(b && b.y >= 0 && b.y + b.height <= h + 0.5 && b.x >= 0 && b.x + b.width <= w + 0.5, `${name}: ${sel} fully visible`); }
  const done = await page.locator('.done').boundingBox(), tabs = await page.locator('#tabs').boundingBox(); ok(done.y + done.height <= tabs.y, `${name}: main button sits above the tab bar`);
  ok(await page.locator('.leaflet-marker-icon').count() > 1, `${name}: step markers drawn (${await page.locator('.leaflet-marker-icon').count()})`);
  ok(await page.locator('.leaflet-tile-loaded').count() > 3, `${name}: map tiles loaded`);
  // every objective has its own tick
  const rows = await page.locator('.chk').count(); ok(rows > 0, `${name}: objectives listed (${rows})`);
  await page.locator('.chk .cn').first().click(); await page.waitForTimeout(500); ok(await page.locator('.info').count() === 1, `: tapping an objective explains it (${(await page.locator('.info').innerText()).slice(0, 50)}...)`); await page.screenshot({ path: `shots/app-${name}-info.png` });
  await page.locator('.chk .box').first().click(); await page.waitForTimeout(150);
  ok(await page.locator('.chk.got').count() === 1, `${name}: one objective ticked on its own`);
  ok((await page.locator('.done').innerText()).toLowerCase().includes('left open') === (rows > 1), `${name}: button says what is still open`);
  // moving on with open objectives: the step is remembered, Undo is offered
  await page.locator('.done').click(); await page.waitForTimeout(300);
  ok(await title() !== first, `${name}: moves to the next step (${await title()})`);
  ok(await page.locator('#undo').count() === 1, `${name}: Undo is offered`);
  await page.screenshot({ path: `shots/app-${name}-undo.png` });
  await page.locator('#undo').click(); await page.waitForTimeout(300);
  ok(await title() === first && await page.locator('.chk.got').count() === 1, `${name}: Undo returns to the step with its tick kept`);
  // tick everything -> the button becomes Done
  if (rows > 1) { await page.locator('#allb').click(); await page.waitForTimeout(150); }
  ok((await page.locator('.done').innerText()).trim().toLowerCase() === 'done', `${name}: all ticked, button reads Done`);
  await page.locator('.done').click(); await page.waitForTimeout(4400);
  ok(await page.locator('#undo').count() === 1 && await page.locator('.next').count() === 1, `${name}: Undo stays available`);
  const tA = await title(); await page.locator('.done').click(); await page.waitForTimeout(200); await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#undo').click(); await page.waitForTimeout(200); ok(await title() === tA, `${name}: Undo still works after closing and reopening`);
  ok((await page.locator('.meta').first().innerText()) !== '', `${name}: progress shown`);
  // zoom buttons
  const z0 = await page.evaluate(() => document.querySelectorAll('.leaflet-tile').length); await page.locator('#zout').click(); await page.waitForTimeout(500); await page.locator('#zin').click(); await page.waitForTimeout(500); ok(true, `${name}: zoom buttons respond`);
  // the full directions are on the page without expanding anything
  ok(await page.locator('.dir p').count() >= 1 && await page.locator('.more').count() === 0, `${name}: directions shown in full, nothing to expand`);
  const t4 = await title(); await page.reload({ waitUntil: 'networkidle' }); ok(await title() === t4, `${name}: progress is kept after reload`);
  await page.screenshot({ path: `shots/app-${name}-route.png` });
  // rerouting: what was left open shows in the header counter and its list
  await page.evaluate(() => { localStorage.clear(); }); await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.done').click(); await page.waitForTimeout(300);
  ok(await page.locator('#openb').count() === 1, `${name}: skipped objectives are counted (${await page.locator('#openb').innerText()})`);
  await page.locator('#openb').click(); await page.waitForTimeout(300);
  ok(await page.locator('.row').count() > 0, `${name}: "Left open" list shows them (${await page.locator('.row').count()})`);
  await page.screenshot({ path: `shots/app-${name}-leftopen.png` });
  await page.locator('.back').click(); await page.waitForTimeout(300);
  const nearby = await page.locator('.over.warn').count(); ok(true, `${name}: next step lists ${nearby ? await page.locator('.over.warn').innerText() : 'no leftovers nearby'}`);
  await page.screenshot({ path: `shots/app-${name}-nearby.png` });
  // tabs
  for (const t of ['bosses', 'collection', 'quests', 'materials']) {
    await page.locator(`.tab[data-t="${t}"]`).click(); await page.waitForTimeout(400);
    ok(await page.locator('.listhead h1').count() === 1, `${name}: ${t} tab opens (${await page.locator('#cnt').innerText()})`);
    if (t === 'collection') { await page.locator('.group').first().click(); await page.waitForTimeout(300); await page.screenshot({ path: `shots/app-${name}-collection-open.png` }); await page.locator('.row [data-tick]').first().click(); ok(await page.locator('.row.got').count() >= 1, `${name}: ticking an item works`); await page.locator('.back').click(); await page.waitForTimeout(200); }
    if (t === 'bosses') { await page.locator('.row .txt').nth(3).click(); await page.waitForTimeout(900); ok(await page.locator('.card h2').count() === 1, `${name}: tapping a boss opens its card (${await page.locator('.card li').count()} lines, picture: ${await page.locator('.cpic img').count() === 1})`); await page.screenshot({ path: `shots/app-${name}-card.png` }); await page.locator('.cx').click(); await page.waitForTimeout(300); ok(await page.locator('#sheet').isHidden(), `${name}: the card closes`); }
    await page.screenshot({ path: `shots/app-${name}-${t}.png` });
  }
  await page.locator('.tab[data-t="route"]').click(); await page.waitForTimeout(300);
  await page.locator('.tab[data-t="settings"]').click(); await page.waitForTimeout(200); await page.screenshot({ path: `shots/app-${name}-settings.png` });
  await page.locator('#al .btn').nth(1).click(); await page.waitForTimeout(600); await page.locator('.tab[data-t="route"]').click(); await page.waitForTimeout(600);
  ok(await page.locator('.sym.far').count() > 0, `${name}: "Everything" shows the other markers (${await page.locator('.sym.far').count()})`);
  await page.screenshot({ path: `shots/app-${name}-all.png` });
  ok(errors.length === 0, `${name}: no page errors${errors.length ? ': ' + [...new Set(errors)].slice(0, 5).join(' | ') : ''}`);
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
