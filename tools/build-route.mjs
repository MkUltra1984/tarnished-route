// Builds the app's data from the parsed wiki walkthroughs, the wiki's own page for every place, and the map markers.
//   app/data/route.json   : ordered steps (one place per step) with their markers
//   app/data/markers.json : every marker (compact), for the Bosses / Collection / Quests tabs and "show all"
//   data/route-report.txt : coherence report (coverage, duplicates, long jumps), for checking the route
//
// How the route is put together:
//  1. Order comes from the wiki's 100% walkthrough sections. Speed-run blocks, item lists and other noise are dropped.
//  2. A section named after a place uses that place's own wiki page as its detailed text.
//  3. Every other place a section sends you to (a cave, a ruin, a catacomb...) becomes its own step right after it,
//     with the full walkthrough from the place's own page, and takes the objectives that page lists.
//  4. Sections that only talk (no place, nothing to collect) are folded into the step before them, so no text is lost.
//  5. Places the walkthrough never mentions are added after the nearest step on the same map.
//  6. Every remaining marker goes to the nearest step on its map. Nothing is left without a step.
// Usage: node tools/build-route.mjs
import fs from 'node:fs';

const MAPS = ['overland', 'underground', 'ashen', 'shadow'];
const CAT = { // wiki category -> [symbol file, singular label, kind]   kind: g = objective, x = material, p = place
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
const NOISE = /^notes$|^enemies$|general information|creatures|all items|^items found|all legacy dungeons|^.{0,40}\bbosses$|^npcs?$|^items$|video|trophy|^maps?$/i;
const HEADER = /walkthrough\s*-\s*(.+)$/i;
const SPEEDRUN = new Set(['Entry to Cliffside', 'Cliffside to Rampart Tower', 'Rampart Towers to Liftside Chamber', 'Liftside Chamber to the Courtyard and Godrick', 'After Godrick', 'East Capital Rampart to Avenue Balcony', 'West Capital Rampart to Spectral Godfrey', 'Erdtree Sanctuary to Morgott']);
const clean = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const tidy = t => t.replace(/^[^.]*Click on the image above to enlarge it\.\s*/i, '').replace(/(You can )?click HERE for the map'?s coordinates\.?\s*/gi, '')
  .replace(/\[\s*(Elden Ring )?Map (Coordinates|Link)[^\]]*\]/gi, '').replace(/\[\s*Map\s*\]/gi, '').replace(/\(\s*\)/g, '').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
const norm = s => clean(s).toLowerCase().replace(/[’`]/g, "'").trim();
const bare = s => s.replace(/\s*\([^)]*\)\s*$/, '').trim();
const slugOf = href => decodeURIComponent(href.replace(/^\//, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const readJson = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d;
const WALKIMG = readJson('data/walk-images.json', {}), PLACES = readJson('data/places.json', {});
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const med = a => { const v = [...a].sort((p, q) => p - q); return v[v.length >> 1]; };

// ---- markers ----
const all = new Map(), byName = new Map();
for (const m of MAPS) for (const k of JSON.parse(fs.readFileSync(`data/map-${m}.json`, 'utf8')).markers) {
  const c = CAT[k.cat]; if (!c) continue;
  const mk = { key: `${m}:${k.id}`, map: m, x: k.x, y: k.y, cat: k.cat, f: c[0], kind: c[2], title: clean(k.title), desc: clean(k.desc) };
  all.set(mk.key, mk);
  for (const n of new Set([norm(mk.title), norm(bare(mk.title))])) { if (!byName.has(n)) byName.set(n, []); byName.get(n).push(mk); }
}
const mapsOf = game => game === 'base' ? (mp => mp !== 'shadow') : (mp => mp === 'shadow');

// pictures are matched to sections by title; a title used twice hands out its picture sets in page order
const IMGQ = {}; for (const g of Object.keys(WALKIMG)) { IMGQ[g] = {}; for (const [k, v] of Object.entries(WALKIMG[g])) (IMGQ[g][k.slice(k.indexOf('|') + 1)] ||= []).push(v); }
const takeImgs = (g, title) => { const q = (IMGQ[g] || {})[title]; return q && q.length ? (q.length > 1 ? q.shift() : q[0]) : []; };

// ---- steps ----
const steps = [], claimed = new Set(), usedPlace = new Set(), log = [];
const claim = k => { claimed.add(k); return k; };
// the map marker that is this place
function pinOf(place, game) {
  const ok = mapsOf(game), c = (byName.get(norm(place.title)) || []).filter(m => m.cat === 'Locations' && !claimed.has(m.key));
  const rank = m => MAPS.indexOf(m.map);                                   // the surface map first: caves and ruins are entered from it
  return c.filter(m => ok(m.map)).sort((a, b) => rank(a) - rank(b))[0] || (game === 'dlc' ? null : c[0]) || null;
}
// everything the place's own page lists (items, characters, bosses) that sits at the place on the map
function itemsOf(place, pin) {
  const got = [];
  for (const name of place.links) for (const m of byName.get(norm(name)) || []) {
    if (m.map !== pin.map || claimed.has(m.key) || m.key === pin.key) continue;
    if (dist(m, pin) <= (m.kind === 'x' ? 0.012 : 0.02)) got.push(claim(m.key));
  }
  return got;
}
const placeText = p => p.walk.map(tidy).filter(Boolean);
function placeStep(p, pin, game, region, extra) {
  usedPlace.add(p.slug);
  const m = [claim(pin.key), ...itemsOf(p, pin)], notes = p.notes.map(tidy).filter(Boolean);
  return { game, region, title: p.title, map: pin.map, text: placeText(p), miss: null, m, pin: pin.key, imgs: p.img ? [p.img] : [], place: notes.length ? { title: p.title, walk: [], notes, img: null } : null, src: extra ? 'map' : 'place' };
}
for (const [slug, p] of Object.entries(PLACES)) { p.slug = slug; p.links ||= []; }

// places that a section is named after belong to that section, wherever else they are mentioned first
const reserved = new Set(), exact = new Map();   // exact: place -> the section whose title is exactly that place
for (const file of ['walkthrough-base.json', 'walkthrough-dlc.json']) for (const s of readJson(`data/${file}`, [])) {
  const words = clean(s.title).toLowerCase(); if (/speed ?run/i.test(words) || NOISE.test(words)) continue;
  for (const l of s.links || []) { const p = PLACES[slugOf((l.href || '').split('#')[0])]; if (p && l.text.length > 4 && words.includes(l.text.toLowerCase())) reserved.add(p.slug); }
  const nice = clean(s.title).replace(/^Elden Ring (Shadow of the Erdtree )?(Walkthrough\s*-\s*)?/i, '').replace(/\s*Walkthrough$/i, '').trim();
  for (const p of Object.values(PLACES)) { if (p.title.length > 4 && words.includes(p.title.toLowerCase())) reserved.add(p.slug); if (norm(p.title) === norm(nice) && !exact.has(p.slug)) exact.set(p.slug, clean(s.title)); }
}

let region = 'Limgrave';
for (const [game, file] of [['base', 'walkthrough-base.json'], ['dlc', 'walkthrough-dlc.json']]) {
  let speedrun = false;
  for (const s of readJson(`data/${file}`, [])) {
    const title = clean(s.title), words = title.toLowerCase();
    const h = title.match(HEADER); if (h) region = h[1].replace(/^Things you Should do in /i, '').replace(/\s*Walkthrough$/i, '').trim();
    if (h || /walkthrough$/i.test(title)) speedrun = false;                 // a new area starts: the speed-run block is over
    // the wiki repeats each legacy dungeon as a speed run. Two of those blocks have an empty heading on the wiki, so their
    // sections are named here; the others start at a "Speed Run Walkthrough" section and end at the next dungeon summary.
    if (/general information/i.test(title)) speedrun = false;
    if (/speed ?run/i.test(title)) { speedrun = true; log.push(`dropped: ${title}`); continue; }
    if (SPEEDRUN.has(title)) { log.push(`dropped (speed run): ${title}`); continue; }
    if (speedrun || NOISE.test(title)) { log.push(`dropped: ${title}`); continue; }
    const paras = (s.text || []).map(clean).filter(t => t && !/click on the image|^\W*$/i.test(t.slice(0, 80)) || t.length > 200).map(tidy).filter(t => t.length > 2);

    // places this section sends you to
    const cand = [];
    for (const l of s.links || []) {
      const p = PLACES[slugOf((l.href || '').split('#')[0])]; if (!p || usedPlace.has(p.slug) || cand.some(c => c.p === p)) continue;
      cand.push({ p, named: l.text.length > 4 && words.includes(l.text.toLowerCase()) });
    }
    const niceTitle = title.replace(/^Elden Ring (Shadow of the Erdtree )?(Walkthrough\s*-\s*)?/i, '').replace(/\s*Walkthrough$/i, '').trim() || title;
    // the place this section is about: by exact title, by a link it is named after, or by a place name inside its title
    // (a place that has a section of its very own is kept for that section: "The Student of Raya Lucaria Academy" is not the Academy)
    const mayOwn = p => !usedPlace.has(p.slug) && (!exact.has(p.slug) || exact.get(p.slug) === title);
    const inTitle = Object.values(PLACES).filter(p => mayOwn(p) && p.title.length > 4 && words.includes(p.title.toLowerCase())).sort((a, b) => b.title.length - a.title.length)[0];
    const primary = (cand.find(c => norm(c.p.title) === norm(niceTitle)) || cand.find(c => c.named && mayOwn(c.p)) || {}).p || inTitle || null;
    const subs = [];

    // what the section itself names: one marker per name, the one nearest to where the section happens
    const ok = mapsOf(game);
    let hits = (s.markers || []).map(l => l.hits.map(x => all.get(`${x.map}:${x.id}`)).filter(Boolean)).filter(a => a.length);
    const anyOk = hits.flat().some(x => ok(x.map)); if (anyOk || game === 'base') hits = hits.map(a => a.filter(x => ok(x.map))).filter(a => a.length);
    const free = hits.map(a => a.filter(x => !claimed.has(x.key))).filter(a => a.length);
    let mine = [], map = null, pin = null;
    const ppin = primary ? pinOf(primary, game) : null;
    if (free.length || ppin) {
      const count = {}; free.flat().forEach(x => count[x.map] = (count[x.map] || 0) + 1);
      map = ppin ? ppin.map : Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
      // names that exist in several spots: the walkthrough carries on from where the last step was, so take the nearest
      const last = [...steps].reverse().find(st => st.map === map && st.src === 'walk'), L = last ? all.get(last.pin) : null;
      const pick = a => { const c = a.filter(x => x.map === map); return c.length < 2 || !L ? c[0] : c.sort((p, q) => dist(p, L) - dist(q, L))[0]; };
      const pool = free.map(pick).filter(Boolean);
      const A = ppin ? { x: ppin.x, y: ppin.y } : { x: med(pool.map(p => p.x)), y: med(pool.map(p => p.y)) };
      // other places this section sends you to get their own step, but only when they are actually around here
      // (a place that is merely mentioned, or that a later section is named after, waits for its turn)
      for (const c of cand) {
        if (c.p === primary || !c.p.walk.length || reserved.has(c.p.slug)) continue;
        const qp = pinOf(c.p, game); if (qp && qp.map === map && dist(qp, A) < 0.06) subs.push(placeStep(c.p, qp, game, region));
      }
      for (const a of free) {
        const c = a.filter(x => x.map === map && !claimed.has(x.key)).sort((p, q) => dist(p, A) - dist(q, A))[0];
        if (!c || dist(c, A) > (c.kind === 'x' ? 0.02 : 0.12)) continue;      // a far-away namesake is not this place
        mine.push(claim(c.key));
      }
      // places the text only mentions in passing sit far from where the step happens: give them back
      const named = k => { const n = bare(all.get(k).title).toLowerCase(); return n.length > 4 && words.includes(n); };
      const core = mine.map(k => all.get(k)).filter(p => p.kind !== 'p'), ref = core.length ? core : mine.map(k => all.get(k));
      const C = ppin ? A : ref.length ? { x: med(ref.map(p => p.x)), y: med(ref.map(p => p.y)) } : A;
      for (let i = mine.length - 1; i >= 0; i--) { const p = all.get(mine[i]); if (p.kind === 'p' && !named(mine[i]) && dist(p, C) > 0.02) { claimed.delete(mine[i]); mine.splice(i, 1); } }
      if (ppin) { mine = [claim(ppin.key), ...mine.filter(k => k !== ppin.key), ...itemsOf(primary, ppin)]; pin = ppin.key; }
      else if (mine.length) pin = mine.find(named) || [...mine].sort((a, b) => dist(all.get(a), C) - dist(all.get(b), C))[0];
    }
    if (primary) usedPlace.add(primary.slug);
    if (mine.length) {
      // the place page often repeats the section's paragraphs word for word: keep only what is new
      let place = null;
      if (primary) {
        const key = t => t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70), have = new Set(paras.map(key));
        let walk = placeText(primary).filter(p => !have.has(key(p))); walk = walk.filter((p, i) => !(p.startsWith('## ') && (walk[i + 1] || '## ').startsWith('## ')));
        const notes = primary.notes.map(tidy).filter(Boolean);
        if (walk.some(p => !p.startsWith('## ')) || notes.length || primary.img) place = { title: primary.title, walk, notes, img: primary.img };
      }
      steps.push({ game, region, title: niceTitle, map, text: paras, miss: null, m: mine, pin, imgs: takeImgs(game, s.title), place, src: 'walk' });
    } else if (paras.length && steps.length && steps[steps.length - 1].game === game) {
      // nothing to pin on the map: keep the text with the step it follows
      const prev = steps[steps.length - 1]; prev.text.push('## ' + niceTitle, ...paras); if (primary) prev.text.push(...placeText(primary), ...primary.notes.map(tidy).filter(Boolean)); prev.imgs.push(...takeImgs(game, s.title)); log.push(`folded into "${prev.title}": ${title}`);
    } else if (paras.length) log.push(`no place for: ${title}`);
    steps.push(...subs);
  }
}

const pinXY = st => all.get(st.pin);
// ---- a section that seems to leave the area and come straight back was pinned on a namesake somewhere else ----
// (rooms of one dungeon: "Courtyard", "Guest Hall", "Underground Crypt"...). It is a continuation of the step before
// it: its text stays there, and its far-away markers are released to find their real step.
let folded = 0;
for (let i = 1; i < steps.length; i++) {
  const a = steps[i - 1], b = steps[i], c = steps[i + 1];
  if (b.src !== 'walk' || b.place || a.map !== b.map) continue;
  const away = dist(pinXY(a), pinXY(b)), back = c && c.map === a.map ? dist(pinXY(a), pinXY(c)) : null;
  if ((away > 0.18 && back != null && back < 0.09) || (away > 0.3 && b.m.length <= 3)) {
    a.text.push('## ' + b.title, ...b.text); a.imgs.push(...b.imgs);
    for (const k of b.m) { if (dist(all.get(k), pinXY(a)) < 0.06) a.m.push(k); else claimed.delete(k); }
    log.push(`folded into "${a.title}" (was pinned ${Math.round(away * 8192)} px away): ${b.title}`); steps.splice(i, 1); i--; folded++;
  }
}

// ---- places the walkthrough never mentions: after the nearest step on the same map ----
const extras = [];
const isPin = new Set(steps.map(s => s.pin));
const placeByTitle = new Map(Object.values(PLACES).map(p => [norm(p.title), p]));
for (const mk of all.values()) {
  if (mk.cat !== 'Locations' || isPin.has(mk.key)) continue;
  const p = PLACES[slugOf('/' + encodeURIComponent(bare(mk.title)))] || placeByTitle.get(norm(bare(mk.title))); if (!p || usedPlace.has(p.slug) || !p.walk.length) continue;
  // a step only mentioned this place in passing: it gets its own step instead
  if (claimed.has(mk.key)) for (const st of steps) { const i = st.m.indexOf(mk.key); if (i >= 0 && st.m.length > 1) st.m.splice(i, 1); }
  if (steps.some(st => st.m.includes(mk.key))) continue;
  let best = null, bd = 9; for (const st of steps) { if (st.map !== mk.map) continue; const d = dist(pinXY(st), mk); if (d < bd) { bd = d; best = st; } }
  if (!best) continue;
  extras.push([best, placeStep(p, mk, mk.map === 'shadow' ? 'dlc' : 'base', best.region, true)]);
}
for (const [after, st] of extras) { let at = steps.indexOf(after) + 1; while (at < steps.length && steps[at].src === 'map') at++; steps.splice(at, 0, st); }

// ---- every remaining marker goes to the step that has something closest to it ----
// ---- the same paragraph is shown once: a place page often repeats what the walkthrough section already said ----
const pkey = t => t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60), shown = new Map();
for (let i = 0; i < steps.length; i++) {
  const st = steps[i], firstHome = st.text.map(p => p.length > 60 ? shown.get(pkey(p)) : undefined).find(x => x !== undefined);
  st.text = st.text.filter(p => p.startsWith('## ') || p.length <= 60 || !shown.has(pkey(p)));
  st.text = st.text.filter((p, j) => !(p.startsWith('## ') && (st.text[j + 1] || '## ').startsWith('## ')));
  if (st.place) st.place.walk = st.place.walk.filter(p => p.startsWith('## ') || p.length <= 60 || !shown.has(pkey(p)));
  if (!st.text.some(p => !p.startsWith('## ')) && firstHome) {      // everything it had to say is already in another step: it is that step
    firstHome.m.push(...st.m.filter(k => !firstHome.m.includes(k)));
    if (st.place) { const extra = [...st.place.walk, ...st.place.notes].filter(p => p.startsWith('## ') || !shown.has(pkey(p))); if (extra.some(p => !p.startsWith('## '))) { firstHome.text.push('## ' + st.place.title, ...extra); extra.forEach(p => shown.set(pkey(p), firstHome)); } }
    log.push(`merged into "${firstHome.title}" (same text): ${st.title}`); steps.splice(i, 1); i--; continue;
  }
  for (const p of [...st.text, ...(st.place ? st.place.walk : [])]) if (p.length > 60 && !shown.has(pkey(p))) shown.set(pkey(p), st);
}
// ---- one marker, one step: where it is the pin, else the first step that named it ----
const owner = new Map(); for (const st of steps) owner.set(st.pin, st);
for (const st of steps) st.m = st.m.filter(k => { if (!owner.has(k)) owner.set(k, st); return owner.get(k) === st; });
for (const k of owner.keys()) claimed.add(k);

// ---- every remaining marker: to a nearby step whose text talks about it, otherwise to the step that has something closest ----
let attached = 0, byText = 0, orphan = 0;
const pts = steps.map(st => st.m.map(k => all.get(k)));
const lower = steps.map(st => [...st.text, ...(st.place ? [...st.place.walk, ...st.place.notes] : [])].join(' ').toLowerCase());
for (const mk of all.values()) {
  if (owner.has(mk.key)) continue;
  const nm = bare(mk.title).toLowerCase(); let best = -1, bd = 9, tbest = -1, td = 9;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].map !== mk.map) continue; let d = 9; for (const p of pts[i]) d = Math.min(d, dist(p, mk));
    if (d < bd) { bd = d; best = i; }
    if (mk.kind === 'g' && nm.length >= 5 && d < 0.08 && d < td && lower[i].includes(nm)) { td = d; tbest = i; }
  }
  if (best < 0) { orphan++; continue; }
  if (tbest >= 0 && tbest !== best) byText++;
  (steps[tbest >= 0 ? tbest : best].n ||= []).push(mk.key); attached++;
}

// ---- lists follow the text: an objective sits in the step whose text names it, when that step is close by ----
let moved = 0;
{
  const P = steps.map(st => [...st.m, ...(st.n || [])].map(k => all.get(k))), home = new Map();
  steps.forEach((st, i) => [...st.m, ...(st.n || [])].forEach(k => home.set(k, i)));
  for (const [k, i] of home) {
    const mk = all.get(k); if (mk.kind !== 'g' || steps[i].pin === k) continue;
    const nm = bare(mk.title).toLowerCase(); if (nm.length < 5 || lower[i].includes(nm)) continue;
    let best = -1, bd = 0.08;
    for (let j = 0; j < steps.length; j++) { if (j === i || steps[j].map !== mk.map || !lower[j].includes(nm)) continue; let d = 9; for (const p of P[j]) d = Math.min(d, dist(p, mk)); if (d < bd) { bd = d; best = j; } }
    if (best < 0) continue;
    steps[i].m = steps[i].m.filter(x => x !== k); if (steps[i].n) steps[i].n = steps[i].n.filter(x => x !== k);
    (steps[best].n ||= []).push(k); moved++;
  }
}

// ---- write ----
const order = [...all.values()], idx = new Map(order.map((m, i) => [m.key, i])), ids = new Set();
const outSteps = steps.map(st => {
  const P = st.m.map(k => all.get(k)), place = all.get(st.pin);
  let id = `${st.game}:${st.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}:${st.pin}`; while (ids.has(id)) id += '+'; ids.add(id);   // stable across rebuilds, so saved progress survives
  return { id, game: st.game, region: st.region, title: st.title, map: st.map, x: +place.x.toFixed(5), y: +place.y.toFixed(5), text: st.text, miss: null, boss: P.some(p => p.cat === 'Bosses'),
    m: st.m.map(k => idx.get(k)), n: (st.n || []).map(k => idx.get(k)), imgs: st.imgs, place: st.place };
});
fs.mkdirSync('app/data', { recursive: true });
fs.writeFileSync('app/data/route.json', JSON.stringify(outSteps));
fs.writeFileSync('app/data/markers.json', JSON.stringify({ cats: Object.fromEntries(Object.entries(CAT).map(([k, v]) => [k, { f: v[0], label: v[1], kind: v[2] }])), maps: MAPS, list: order.map(m => [MAPS.indexOf(m.map), +m.x.toFixed(5), +m.y.toFixed(5), m.cat, m.title, m.desc]) }));

// ---- coherence report ----
const R = [], kb = f => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
const bySrc = k => steps.filter(s => s.src === k).length;
R.push(`${steps.length} steps: ${bySrc('walk')} from walkthrough sections, ${bySrc('place')} places with their own page, ${bySrc('map')} places the walkthrough never mentions`);
R.push(`${all.size} markers: ${claimed.size} named by a step, ${attached} attached to the nearest step, ${orphan} without a step`);
const locs = [...all.values()].filter(m => m.cat === 'Locations'), pinned = new Set(steps.map(s => s.pin));
R.push(`map locations: ${locs.length}; ${locs.filter(m => pinned.has(m.key)).length} have their own step, ${locs.filter(m => claimed.has(m.key) && !pinned.has(m.key)).length} are named inside another step, ${locs.filter(m => !claimed.has(m.key)).length} only attached to the nearest step`);
R.push(`place pages: ${Object.keys(PLACES).length}; used ${usedPlace.size}; with a walkthrough but unused: ${Object.values(PLACES).filter(p => p.walk.length && !usedPlace.has(p.slug)).map(p => p.title).join(', ') || 'none'}`);
R.push(`steps without text: ${steps.filter(s => !s.text.length).map(s => s.title).join(', ') || 'none'}`);
const seen = {}; steps.forEach(s => (seen[s.title] ||= []).push(s)); R.push(`titles used twice: ${Object.entries(seen).filter(e => e[1].length > 1).map(e => e[0]).join(', ') || 'none'}`);
const grabCount = st => [...st.m, ...(st.n || [])].filter(k => all.get(k).kind === 'g').length;
R.push(`steps with no objective: ${steps.filter(s => !grabCount(s)).length}; largest step: ${Math.max(...steps.map(grabCount))} objectives`);
const jumps = []; for (let i = 1; i < steps.length; i++) if (steps[i].map === steps[i - 1].map) { const d = dist(pinXY(steps[i]), pinXY(steps[i - 1])) * 8192; if (d > 1500) jumps.push(`${Math.round(d)} px: ${steps[i - 1].title} -> ${steps[i].title}`); }
R.push(`jumps over 1500 px between consecutive steps: ${jumps.length}`, ...jumps.map(j => '  ' + j));
const head = R.length;
R.push('', '--- order ---', ...steps.map((s, i) => `${i + 1}. [${s.src}] ${s.region} / ${s.title} (${s.map}, ${grabCount(s)} objectives)`), '', '--- sections not turned into steps ---', ...log);
fs.writeFileSync('data/route-report.txt', R.join('\n'));
console.log(R.slice(0, head).join('\n'));
console.log('route.json', kb('app/data/route.json'), 'markers.json', kb('app/data/markers.json'));
