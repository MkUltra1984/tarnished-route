// Coherence audit of app/data/route.json: does each step follow sensibly from the one before, and does what a step
// shows fit together?   node tools/route-coherence.mjs [--all]
import fs from 'node:fs';
const R = JSON.parse(fs.readFileSync('app/data/route.json', 'utf8')), MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8')), L = MK.list;
const kind = i => MK.cats[L[i][3]].kind, plain = t => (t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), all = process.argv.includes('--all');
const dropOf = new Map(); for (const b in MK.drops || {}) for (const i of MK.drops[b]) dropOf.set(i, +b);
const own = s => s.m.filter(i => kind(i) === 'g' && !dropOf.has(i)), F = {};
const flag = (k, msg) => (F[k] = F[k] || []).push(msg), label = (s, k) => `${k + 1}. ${s.title} [${s.region}]`;
const ORD = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, sixth: 6, '6th': 6, seventh: 7, eight: 8, eighth: 8, final: 99, last: 99 };
const ordOf = i => { const m = L[i][4].match(/\(?(first|second|third|fourth|fifth|sixth|seventh|eighth?|final|last|\d(?:st|nd|rd|th))\s+location\)?/i); return m ? ORD[m[1].toLowerCase()] : null; };
const short = t => { let p, x = plain(t); do { p = x; x = x.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').trim(); } while (x !== p); return x; };
const seenPerson = new Map(), ids = new Set(), titles = new Map();
R.forEach((s, k) => { const p = R[k - 1];
  if (ids.has(s.id)) flag('A. duplicate step ids', label(s, k)); ids.add(s.id);
  if (!own(s).length && !s.n.some(i => kind(i) === 'g')) flag('B. steps with nothing to do (no objective of their own or nearby)', label(s, k) + ' :: ' + s.text.join(' ').slice(0, 90));
  if (!s.text.length || s.text.join(' ').length < 15) flag('C. steps without any text', label(s, k));
  if (s.title === s.region.replace(/ · meeting.*$/, '')) flag('D. steps titled only by their area (no objective named)', label(s, k));
  // an unnamed person / boss placed behind the nearest step: is it really near, and in the same stretch?
  if (s.extra && p) { const d = p.map === s.map ? Math.hypot(p.x - s.x, p.y - s.y) : 9; if (d > 0.05) flag('E. inserted person/boss steps far from the step before (' + '>0.05 of the map)', `${label(s, k)} is ${d > 5 ? 'on another map than' : d.toFixed(2) + ' from'} ${label(p, k - 1)}`); }
  // meetings of one person in the order of their numbered places
  for (const i of s.m) if (L[i][3] === 'NPCs') { const n = short(L[i][4]), o = ordOf(i); if (o == null) continue; const prev = seenPerson.get(n); if (prev && prev.o > o) flag('F. a person\'s later place comes before an earlier one', `${n}: "${plain(L[prev.i][4])}" at step ${prev.k + 1}, then "${plain(L[i][4])}" at step ${k + 1}`); if (!prev || o > prev.o) seenPerson.set(n, { o, i, k }); }
  // a boss ticked off in a step that is not about fighting it
  for (const i of s.m) if (L[i][3] === 'Bosses' && !s.extra) { const nm = short(L[i][4]).split(/[ ,]/)[0].toLowerCase(), t = s.text.join(' ').toLowerCase(); if (!/kill|defeat|fight|slay|beat|boss|drops?|dropped/.test(t)) flag('G. a boss is an objective but the step\'s text does not speak of fighting', label(s, k) + ' :: ' + plain(L[i][4])); }
  // own objectives that lie far apart inside one step
  const o = own(s); let spread = 0; for (const a of o) for (const b of o) if (L[a][0] === L[b][0]) spread = Math.max(spread, Math.hypot(L[a][1] - L[b][1], L[a][2] - L[b][2])); else spread = 9; if (spread > 0.06) flag('H. one step whose own objectives lie far apart (>0.06 of the map or on two maps)', `${label(s, k)} :: ${o.map(i => plain(L[i][4])).join('; ')} (${spread > 5 ? 'two maps' : spread.toFixed(2)})`);
  // "nearby" things that are not near
  for (const i of s.n) if (kind(i) === 'g') { const d = MK.maps[L[i][0]] === s.map ? Math.hypot(L[i][1] - s.x, L[i][2] - s.y) : 9; if (d > 0.05) flag('I. "nearby, on the way" objectives that are not near (>0.05)', `${label(s, k)} :: ${plain(L[i][4])} (${d > 5 ? 'other map' : d.toFixed(2)})`); }
  // the text of a step talks about things, in the wiki's words, that belong to another step
  if (s.guide) for (const g of s.guide) if (g.text.join(' ').length > 6000) flag('J. very long fold-out wiki text (>6000 characters) on one step', `${label(s, k)} :: ${g.title} (${g.text.join(' ').length})`);
  const t = s.title; if (!titles.has(t)) titles.set(t, []); titles.get(t).push(k);
  if (s.title.length > 60) flag('K. titles longer than 60 characters', label(s, k));
  if (s.miss && s.miss.length > 400) flag('L. missable notes longer than 400 characters', label(s, k) + ' (' + s.miss.length + ')');
  if (s.card != null && !s.m.includes(s.card)) flag('M. the step\'s picture belongs to a thing that is not in the step', label(s, k));
  if (p && p.game === 'dlc' && s.game === 'base') flag('N. base-game step after the expansion started', label(s, k));
});
for (const [t, ks] of titles) if (ks.length > 3 && !/^(Golden Seed|Stonesword Key|Sacred Tear|Memory Stone|Larval Tear|Scadutree Fragment|Revered Spirit Ash|Rune Arc|Dragon Heart|Deathroot|Lost Ashes of War|Furlcalling|Golden Rune|Somber|Smithing)/.test(t)) flag('O. the same title on more than three steps (hard to tell apart)', `${t} x${ks.length}: steps ${ks.slice(0, 8).map(k => k + 1).join(', ')}`);
// jumps: consecutive steps on one map that are far apart, more often than a walkthrough with fast travel would explain
let jumps = 0, big = []; R.forEach((s, k) => { const p = R[k - 1]; if (!p || p.map !== s.map) return; const d = Math.hypot(p.x - s.x, p.y - s.y); if (d > 0.15) { jumps++; big.push(`${d.toFixed(2)}: ${label(p, k - 1)} -> ${label(s, k)}${/travel|warp|teleport|return to|go back|sending gate|waygate|grace/i.test(s.text.join(' ').slice(0, 400)) ? '' : '  (no travel word in the text)'}`); } });
F['P. long jumps between consecutive steps (>0.15 of the map)'] = big;
console.log(`${R.length} steps audited.`);
for (const k of Object.keys(F).sort()) { console.log(`\n${k}: ${F[k].length}`); (all ? F[k] : F[k].slice(0, 6)).forEach(x => console.log('   - ' + x.slice(0, 230))); }
