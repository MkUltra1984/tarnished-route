// "Forget this one": a thing you cannot get stops being asked for. Needs the local server: node tools/serve.mjs
import { chromium } from 'playwright'; import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:8123/', R = JSON.parse(fs.readFileSync('app/data/route.json', 'utf8')), MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8')), L = MK.list;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 800 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('tarnished-route-v2')));
const k0 = R.findIndex(s => s.m.some(j => MK.cats[L[j][3]].kind === 'g')), first = R[k0], i = first.m.find(j => MK.cats[L[j][3]].kind === 'g');
await p.goto(base); await p.waitForSelector('.title'); for (let q = 0; q < k0; q++) { await p.locator('.done').click(); await p.waitForTimeout(250); }   // past the steps without anything to tick
ok(/1 left open/.test(await p.locator('.done').innerText()), `step ${k0 + 1} (${first.title}) starts with 1 open`);
await p.locator(`.chk[data-i="${i}"] .cn`).click(); await p.locator('[data-skip]').click(); await p.waitForTimeout(200);
ok(await p.locator(`.chk.gone[data-i="${i}"]`).count() === 1, 'forgetting it greys the row out');
ok((await p.locator('.done').innerText()).trim() === 'DONE' || /^done$/i.test((await p.locator('.done').innerText()).trim()), 'the step then counts as done ("Done", nothing left open)');
await p.locator('.done').click(); await p.waitForTimeout(300); const st = await state();
ok(st.st[first.id] === 'd' && await p.locator('#openb').count() === 0, 'moving on marks the step done and no "open" reminder appears');
ok(Object.keys(st.skip).length === 1 && !Object.keys(st.got).length, 'it is saved as forgotten, not as collected');
await p.reload(); await p.waitForSelector('.title'); ok(await p.locator('#openb').count() === 0, 'still no reminder after a reload');
await p.goto(base + '?step=' + k0); await p.waitForSelector('.chk'); await p.locator(`.chk[data-i="${i}"] .cn`).click(); ok((await p.locator('[data-skip]').innerText()).includes('Bring it back'), 'it can be brought back');
await p.locator('[data-skip]').click(); await p.waitForTimeout(200); ok(await p.locator(`.chk.gone[data-i="${i}"]`).count() === 0 && (await state()).st[first.id] === 'l', 'brought back: the step is open again');
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
