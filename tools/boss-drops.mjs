// Which items are a boss's own drop? Read from the wiki's map notes ("Dropped by X upon defeat") and matched to the
// boss marker beside them. The app ticks these together with the boss instead of listing them as things to pick up.
// Writes "drops": { "<boss marker>": [item markers] } into app/data/markers.json.   Usage: node tools/boss-drops.mjs [--list]
import fs from 'node:fs';
const file = 'app/data/markers.json', MK = JSON.parse(fs.readFileSync(file, 'utf8')), L = MK.list;
const norm = s => s.replace(/<[^>]+>/g, ' ').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const base = s => norm(s).replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').trim();
const GENERIC = new Set('knight black blade queen king lord first elden golden order great greater lesser spirit ulcerated tree erdtree burial watchdog cemetery shade night cavalry omen full moon mother fingers captain fire knights valiant dragon ancient flying magma putrid death beast clergyman crucible warrior solitary naturalborn stars darkness royal commander general elder leader ringleader apostle noble godskin giant'.split(' '));
const keys = t => base(t).split(/[^a-z']+/).filter(w => w.length >= 6 && !GENERIC.has(w)).map(w => w.slice(0, 6));
const DROP = /dropped (by|from)|drops? from|\bdrops? (the following|upon|after)|as a drop|reward(ed)? (for|after|upon)|as a reward|(obtained|acquired|received|obtain[^.]{0,30}) (by|after|upon|for) defeating|(by|upon|after|for) defeating|upon defeat|when defeated/i;
const NOT = /corpse|chest|looted|scarab|beetle|questline|quest\b|invad|will drop this item at|lesser|enemy|enemies|soldier|statue|altar/i;
const MANUAL = { 'Remembrance of the Full Moon Queen': 'Rennala, Queen of the Full Moon', 'Great Rune of the Unborn': 'Rennala, Queen of the Full Moon', 'Elden Remembrance': 'Radagon of the Golden Order',
  'Greatsword of Solitude': 'Knight of the Solitary Gaol', 'Solitude Set': 'Knight of the Solitary Gaol', "Gargoyle's Twinblade": 'Valiant Gargoyle (Twinblade)', 'Golden Scarab': 'Cleanrot Knight Duo (Abandoned Cave)',
  'Ruins Greatsword': 'Crucible Knight / Misbegotten Warrior', "Somberstone Miner's Bell Bearing [2]": 'Crystalians (Altus Tunnel)', 'Banished Knight Oleg Ashes': 'Ulcerated Tree Spirit (Limgrave)' };
const SKIP = new Set(["Haligtree Secret Medallion (Left)", "Igon's Furled Finger", "Igon's Set", "New Cross Map", "Digger's Staff", "Karolos Glintstone Crown", "Twinsage Glintstone Crown", "Omenkiller Set (No Helm)", "Tower of Shadow Message - Belurat Tower Settlement"]);
const bosses = L.map((m, i) => i).filter(i => L[i][3] === 'Bosses'), drops = {}, rows = [];
L.forEach((m, i) => { if (MK.cats[m[3]].kind !== 'g' || ['Bosses', 'NPCs', 'NPC Invaders'].includes(m[3])) return;
  const d = norm(m[5] || ''), man = MANUAL[m[4].replace(/<[^>]+>/g, '').trim()];
  if (SKIP.has(m[4].replace(/<[^>]+>/g, '').trim())) return;
  if (!man && (!DROP.test(d) || NOT.test(d))) return;
  let best = -1, bd = 9, how = '';
  for (const b of bosses) { if (L[b][0] !== m[0]) continue; const dist = Math.hypot(L[b][1] - m[1], L[b][2] - m[2]); if (dist > 0.02) continue;
    const h = man ? (norm(L[b][4]) === norm(man) ? 'manual' : '') : d.includes(base(L[b][4])) ? 'name' : keys(L[b][4]).some(k => d.includes(k)) ? 'key' : '';
    if (h && dist < bd) { bd = dist; best = b; how = h; } }
  if (best < 0) return; (drops[best] = drops[best] || []).push(i); rows.push(`${how}\t${m[4]} <= ${L[best][4]} | ${(m[5] || '').slice(0, 90)}`); });
MK.drops = drops; fs.writeFileSync(file, JSON.stringify(MK));
console.log(rows.length, 'boss drops on', Object.keys(drops).length, 'bosses');

// A dungeon step holds only what is inside the dungeon. Things that merely lie near its entrance on the map go to the
// overland step that passes them: the nearest step of the same map that is not a dungeon, looked for among the steps
// around it in the route first (so it stays on the way), anywhere on that map otherwise.
// Inside = the dungeon's name is in the marker's name or note, or the step's text / the place's own page names the thing.
// Also: filler sentences that point at a wiki page the app cannot open ("check the page here") are removed.
{ const rf = 'app/data/route.json', R = JSON.parse(fs.readFileSync(rf, 'utf8')), P = JSON.parse(fs.readFileSync('data/places.json', 'utf8'));
  const DUN = /\b(cave|catacombs|grave|tunnels?|hideaway|grotto|gaol|precipice|crypt|well|depths|mausoleum|pit|fissure)\b/i;
  const nm = s => base(s).replace(/\s*\[\d+\]$/, '').trim(), isDun = s => DUN.test(s.title);
  const near = (s, m) => Math.min(...[[s.x, s.y], ...s.m.map(j => [L[j][1], L[j][2]])].map(p => Math.hypot(p[0] - m[1], p[1] - m[2])));
  let moved = 0, from = 0; const lines = [];
  R.forEach((s, si) => { if (!isDun(s)) return; const t = norm(s.title), txt = norm([...s.text, ...(s.place ? [...s.place.walk, ...s.place.notes] : [])].join(' '));
    const pl = Object.values(P).find(p => norm(p.title) === t), links = new Set((pl ? pl.links : []).map(norm)), out = new Set();
    for (const i of s.n) { const m = L[i];
      const inside = norm(m[4]).includes(t) || norm(m[5] || '').includes(t) || (MK.cats[m[3]].kind === 'g' && (txt.includes(nm(m[4])) || links.has(nm(m[4])))) || (m[3] === 'Bosses' && Math.hypot(m[1] - s.x, m[2] - s.y) < 0.004);
      if (!inside) out.add(i); }
    // a boss's drops stay with their boss
    for (const b of [...s.m, ...s.n]) if (drops[b] && !out.has(b)) for (const i of drops[b]) out.delete(i);
    if (!out.size) return; from++;
    for (const i of out) { const m = L[i]; let best = -1, bd = 9;
      for (const win of [12, 1e9]) { R.forEach((x, xi) => { if (xi === si || isDun(x) || x.map !== MK.maps[m[0]] || Math.abs(xi - si) > win) return; const d = near(x, m) + (xi < 2 ? 1 : 0); if (d < bd) { bd = d; best = xi; } }); if (best >= 0 && bd < 0.06) break; }
      if (best < 0) continue; s.n = s.n.filter(k => k !== i); R[best].n.push(i); moved++; if (MK.cats[m[3]].kind === 'g') lines.push(`${s.title} -> ${R[best].title}: ${m[4]}`); } });
  const FILLER = /[^.!?]*\b(check|see|visit)\b[^.!?]{0,80}\bpage here\b[^.!?]*[.!?]?\s*/gi; let cut = 0;
  const tidy = a => a.map(p => { if (!/page here/i.test(p)) return p; const q = p.replace(FILLER, '').replace(/([a-z])\.([A-Z][a-z])/g, '$1. $2').replace(/\s{2,}/g, ' ').trim(); if (q !== p) cut++; return q; }).filter(p => p.length > 2);
  for (const s of R) { s.text = tidy(s.text); if (s.place) { s.place.walk = tidy(s.place.walk); s.place.notes = tidy(s.place.notes); } }
  fs.writeFileSync(rf, JSON.stringify(R)); fs.writeFileSync('data/outside-moves.txt', lines.sort().join('\n'));
  console.log(moved, 'markers that are not inside a dungeon moved out of', from, 'dungeon steps;', cut, 'paragraphs lost a "page here" sentence'); }
if (process.argv.includes('--list')) console.log(rows.sort().join('\n'));
