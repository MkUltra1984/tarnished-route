// Checks for the defects found in the independent review (UPDATE 16). Needs the local server: node tools/serve.mjs
// Usage: node tools/test-fixes.mjs [baseUrl=http://localhost:8123/]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:8123/';
const R = JSON.parse(fs.readFileSync('app/data/route.json', 'utf8')), MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8')), L = MK.list;
const drop = new Set(Object.values(MK.drops).flat()), own = s => [...new Set([...s.m, ...s.n])].filter(i => MK.cats[L[i][3]].kind === 'g' && !drop.has(i));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const KEY = 'tarnished-route-v2', state = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
const browser = await chromium.launch();
const phone = async (w = 412, h = 800) => { const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p; };

// missable warnings are shown in full
{ const p = await phone(), k = R.findIndex(s => s.miss && s.miss.length > 300); await p.goto(base + '?step=' + k); await p.waitForSelector('.miss');
  const full = await p.locator('.miss').evaluate(e => e.scrollHeight <= e.clientHeight + 1 && getComputedStyle(e).overflow !== 'hidden');
  ok(full, `a long missable warning (${R[k].miss.length} characters, step ${k + 1}) is shown in full`); await p.close(); }

// a tab opened through the address is not remembered
{ const p = await phone(); await p.goto(base); await p.waitForSelector('.title'); await p.goto(base + '?tab=bosses'); await p.waitForSelector('.row');
  await p.locator('.row [data-tick]').first().click(); await p.waitForTimeout(200); ok((await state(p)).tab === 'route', '?tab=bosses is a look: the remembered tab stays "route" even after a tick saved the state');
  await p.locator('.tab[data-t="quests"]').click(); await p.waitForTimeout(200); ok((await state(p)).tab === 'quests', 'tapping a tab is remembered'); await p.close(); }

// ticking a boss in the Bosses list settles the step it belongs to
{ const k = R.findIndex(s => s.boss && own(s).length === 1 && L[own(s)[0]][3] === 'Bosses'), b = own(R[k])[0]; const p = await phone();
  await p.goto(base); await p.waitForSelector('.title'); await p.evaluate(([key, id]) => localStorage.setItem(key, JSON.stringify({ st: { [id]: 'l' }, got: {}, hist: [id], tab: 'bosses', routeV: -1 })), [KEY, R[k].id]);
  await p.goto(base); await p.waitForSelector('.row'); await p.locator(`.row[data-i="${b}"] [data-tick]`).click(); await p.waitForTimeout(200);
  ok((await state(p)).st[R[k].id] === 'd', `ticking "${L[b][4]}" in the Bosses list turns its left-open step into done`);
  await p.locator(`.row[data-i="${b}"] [data-tick]`).click(); await p.waitForTimeout(200); ok((await state(p)).st[R[k].id] === 'l', 'unticking it makes the step open again'); await p.close(); }

// the card picture of a step opens the card (it used to open the plain picture zoom)
{ const C = JSON.parse(fs.readFileSync('app/data/cards.json', 'utf8')), k = R.findIndex(s => s.card != null && C.by[L[s.card][4]] && C.pages[C.by[L[s.card][4]]].img); const p = await phone();
  await p.goto(base + '?step=' + k); await p.waitForSelector('.cardlead'); await p.locator('.cardlead').click(); await p.waitForTimeout(400);
  ok(await p.locator('.card h2').count() === 1 && await p.locator('.bigshot').count() === 0, `tapping the picture of step ${k + 1} opens its card`);
  // ticking through a card keeps a long list where it was
  await p.goto(base + '?tab=bosses'); await p.waitForSelector('.row'); await p.locator('.list').evaluate(e => e.scrollTop = 3000); const before = await p.locator('.list').evaluate(e => e.scrollTop);
  const row = p.locator('.row .txt').nth(40); await row.scrollIntoViewIfNeeded(); const y0 = await p.locator('.list').evaluate(e => e.scrollTop); await row.click(); await p.waitForSelector('#ctick'); await p.locator('#ctick').click(); await p.waitForTimeout(300);
  ok(Math.abs(await p.locator('.list').evaluate(e => e.scrollTop) - y0) < 5 && before > 0, 'marking a boss as defeated from its card keeps the list position'); await p.close(); }

// a phone held sideways: the next step starts at its top
{ const p = await phone(915, 330); await p.goto(base); await p.waitForSelector('.title'); await p.evaluate(() => document.querySelector('#pane').scrollTo(0, 400)); await p.locator('.done').click(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.querySelector('#pane').scrollTop) === 0, 'sideways: after "Next step" the new step is shown from its top'); await p.close(); }

// a step far from the one before names the nearest site of grace
{ const k = R.findIndex(s => s.travel); const p = await phone(); await p.goto(base + '?step=' + k); await p.waitForSelector('.travel'); ok((await p.locator('.travel').innerText()).includes(R[k].travel), `step ${k + 1} names the nearest site of grace (${R[k].travel})`);
  ok(p.errs.length === 0, 'no page errors' + (p.errs[0] ? ': ' + p.errs[0] : '')); await p.close(); }

// ticks survive a rebuilt marker list: they are saved by map and position, and an old save (by number) is still read
{ const p = await phone(), b = L.findIndex(m => m[3] === 'Bosses'), K = i => L[i].slice(0, 5).join('_');
  await p.goto(base); await p.waitForSelector('.title'); await p.evaluate(([key, i]) => localStorage.setItem(key, JSON.stringify({ st: {}, got: { [i]: 1 }, hist: [], tab: 'bosses' })), [KEY, b]);
  await p.goto(base); await p.waitForSelector('.row'); ok(await p.locator(`.row.got[data-i="${b}"]`).count() === 1, 'an old save (ticks by number) is still read');
  await p.locator('.row [data-tick]').nth(5).click(); await p.waitForTimeout(200); const st = await state(p); ok(st.gotV === 3 && st.got[K(b)] === 1 && !(b in st.got), 'ticks are now saved by map, position and name');
  await p.reload(); await p.waitForSelector('.row'); ok(await p.locator(`.row.got[data-i="${b}"]`).count() === 1, 'and read back after a reload'); await p.close(); }

await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
