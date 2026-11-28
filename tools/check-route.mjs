// Coherence check of the WHOLE route against its sources: the two wiki walkthrough pages and every place page.
// It answers, with numbers and lists (data/route-check.txt):
//   A. Is every paragraph of the walkthrough (minus speed runs / item lists) in the route, once, in the wiki's order?
//   B. Is every place page that has a walkthrough used, once, with its full text?
//   C. Is every marker on the four maps in exactly one step?
//   D. Does each step's list match its text? (objectives the text never names; names in the text that sit in another step)
//   E. Does each place step hold what the place's own page lists?
// Usage: node tools/check-route.mjs      (exit code 1 when A, B or C fail)
import fs from 'node:fs';
import { ENTRY, SPECIAL, canonRegion } from './regions.mjs';

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
let total = 0, present = 0, order = 0, lastAt = -1; const missing = [], wikiN = new Map(), extra = [];
for (const [game, f] of [['base', 'walkthrough-base.json'], ['dlc', 'walkthrough-dlc.json']]) {
  lastAt = -1;
  for (const s of JSON.parse(fs.readFileSync('data/' + f, 'utf8'))) {
    if (dropped.has(clean(s.title))) continue;
    const inSec = new Set();
    for (const raw of s.text || []) {
      const t = clean(raw); if (t.length < 60 || /click on the image/i.test(t.slice(0, 80)) && t.length < 200) continue;
      const k = key(t.replace(/^[^.]*Click on the image above to enlarge it\.\s*/i, '')), at = where.get(k);
      total++; if (!inSec.has(k)) { inSec.add(k); wikiN.set(k, (wikiN.get(k) || 0) + 1); }
      if (!at) { missing.push(s.title + ': ' + t.slice(0, 90)); continue; }
      present++;
      // the wiki repeats some paragraphs in two sections: take the copy that fits the wiki's order
      const pos = at.find(i => i >= lastAt - 12) ?? at[at.length - 1];
      if (pos < lastAt - 12) { order++; extra.push('out of order: "' + t.slice(0, 60) + '" of section ' + s.title + ' is in step ' + (pos + 1) + '. ' + R[pos].title + ', after text shown in step ' + (lastAt + 1)); }
      lastAt = Math.max(lastAt, pos);
    }
  }
}
for (const [k, n] of wikiN) { const at = where.get(k); if (at && new Set(at).size > n) extra.push(R[at[0]].title + ' / ' + R[at[at.length - 1]].title); if (at && at.length > new Set(at).size) extra.push('twice inside ' + R[at[0]].title); }
const twice = extra.length;
say('A. Walkthrough text: ' + total + ' paragraphs on the wiki pages (speed runs and item lists excluded); ' + present + ' are in the route, ' + missing.length + ' are missing, ' + twice + ' are shown more often than the wiki has them, ' + order + ' are out of the wiki\'s order.');
if (missing.length) { hardFail++; say('   MISSING:'); missing.slice(0, 60).forEach(m => say('   - ' + m)); }
if (twice || order) { hardFail++; extra.slice(0, 20).forEach(m => say('   - more often: ' + m)); }

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
const kind = i => MK.cats[MK.list[i][3]].kind, name = i => clean(MK.list[i][4]).replace(/[‘’]/g, "'").replace(/\s+-\s+.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[\d+\]\s*$/, '').replace(/\s+-\s+.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
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

// F. every objective has a reason to be where it is, and nothing comes before its region opens
{
  const src = report.split('\n').filter(l => /^\d+\. \[/.test(l)).map(l => l.match(/\[(\w+)\]/)[1]);
  const titlesL = R.map(s => s.title.toLowerCase().replace(/[‘’]/g, "'"));
  const pinD = (si, i) => MK.maps[MK.list[i][0]] === R[si].map ? Math.hypot(MK.list[i][1] - R[si].x, MK.list[i][2] - R[si].y) : 9;
  const sakes = new Map(); MK.list.forEach((m, i) => { if (kind(i) !== 'g') return; const k = name(i); if (!sakes.has(k)) sakes.set(k, []); sakes.get(k).push(i); });
  const meant = (si, i) => !sakes.get(name(i)).some(o => o !== i && pinD(si, o) < pinD(si, i));
  const placeT = new Set(Object.values(PLACES).map(p => p.title.toLowerCase().replace(/[‘’]/g, "'")));
  const after = (si, i) => says(titlesL[si], i) && !(placeT.has(titlesL[si]) && titlesL[si] !== name(i));   // a place's own name does not count
  const f1 = [], f2 = [], f3 = []; const why = { title: 0, text: 0, list: 0, note: 0 };
  R.forEach((s, si) => { for (const i of new Set([...s.m, ...s.n])) { if (kind(i) !== 'g') continue; const nm = name(i); if (nm.length < 4) { why.text++; continue; }
    const generic = sakes.get(nm).length >= 3 && !/[\[(]\d+[\])]\s*$/.test(MK.list[i][4]);
    const here = says(lower[si], i), listed = listedBy[si] && (listedBy[si].has(nm) || listedBy[si].has(clean(MK.list[i][4]).replace(/[‘’]/g, "'").toLowerCase()));
    // F1: a step is named after it, but it sits elsewhere
    if (!after(si, i)) { const t = R.findIndex((x, xi) => xi !== si && after(xi, i) && pinD(xi, i) < 0.1 && meant(xi, i)); if (t >= 0) f1.push(MK.list[i][4] + ' is in "' + s.title + '" but "' + R[t].title + '" is named after it'); }
    // F2: its own step says nothing about it, while a step that happens closer to it does
    if (!here && !listed) { const d0 = pinD(si, i); const t = R.findIndex((x, xi) => xi !== si && says(lower[xi], i) && pinD(xi, i) < Math.min(d0, generic ? 0.03 : 0.08) && (!generic || meant(xi, i))); if (t >= 0) f2.push(MK.list[i][4] + ' is in "' + s.title + '" (' + d0.toFixed(3) + ') but the text of "' + R[t].title + '" (' + pinD(t, i).toFixed(3) + ') names it'); }
    // F3: nothing in the app would tell you what to do about it
    const note = clean(MK.list[i][5]);
    if (after(si, i)) why.title++; else if (here) why.text++; else if (listed) why.list++; else if (note.length > 15) why.note++; else f3.push(MK.list[i][3] + ': ' + MK.list[i][4] + ' in "' + s.title + '"');
  } });
  say('F. Why each objective is where it is: ' + why.title + ' are what their step is named after, ' + why.text + ' are named in their step\'s text, ' + why.list + ' are in their place\'s own item list, ' + why.note + ' are passed on the way (nearest step) and explained by the map\'s own note; ' + f3.length + ' have no explanation at all.');
  say('   Named after a step but placed elsewhere: ' + f1.length + '. Named only by a closer step: ' + f2.length + '.');
  [...f1, ...f2, ...f3].slice(0, 80).forEach(x => say('   - ' + x));
  if (f1.length || f2.length || f3.length) hardFail++;

  // G. order: a place is never visited before the walkthrough has opened its region
  const regOf = new Map(Object.values(PLACES).filter(p => p.region).map(p => [p.title.toLowerCase(), canonRegion(p.region)]));
  const entry = z => { const e = ENTRY.find(x => x[0] === z); return e ? R.findIndex((s, i) => src[i] === 'walk' && e[1].test(s.region + ' | ' + s.title)) : -1; };
  const g = []; let checked = 0;
  R.forEach((s, i) => { if (src[i] === 'walk') return; const z = regOf.get(s.title.toLowerCase()); if (!z) return; const e = entry(z); if (e < 0) return; checked++; if (i <= e) g.push((i + 1) + '. ' + s.title + ' (' + z + ') comes before ' + (e + 1) + '. ' + R[e].title); });
  say('G. Order: ' + checked + ' inserted places have a region with a known entry point in the walkthrough; ' + g.length + ' come before it.');
  for (const [title, re, how] of SPECIAL) { const i = R.findIndex(s => s.title === title), w = R.findIndex((s, k) => src[k] === 'walk' && re.test(s.title)); if (i < 0 || w < 0) { g.push(title + ': not found'); continue; } if (how === 'after' ? !(i > w && i <= w + SPECIAL.length + 2) : i !== w - 1) g.push((i + 1) + '. ' + title + ' should come ' + how + ' ' + (w + 1) + '. ' + R[w].title); }
  const mixed = R.findIndex((s, i) => i && s.game === 'base' && R[i - 1].game === 'dlc'); if (mixed >= 0) g.push((mixed + 1) + '. ' + R[mixed].title + ' is a base-game step after the expansion has started');
  g.forEach(x => say('   - ' + x)); if (g.length) hardFail++;
}
say(''); say(hardFail ? `RESULT: ${hardFail} hard check(s) failed.` : 'RESULT: all hard checks pass (A text, B place pages, C markers, F objectives, G order). D and E are statistics.');
fs.writeFileSync('data/route-check.txt', out.join('\n')); console.log(out.join('\n')); process.exit(hardFail ? 1 : 0);
