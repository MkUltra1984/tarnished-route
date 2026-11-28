// Questlines, achievements, New Game Plus and reference tables (from Redmaw's sheets). Needs: node tools/serve.mjs
import { chromium } from 'playwright'; import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:8123/', E = JSON.parse(fs.readFileSync('app/data/extra.json', 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 800 }, deviceScaleFactor: 2, hasTouch: true })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const chk = () => p.evaluate(() => JSON.parse(localStorage.getItem('tarnished-route-v2')).chk || {});
await p.goto(base + '?tab=quests'); await p.waitForSelector('.qline'); ok(await p.locator('.qline').count() === E.quests.length, `Quests lists all ${E.quests.length} questlines`);
await p.locator('.qline summary').nth(1).click(); await p.locator('.qline[open] [data-q]').first().click(); await p.waitForTimeout(300);
ok(await p.locator('.qline[open]').count() === 1 && await p.locator('.qline[open] .chk.got').count() === 1 && (await chk())[E.quests[1].lines[0].id] === 1, 'ticking a quest step keeps the questline open and is saved');
ok(await p.locator('.row').count() > 100, 'the map positions of the people are still listed below');
await p.goto(base + '?tab=collection'); await p.waitForSelector('.group'); await p.locator('.group[data-c="@achievements"]').click(); await p.waitForSelector('[data-q]');
ok(await p.locator('[data-q]').count() === E.achievements.reduce((n, s) => n + s.lines.length, 0), 'Achievements lists all 72'); await p.locator('[data-q]').first().click(); await p.waitForTimeout(200); ok(/1 of 72/.test(await p.locator('#cnt').innerText()), 'ticking one counts');
await p.locator('.back').click(); await p.waitForTimeout(200); await p.locator('.group[data-c="@ngplus"]').click(); await p.waitForSelector('[data-q]'); ok(await p.locator('[data-q]').count() === E.ngplus.reduce((n, s) => n + s.lines.length, 0), 'New Game Plus lists all its lines');
await p.goto(base + '?tab=materials'); await p.waitForSelector('.group'); await p.locator('.group[data-c="@reference"]').click(); await p.waitForSelector('.reft'); ok(await p.locator('.reft table').count() === E.reference.reduce((n, s) => n + s.blocks.filter(x => x.rows).length, 0), 'Reference shows all tables');
await p.locator('.back').click(); await p.waitForTimeout(200); await p.locator('.group').first().click(); await p.waitForTimeout(300); ok(await p.locator('.group').count() > 3, 'the material categories still open after visiting the reference');
ok(errs.length === 0, 'no page errors' + (errs[0] ? ': ' + errs[0] : '')); await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
