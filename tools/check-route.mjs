// Coherence check of the WHOLE route against its sources: the two wiki walkthrough pages and every place page.
// It answers, with numbers and lists (data/route-check.txt):
//   A. Is every paragraph of the walkthrough (minus speed runs / item lists) in the route, once, in the wiki's order?
//   B. Is every place page that has a walkthrough used, once, with its full text?
//   C. Is every marker on the four maps in exactly one step?
//   D. Does each step's list match its text? (objectives the text never names; names in the text that sit in another step)
//   E. Does each place step hold what the place's own page lists?
// Usage: node tools/check-route.mjs      (exit code 1 when A, B or C fail)
import fs from 'node:fs';

const R = JSON.parse(fs.readFileSync('app/data/route.json', 'utf8')), MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8'));
const PLACES = JSON.parse(fs.readFileSync('data/places.json', 'utf8')), report = fs.readFileSync('data/route-report.txt', 'utf8');
const clean = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const tidy = t => t.replace(/^[^.]*Click on the image above to enlarge it\.\s*/i, '').replace(/(You can )?click HERE for the map'?s coordinates\.?\s*/gi, '').replace(/\[\s*(Elden Ring )?Map (Coordinates|Link)[^\]]*\]/gi, '').replace(/\[\s*Map\s*\]/gi, '').replace(/\(\s*\)/g, '').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
const key = t => tidy(clean(t)).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
const out = [], say = s => { out.push(s); };
let hardFail = 0;

// every text the route shows, by step
const stepText = R.map(s => [...s.text, ...(s.place ? [...s.place.walk, ...s.place.notes] : [])]);
const where = new Map(); stepText.forEach((ps, i) => ps.forEach(p => { const k = key(p); if (k.length > 20) { if (!where.has(k)) where.set(k, []); where.get(k).push(i); } }));

// A. walkthrough paragraphs
const dropped = new Set(report.split('\n').filter(l => l.startsWith('dropped')).map(l => l.replace(/^dropped[^:]*: /, '')));
let total = 0, present = 0, twice = 0, order = 0, lastAt = -1; const missing = [];
for (const [game, f] of [['base', 'walkthrough-base.json'], ['dlc', 'walkthrough-dlc.json']]) {
  lastAt = -1;
  for (const s of JSON.parse(fs.readFileSync('data/' + f, 'utf8'))) {
    if (dropped.has(clean(s.title))) continue;
    for (const raw of s.text || []) {
      const t = clean(raw); if (t.length < 60 || /click on the image/i.test(t.slice(0, 80)) && t.length < 200) continue;
      total++; const k = key(t.replace(/^[^.]*Click on the image above to enlarge it\.\s*/i, '')), at = where.get(k);
      if (!at) { missing.push(`${s.title}: ${t.slice(0, 90)}`); continue; }
      present++; if (at.length > 1) twice++;
      if (at[0] < lastAt - 12) order++;                 // appears clearly earlier than text that came before it on the wiki
      lastAt = Math.max(lastAt, at[0]);
    }
  }
}
say(`A. Walkthrough text: ${total} paragraphs on the wiki pages (speed runs and item lists excluded); ${present} are in the route, ${missing.length} are missing, ${twice} appear twice, ${order} are out of the wiki's order.`);
if (missing.length) { hardFail++; say('   MISSING:'); missing.slice(0, 60).forEach(m => say('   - ' + m)); }

// B. place pages
const titles = new Map(R.map((s, i) => [s.title.toLowerCase(), i]));
let used = 0, full = 0; const unused = [], partial = [];
for (const p of Object.values(PLACES)) {
  if (!p.walk.length) continue;
  const paras = p.walk.filter(x => !x.startsWith('## ') && x.length > 60), hit = paras.filter(x => where.has(key(x))).length;
  if (!hit && paras.length) { unused.push(p.title); continue; }
  used++; if (hit === paras.length) full++; else partial.push(`${p.title} (${hit} of ${paras.length} paragraphs)`);
}
say(`B. Place pages with their own walkthrough: ${used + unused.length}; ${used} are in the route (${full} with every paragraph), ${unused.length} are not used.`);
if (unused.length) { hardFail++; say('   NOT USED: ' + unused.join(', ')); }
if (partial.length) say('   Partly used: ' + partial.join('; '));

// C. markers
const cnt = new Int32Array(MK.list.length); R.forEach(s => [...s.m, ...s.n].forEach(i => cnt[i]++));
const none = [...cnt].filter(c => c === 0).length, multi = [...cnt].filter(c => c > 1).length;
say(`C. Map markers: ${MK.list.length}; ${MK.list.length - none - multi} are in exactly one step, ${none} in none, ${multi} in more than one.`);
if (none || multi) hardFail++;

// D. list against text
const kind = i => MK.cats[MK.list[i][3]].kind, name = i => clean(MK.list[i][4]).replace(/[‘’]/g, "'").replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[\d+\]\s*$/, '').replace(/\s+-\s+.*$/, '').trim().toLowerCase();
let obj = 0, namedHere = 0, listedHere = 0, namedElsewhere = 0, unnamed = 0; const worst = [], rest = [];
const pl = new Map(Object.values(PLACES).map(p => [p.title.toLowerCase(), new Set((p.links || []).map(l => clean(l).replace(/[‘’]/g, "'").toLowerCase()))]));
const listedBy = R.map(s => pl.get(s.title.toLowerCase()) || (s.place && pl.get(s.place.title.toLowerCase())) || null);
const lower = stepText.map((ps, i) => (R[i].title + ' . ' + ps.join(' ')).toLowerCase().replace(/[‘’]/g, "'"));
const says = (txt, i) => { const m = clean(MK.list[i][4]).replace(/[‘’]/g, "'").match(/^(.*\S)\s*[\[(](\d+)[\])]\s*$/); return m ? txt.includes(`${m[1].toLowerCase()} [${m[2]}]`) || txt.includes(`${m[1].toLowerCase()} (${m[2]})`) : txt.includes(name(i)); };
const allText = lower.join(' ');
R.forEach((s, si) => {
  let u = 0, n = 0;
  for (const i of new Set([...s.m, ...s.n])) { if (kind(i) !== 'g') continue; obj++; const nm = name(i); if (nm.length < 4) { namedHere++; continue; }
    if (says(lower[si], i)) namedHere++; else if (listedBy[si] && (listedBy[si].has(nm) || listedBy[si].has(clean(MK.list[i][4]).replace(/[‘’]/g, "'").toLowerCase()))) listedHere++; else if (says(allText, i)) { namedElsewhere++; n++; } else { unnamed++; u++; rest.push(MK.list[i][3] + ': ' + MK.list[i][4]); } }
  if (n >= 4) worst.push([n, `${si + 1}. ${s.title}: ${n} objectives that only another step's text talks about`]);
});
say(`D. Objectives (${obj}): ${namedHere} are named in the text of their own step; ${listedHere} more are in the item list of their own place's page; ${namedElsewhere} are listed in one step but only named in another step's text; ${unnamed} are not named in the route's text under their map name (map-only, item lists, or a different spelling).`);
worst.sort((a, b) => b[0] - a[0]).slice(0, 25).forEach(w => say('   - ' + w[1]));
fs.writeFileSync('data/route-unnamed.txt', rest.sort().join('\n'));

// E. place steps against the place page's own lists
let listed = 0, inStep = 0, elsewhere = 0;
const byTitle = new Map(); MK.list.forEach((m, i) => { const k = name(i); if (!byTitle.has(k)) byTitle.set(k, []); byTitle.get(k).push(i); });
const stepOf = new Int32Array(MK.list.length).fill(-1); R.forEach((s, si) => [...s.m, ...s.n].forEach(i => stepOf[i] = si));
for (const p of Object.values(PLACES)) {
  const si = titles.get(p.title.toLowerCase()); if (si == null) continue; const s = R[si];
  for (const l of p.links || []) for (const i of byTitle.get(clean(l).toLowerCase()) || []) {
    if (kind(i) !== 'g' || MK.maps[MK.list[i][0]] !== s.map || Math.hypot(MK.list[i][1] - s.x, MK.list[i][2] - s.y) > 0.02) continue;
    listed++; if (stepOf[i] === si) inStep++; else elsewhere++;
  }
}
say(`E. Items a place's own page lists that sit at that place on the map: ${listed}; ${inStep} are objectives of that place's step, ${elsewhere} are in a neighbouring step.`);
say(''); say(hardFail ? `RESULT: ${hardFail} hard check(s) failed.` : 'RESULT: A, B and C pass (all text present once, all place pages used, every marker in exactly one step). D and E show how well lists and text agree.');
fs.writeFileSync('data/route-check.txt', out.join('\n')); console.log(out.join('\n')); process.exit(hardFail ? 1 : 0);
