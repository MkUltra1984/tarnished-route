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
if (process.argv.includes('--list')) console.log(rows.sort().join('\n'));
