// Builds the app's data from the parsed wiki walkthroughs and map markers.
//   app/data/route.json   : ordered steps (one place per step) with their markers
//   app/data/markers.json : every marker (compact), for the Bosses / Collection / Quests tabs and "show all"
// Rules: steps come from walkthrough sections in wiki order; noise sections are dropped; every marker the
// walkthrough does not mention is attached to the nearest step on the same map.
// Usage: node tools/build-route.mjs
import fs from 'node:fs';

const MAPS = ['overland', 'underground', 'ashen', 'shadow'];
const CAT = { // wiki category -> [symbol file, singular label, kind]   kind: g = grab (100% list), x = extra, p = place
  'Bosses': ['boss', 'Boss', 'g'], 'NPC Invaders': ['invader', 'Invader', 'g'], 'NPCs': ['npc', 'NPC', 'g'],
  'Armor': ['armor', 'Armor', 'g'], 'Ashes of War': ['ashofwar', 'Ash of War', 'g'], 'Shields': ['shield', 'Shield', 'g'],
  'Spells': ['spell', 'Spell', 'g'], 'Spirit Ashes': ['spiritash', 'Spirit Ash', 'g'], 'Talismans': ['talisman', 'Talisman', 'g'],
  'Weapons': ['weapon', 'Weapon', 'g'], 'Key Items': ['key', 'Key Item', 'g'], 'Flask Upgrades': ['flask', 'Flask Upgrade', 'g'],
  'Remembrances': ['remembrance', 'Remembrance', 'g'], 'Scadutree Fragments': ['scadu', 'Scadutree Fragment', 'g'],
  'Maps': ['map', 'Map Fragment', 'g'], "Miquella's Cross": ['cross', "Miquella's Cross", 'g'],
  'Consumables': ['consumable', 'Consumable', 'x'], 'Crafting Materials': ['crafting', 'Crafting Material', 'x'], 'Upgrade Materials': ['upgrade', 'Upgrade Material', 'x'],
  'Sites of Grace': ['grace', 'Site of Grace', 'p'], 'Locations': ['location', 'Location', 'p'], 'Spiritsprings': ['spiritspring', 'Spiritspring', 'p'],
  'Summoning Pools': ['pool', 'Summoning Pool', 'p'], 'Waygates': ['waygate', 'Waygate', 'p'],
};
const NOISE = /speed ?run|^notes$|^enemies$|general information|creatures|all items|all legacy dungeons|^.{0,40}\bbosses$|^npcs?$|^items$|video|trophy|^maps?$/i;
const HEADER = /walkthrough\s*-\s*(.+)$/i;

// ---- markers ----
const all = new Map(); // "map:id" -> marker
for (const m of MAPS) for (const k of JSON.parse(fs.readFileSync(`data/map-${m}.json`, 'utf8')).markers) {
  const c = CAT[k.cat]; if (!c) continue;
  all.set(`${m}:${k.id}`, { key: `${m}:${k.id}`, map: m, x: k.x, y: k.y, cat: k.cat, f: c[0], kind: c[2], title: clean(k.title), desc: clean(k.desc) });
}
function clean(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
// wiki prose leftovers: picture captions, "click here" lines and empty map-link brackets
function tidy(t) {
  return t.replace(/^[^.]*Click on the image above to enlarge it\.\s*/i, '').replace(/(You can )?click HERE for the map'?s coordinates\.?\s*/gi, '')
    .replace(/\[\s*(Elden Ring )?Map (Coordinates|Link)[^\]]*\]/gi, '').replace(/\[\s*Map\s*\]/gi, '').replace(/\(\s*\)/g, '').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
const readJson = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d;
const WALKIMG = readJson('data/walk-images.json', {}), PLACES = readJson('data/places.json', {});

// pictures are matched to sections by title; a title used twice hands out its picture sets in page order
const IMGQ = {}; for (const g of Object.keys(WALKIMG)) { IMGQ[g] = {}; for (const [k, v] of Object.entries(WALKIMG[g])) (IMGQ[g][k.slice(k.indexOf('|') + 1)] ||= []).push(v); }
const takeImgs = (g, title) => { const q = (IMGQ[g] || {})[title]; return q && q.length ? (q.length > 1 ? q.shift() : q[0]) : []; };

// ---- steps from sections ----
const steps = []; const claimed = new Set();
let region = 'Limgrave';
for (const [game, file] of [['base', 'walkthrough-base.json'], ['dlc', 'walkthrough-dlc.json']]) {
  for (const s of JSON.parse(fs.readFileSync(`data/${file}`, 'utf8'))) {
    const title = clean(s.title);
    const h = title.match(HEADER); if (h) region = h[1].replace(/^Things you Should do in /i, '').replace(/\s*Walkthrough$/i, '').trim();
    if (NOISE.test(title)) continue;
    // choose one hit per link: the one nearest to the section's anchor (median of unambiguous hits on the dominant map)
    const hits = (s.markers || []).map(l => l.hits.filter(x => all.has(`${x.map}:${x.id}`))).filter(a => a.length);
    if (!hits.length) continue;
    const count = {}; hits.flat().forEach(x => count[x.map] = (count[x.map] || 0) + 1);
    const map = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
    const sure = hits.filter(a => a.length === 1 && a[0].map === map).map(a => a[0]);
    const pool = sure.length ? sure : hits.flat().filter(x => x.map === map);
    const med = a => { const v = [...a].sort((p, q) => p - q); return v[v.length >> 1]; };
    const ax = med(pool.map(p => p.x)), ay = med(pool.map(p => p.y));
    const mine = [];
    for (const a of hits) {
      const c = a.filter(x => x.map === map && !claimed.has(`${x.map}:${x.id}`)).sort((p, q) => Math.hypot(p.x - ax, p.y - ay) - Math.hypot(q.x - ax, q.y - ay))[0];
      // a far-away namesake is not this place; materials share names all over the map, so they must be close by
      if (!c || Math.hypot(c.x - ax, c.y - ay) > (CAT[c.cat][2] === 'x' ? 0.02 : 0.12)) continue;
      claimed.add(`${c.map}:${c.id}`); mine.push(`${c.map}:${c.id}`);
    }
    // places (graces, locations) that the text only mentions in passing sit far from where the step happens: drop them,
    // unless the step is named after them
    const words = title.toLowerCase(), named = k => { const n = all.get(k).title.toLowerCase().replace(/\s*\(.*\)$/, ''); return n.length > 4 && words.includes(n); };
    const core = mine.map(k => all.get(k)).filter(p => p.kind !== 'p'), ref = core.length ? core : mine.map(k => all.get(k));
    const cx = med(ref.map(p => p.x)), cy = med(ref.map(p => p.y));
    for (let i = mine.length - 1; i >= 0; i--) { const p = all.get(mine[i]); if (p.kind === 'p' && !named(mine[i]) && Math.hypot(p.x - cx, p.y - cy) > 0.02) { claimed.delete(mine[i]); mine.splice(i, 1); } }
    if (!mine.length) continue;
    const pin = mine.find(named) || [...mine].sort((a, b) => Math.hypot(all.get(a).x - cx, all.get(a).y - cy) - Math.hypot(all.get(b).x - cx, all.get(b).y - cy))[0];
    const paras = (s.text || []).map(clean).filter(t => t && !/click on the image|^\W*$/i.test(t.slice(0, 80)) || t.length > 200).map(tidy).filter(t => t.length > 2);
    // a warning is only shown when the wiki text itself says something can be lost for good
    const sentences = paras.join(' ').match(/[^.!?]+[.!?]+(\s|$)/g) || [];
    const miss = sentences.find(x => x.length < 320 && /\bmissable\b|point of no return|no longer be (available|obtain|access)|permanently (lost|miss|lock)|cannot be obtained (later|after)|will be lost forever|lock(s|ed)? you out of/i.test(x));
    // pictures of this section, and the wiki's own page about the place (detailed walkthrough, notes, location picture)
    const imgs = takeImgs(game, s.title);
    let place = null;
    for (const l of s.links || []) {
      const href = (l.href || '').split('#')[0], p = PLACES[href]; if (!p || (!p.walk.length && !p.notes.length && !p.img)) continue;
      const isNamed = l.text.length > 4 && words.includes(l.text.toLowerCase()), isHere = (l.m || []).some(k => mine.includes(k) && all.get(k).cat === 'Locations');
      if (isNamed) { place = p; break; }
      if (isHere && !place) place = p;
    }
    steps.push({ game, region, title: title.replace(/^Elden Ring (Shadow of the Erdtree )?(Walkthrough\s*-\s*)?/i, '').replace(/\s*Walkthrough$/i, '').trim() || title, map, text: paras, miss: miss ? miss.trim() : null, m: mine, pin, imgs, place });
  }
}

// ---- place every unclaimed marker on the nearest step of the same map ----
const center = st => { const p = st.m.map(k => all.get(k)); return [p.reduce((a, b) => a + b.x, 0) / p.length, p.reduce((a, b) => a + b.y, 0) / p.length]; };
const byMap = {}; steps.forEach((st, i) => { (byMap[st.map] ||= []).push([i, ...center(st)]); });
let attached = 0, orphan = 0;
for (const mk of all.values()) {
  if (claimed.has(mk.key)) continue;
  const c = byMap[mk.map]; if (!c) { orphan++; continue; }
  let best = c[0], bd = 9; for (const e of c) { const d = Math.hypot(e[1] - mk.x, e[2] - mk.y); if (d < bd) { bd = d; best = e; } }
  (steps[best[0]].n ||= []).push(mk.key); attached++;
}

// the place page often repeats the overview's paragraphs word for word: keep only what is new
function placeOut(st) {
  if (!st.place) return null;
  const key = s => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70), have = new Set(st.text.map(key));
  const walk = st.place.walk.map(tidy).filter(p => p && !have.has(key(p))), notes = st.place.notes.map(tidy).filter(Boolean);
  while (walk.length && walk[walk.length - 1].startsWith('## ')) walk.pop();
  if (!walk.filter(p => !p.startsWith('## ')).length && !notes.length && !st.place.img) return null;
  return { title: st.place.title.replace(/\s*\|.*$/, '').trim(), walk: walk.filter((p, i) => !(p.startsWith('## ') && (walk[i + 1] || '## ').startsWith('## '))), notes, img: st.place.img };
}

// ---- write ----
const order = [...all.values()]; const idx = new Map(order.map((m, i) => [m.key, i]));
const outSteps = steps.map((st, i) => {
  const pts = st.m.map(k => all.get(k)), place = all.get(st.pin);
  return { id: i, game: st.game, region: st.region, title: st.title, map: st.map, x: +place.x.toFixed(5), y: +place.y.toFixed(5), text: st.text, miss: st.miss, boss: pts.some(p => p.cat === 'Bosses'), m: st.m.map(k => idx.get(k)), n: (st.n || []).map(k => idx.get(k)),
    imgs: st.imgs, place: placeOut(st) };
});
fs.mkdirSync('app/data', { recursive: true });
fs.writeFileSync('app/data/route.json', JSON.stringify(outSteps));
fs.writeFileSync('app/data/markers.json', JSON.stringify({ cats: Object.fromEntries(Object.entries(CAT).map(([k, v]) => [k, { f: v[0], label: v[1], kind: v[2] }])), maps: MAPS, list: order.map(m => [MAPS.indexOf(m.map), +m.x.toFixed(5), +m.y.toFixed(5), m.cat, m.title, m.desc]) }));
const kb = f => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`${outSteps.length} steps (${outSteps.filter(s => s.game === 'dlc').length} DLC), ${all.size} markers: ${claimed.size} named in the walkthrough, ${attached} attached to the nearest step, ${orphan} without a step`);
console.log('route.json', kb('app/data/route.json'), 'markers.json', kb('app/data/markers.json'));
console.log('steps per map', JSON.stringify(Object.fromEntries(Object.entries(byMap).map(([k, v]) => [k, v.length]))));
const sizes = outSteps.map(s => s.m.length + s.n.length).sort((a, b) => b - a); console.log('markers per step: max', sizes[0], 'median', sizes[sizes.length >> 1]);
console.log('with missable line:', outSteps.filter(s => s.miss).length, '| regions:', [...new Set(outSteps.map(s => s.region))].length);
console.log(outSteps.slice(0, 12).map(s => `${s.id} [${s.region}] ${s.title} (${s.m.length}+${s.n.length})`).join('\n'));
