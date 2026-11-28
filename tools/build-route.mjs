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
import { ENTRY, SPECIAL, canonRegion } from './regions.mjs';

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
const NOISE = /^notes$|^enemies$|general information|creatures|all items|^items found|all legacy dungeons|^.{0,40}\bbosses$|^npcs?$|^items$|video|trophy|^maps?$|follow us on socials/i;
const HEADER = /walkthrough\s*-\s*(.+)$/i;
const SPEEDRUN = new Set(['Entry to Cliffside', 'Cliffside to Rampart Tower', 'Rampart Towers to Liftside Chamber', 'Liftside Chamber to the Courtyard and Godrick', 'East Capital Rampart to Avenue Balcony', 'Avenue Balcony to West Capital Rampart', 'West Capital Rampart to Spectral Godfrey', 'Erdtree Sanctuary to Morgott']);
const clean = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const tidy = t => t.replace(/^[^.]*Click on the image above to enlarge it\.\s*/i, '').replace(/(You can )?click HERE for the map'?s coordinates\.?\s*/gi, '')
  .replace(/\[\s*(Elden Ring )?Map (Coordinates|Link)[^\]]*\]/gi, '').replace(/\[\s*Map\s*\]/gi, '').replace(/\(\s*(Elden Ring )?(Interactive )?Map (Coordinates|Link)[^)]*\)/gi, '').replace(/(Elden Ring )?(Interactive )?Map (Coordinates|Link)( Here| for [^.)]{0,40})?\.?/gi, '').replace(/,?\s*\(?\s*(you can |please )?click here\b\s*\)?/gi, '').replace(/\(\s*\)/g, '').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
const norm = s => clean(s).toLowerCase().replace(/[‘’`]/g, "'").trim();
// a marker's plain name: without "(First Location)", "[2]", " - Crumbling Farum Azula" and the like, so it can be found in the text
const bare = s => { let t = s.replace(/[‘’]/g, "'"), p; do { p = t; t = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[\d+\]\s*$/, '').replace(/\s+-\s+.*$/, '').trim(); } while (t !== p && t); return t || p; };
const slugOf = href => decodeURIComponent(href.replace(/^\//, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const readJson = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d;
const WALKIMG = readJson('data/walk-images.json', {}), PLACES = readJson('data/places.json', {});
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TRACE = process.env.TRACE, trace = (mk, why, st) => { if (TRACE && mk.title === TRACE) console.log('TRACE', mk.title, '->', st.title, '|', why); };
const lev = (a, b) => { if (Math.abs(a.length - b.length) > 2) return 9; let p = [...Array(b.length + 1).keys()]; for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[b.length]; };
const flat = t => t.toLowerCase().replace(/[‘’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();   // "Elphael, Brace of the Haligtree" = "Elphael Brace of the Haligtree"
const sameTitle = (a, b) => a === b || (a.length >= 10 && lev(a, b) <= 2);
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
const steps = [], claimed = new Set(), usedPlace = new Set(), log = [], lists = [];
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
  if (!place) return got;
  for (const name of place.links) for (const m of byName.get(norm(name)) || []) {
    if (m.map !== pin.map || claimed.has(m.key) || m.key === pin.key) continue;
    if (dist(m, pin) <= (m.kind === 'x' ? 0.012 : 0.02)) { trace(m, 'item list of the place page', place); got.push(claim(m.key)); }
  }
  return got;
}
const placeText = p => p.walk.map(tidy).filter(Boolean);
function placeStep(p, pin, game, region, extra) {
  usedPlace.add(p.slug);
  const m = [claim(pin.key), ...itemsOf(p, pin)], notes = p.notes.map(tidy).filter(Boolean);
  return { listed: new Set(p.links.map(norm)), game, region, title: p.title, map: pin.map, text: placeText(p), miss: null, m, pin: pin.key, imgs: p.img ? [p.img] : [], place: notes.length ? { title: p.title, walk: [], notes, img: null } : null, src: extra ? 'map' : 'place' };
}
for (const [slug, p] of Object.entries(PLACES)) { if (/ wiki$/i.test(p.title) || /^elden ring$/i.test(p.title)) { delete PLACES[slug]; continue; } p.slug = slug; p.links ||= []; }   // the wiki's home page is not a place

// places that a section is named after belong to that section, wherever else they are mentioned first
const reserved = new Set(), exact = new Map();   // exact: place -> the section whose title is exactly that place
for (const file of ['walkthrough-base.json', 'walkthrough-dlc.json']) for (const s of readJson(`data/${file}`, [])) {
  const words = clean(s.title).toLowerCase(); if (/speed ?run/i.test(words) || NOISE.test(words)) continue;
  for (const l of s.links || []) { const p = PLACES[slugOf((l.href || '').split('#')[0])]; if (p && l.text.length > 4 && flat(words).includes(flat(l.text))) reserved.add(p.slug); }
  const nice = clean(s.title).replace(/^Elden Ring (Shadow of the Erdtree )?(Walkthrough\s*-\s*)?/i, '').replace(/\s*Walkthrough$/i, '').trim();
  for (const p of Object.values(PLACES)) { if (p.title.length > 4 && flat(words).includes(flat(p.title))) reserved.add(p.slug); if (flat(p.title) === flat(nice) && !exact.has(p.slug)) exact.set(p.slug, clean(s.title)); }
}

const placeByTitle = new Map(Object.values(PLACES).map(p => [norm(p.title), p]));
const paraLinks = new Map();
let region = 'Limgrave';
for (const [game, file] of [['base', 'walkthrough-base.json'], ['dlc', 'walkthrough-dlc.json']]) {
  let speedrun = false, blockStart = null, pending = null;   // pending: an area's introduction, waiting for the first step of that area
  const flush = () => { const last = steps[steps.length - 1]; if (pending && last && last.game === game) { last.text.push(...pending.text); last.imgs.push(...pending.imgs); } pending = null; };
  for (const s of readJson(`data/${file}`, [])) {
    const title = clean(s.title), words = title.toLowerCase();
    const h = title.match(HEADER); if (h) region = h[1].replace(/^Things you Should do in /i, '').replace(/\s*Walkthrough$/i, '').trim();
    if (h || /walkthrough$/i.test(title)) { speedrun = false; blockStart = { at: steps.length }; }   // a new area starts: the speed-run block is over
    // the wiki repeats each legacy dungeon as a speed run. Two of those blocks have an empty heading on the wiki, so their
    // sections are named here; the others start at a "Speed Run Walkthrough" section and end at the next dungeon summary.
    if (/general information/i.test(title)) speedrun = false;
    if (/speed ?run/i.test(title)) { speedrun = true; log.push(`dropped: ${title}`); continue; }
    if (SPEEDRUN.has(title)) { log.push(`dropped (speed run): ${title}`); continue; }
    if (speedrun || NOISE.test(title)) {
      // the area's own item / boss / character lists: not shown as steps, but they say what belongs to this area
      if (!speedrun && blockStart) lists.push({ block: blockStart, game, title, names: (s.markers || []).map(l => l.hits.map(x => all.get(`:${x.id}`)).filter(Boolean)) });
      log.push(`dropped: ${title}`); continue;
    }
    const paras = (s.text || []).map(clean).filter(t => t && !/click on the image|^\W*$/i.test(t.slice(0, 80)) || t.length > 200).map(tidy).filter(t => t.length > 2);

    { const L = new Set((s.links || []).map(l => norm(l.text))); for (const p of paras) paraLinks.set(p.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60), L); }   // what this text links to: the things it really means
    // places this section sends you to
    const cand = [];
    for (const l of s.links || []) {
      const p = PLACES[slugOf((l.href || '').split('#')[0])]; if (!p || usedPlace.has(p.slug) || cand.some(c => c.p === p)) continue;
      cand.push({ p, named: l.text.length > 4 && flat(words).includes(flat(l.text)) });
    }
    const niceTitle = title.replace(/^Elden Ring (Shadow of the Erdtree )?(Walkthrough\s*-\s*)?/i, '').replace(/\s*Walkthrough$/i, '').trim() || title;
    // the place this section is about: by exact title, by a link it is named after, or by a place name inside its title
    // (a place that has a section of its very own is kept for that section: "The Student of Raya Lucaria Academy" is not the Academy)
    const mayOwn = p => !usedPlace.has(p.slug) && (!exact.has(p.slug) || exact.get(p.slug) === title);
    const inTitle = Object.values(PLACES).filter(p => mayOwn(p) && p.title.length > 4 && flat(words).includes(flat(p.title))).sort((a, b) => b.title.length - a.title.length)[0];
    const primary = (cand.find(c => flat(c.p.title) === flat(niceTitle)) || cand.find(c => mayOwn(c.p) && sameTitle(norm(c.p.title), norm(niceTitle))) || cand.find(c => c.named && mayOwn(c.p)) || {}).p || inTitle || null;
    const subs = [];

    // what the section itself names: one marker per name, the one nearest to where the section happens
    const ok = mapsOf(game);
    // every marker that carries the name, including its variants ("Grafted Scion" and "Grafted Scion (Tutorial)"): the nearest one is meant
    let hits = (s.markers || []).map(l => [...new Set([...l.hits.map(x => all.get(`${x.map}:${x.id}`)).filter(Boolean), ...(byName.get(norm(l.text)) || [])])]).filter(a => a.length);
    const anyOk = hits.flat().some(x => ok(x.map)); if (anyOk || game === 'base' || steps.some(st => st.game === 'dlc' && st.map === 'shadow')) hits = hits.map(a => a.filter(x => ok(x.map))).filter(a => a.length);
    const free = hits.map(a => a.filter(x => !claimed.has(x.key))).filter(a => a.length);
    let mine = [], map = null, pin = null;
    const ppin = primary ? pinOf(primary, game) : null;
    if (free.length || ppin) {
      const solidNames = hits.map(a => a.filter(x => x.kind !== 'x')).filter(a => a.length), count = {};
      for (const a of (solidNames.length ? solidNames : hits)) for (const mp of new Set(a.map(x => x.map))) count[mp] = (count[mp] || 0) + 1;
      // stay on the map the walkthrough is on, unless this section clearly is about another one (rooms of a dungeon
      // share names with places on other maps)
      const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0], prevWalk = [...steps].reverse().find(st => st.game === game && st.src === 'walk');
      map = ppin ? ppin.map : (/(underground)/i.test(title) && count.underground) ? 'underground' : (prevWalk && count[prevWalk.map] && top[1] < 3 * count[prevWalk.map]) ? prevWalk.map : top[0];
      // names that exist in several spots: the walkthrough carries on from where the last step was, so take the nearest
      const last = [...steps].reverse().find(st => st.map === map && st.src === 'walk'), L = last ? all.get(last.pin) : null;
      const pick = a => { const c = a.filter(x => x.map === map); return c.length < 2 || !L ? c[0] : c.sort((p, q) => dist(p, L) - dist(q, L))[0]; };
      const picked = hits.map(pick).filter(Boolean), solid = picked.filter(p => p.kind !== 'x'), pool = solid.length ? solid : picked;   // materials grow everywhere: they do not say where a section happens
      const A = ppin ? { x: ppin.x, y: ppin.y } : { x: med(pool.map(p => p.x)), y: med(pool.map(p => p.y)) };
      // a section that stays in one spot only takes what is around that spot; one that roams takes more
      const spread = pool.length ? med(pool.map(p => dist(p, A))) : 0, lim = Math.min(0.12, Math.max(0.03, 2.5 * spread));
      // other places this section sends you to get their own step, but only when they are actually around here
      // (a place that is merely mentioned, or that a later section is named after, waits for its turn)
      for (const c of cand) {
        if (c.p === primary || !c.p.walk.length || reserved.has(c.p.slug)) continue;
        const qp = pinOf(c.p, game); if (qp && qp.map === map && dist(qp, A) < 0.06) subs.push(placeStep(c.p, qp, game, region));
      }
      const taken = new Set();   // one marker per name: a name the text repeats must not also grab its namesake further away
      for (const a of free) {
        const near = a.filter(x => x.map === map && !claimed.has(x.key)).sort((p, q) => dist(p, A) - dist(q, A));
        for (const c of [near.find(x => x.kind !== 'p'), near.find(x => x.kind === 'p')]) {
          if (!c) continue; const nm = norm(bare(c.title)) + (c.kind === 'p' ? '|p' : ''); if (taken.has(nm)) continue; taken.add(nm);
          if (dist(c, A) > (c.kind === 'x' ? 0.02 : ppin ? 0.045 : lim)) continue;      // a far-away namesake is not this place (a section about one place stays at that place)
          trace(c, 'the section names it', { title }); mine.push(claim(c.key));
        }
      }
      // places the text only mentions in passing sit far from where the step happens: give them back
      const named = k => { const n = bare(all.get(k).title).toLowerCase(); return n.length > 4 && words.includes(n); };
      const core = mine.map(k => all.get(k)).filter(p => p.kind !== 'p'), ref = core.length ? core : mine.map(k => all.get(k));
      const C = ppin ? A : ref.length ? { x: med(ref.map(p => p.x)), y: med(ref.map(p => p.y)) } : A;
      for (let i = mine.length - 1; i >= 0; i--) { const p = all.get(mine[i]); if (p.kind === 'p' && !named(mine[i]) && dist(p, C) > 0.02) { claimed.delete(mine[i]); mine.splice(i, 1); } }
      if (ppin) { mine = [claim(ppin.key), ...mine.filter(k => k !== ppin.key)]; pin = ppin.key; }
      else if (mine.length) pin = mine.find(named) || [...mine].sort((a, b) => dist(all.get(a), C) - dist(all.get(b), C))[0];
    }
    if (primary) usedPlace.add(primary.slug);
    const before = steps[steps.length - 1];
    if (!ppin && mine.length && !mine.some(k => all.get(k).kind === 'g')) {
      // a place that has a page of its own is not this section's to take: it gets its own step
      for (let i = mine.length - 1; i >= 0; i--) { const p = all.get(mine[i]); if (p.cat === 'Locations' && placeByTitle.has(norm(bare(p.title)))) { claimed.delete(mine[i]); mine.splice(i, 1); } }
      if (mine.length && !mine.includes(pin)) pin = mine.find(k => all.get(k).kind === 'p') || mine[0];
    }
    if (!ppin && mine.length && !mine.some(k => all.get(k).kind === 'g')) {
      // nothing to collect or fight here: the text goes with the step before it, unless it happens somewhere else
      const onlyMat = mine.every(k => all.get(k).kind === 'x'), sameGame = before && before.game === game, sameMap = sameGame && before.map === map;
      if (onlyMat && sameGame && !sameMap) {
        // going underground is a step of its own: pin it on a site of grace its text talks about, when there is one around
        const txt = paras.join(' ').toLowerCase(), P0 = all.get(pin);
        const g = [...all.values()].filter(x => x.map === map && x.cat === 'Sites of Grace' && !claimed.has(x.key) && bare(x.title).length > 6 && txt.includes(bare(x.title).toLowerCase()) && dist(x, P0) < 0.06).sort((p, q) => dist(p, P0) - dist(q, P0))[0];
        if (g) { mine.unshift(claim(g.key)); pin = g.key; }
      } else if (onlyMat || (sameMap && dist(all.get(pin), all.get(before.pin)) < 0.015)) { mine.forEach(k => claimed.delete(k)); mine = []; }
    }
    if (mine.length) {
      // the place page often repeats the section's paragraphs word for word: keep only what is new
      let place = null;
      if (primary) {
        const key = t => t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70), have = new Set(paras.map(key));
        let walk = placeText(primary).filter(p => !have.has(key(p))); walk = walk.filter((p, i) => !(p.startsWith('## ') && (walk[i + 1] || '## ').startsWith('## ')));
        const notes = primary.notes.map(tidy).filter(Boolean);
        if (walk.some(p => !p.startsWith('## ')) || notes.length || primary.img) place = { title: primary.title, walk, notes, img: primary.img };
      }
      if (before && before.src === 'walk' && before.game === game && before.title === niceTitle && before.map === map) {
        before.text.push(...(pending ? pending.text : []), ...paras); if (pending) before.imgs.push(...pending.imgs); pending = null; before.m.push(...mine.filter(k => !before.m.includes(k))); before.imgs.push(...takeImgs(game, s.title)); log.push(`joined with the section before it (same title): ${title}`);
      } else { steps.push({ listed: primary && ppin ? new Set(primary.links.map(norm)) : null, own: primary && ppin ? { p: primary, pin: ppin } : null, header: !!h || /walkthrough$/i.test(title), game, region, title: niceTitle, map, text: pending ? [...pending.text, '## ' + niceTitle, ...paras] : paras, miss: null, m: mine, pin, imgs: [...(pending ? pending.imgs : []), ...takeImgs(game, s.title)], place, src: 'walk' }); pending = null; }
    } else if (paras.length && (pending || h)) {
      // the introduction of a new area belongs to the first step in that area, not to the last step of the area before
      pending ||= { text: [], imgs: [] }; pending.text.push('## ' + niceTitle, ...paras); if (primary) pending.text.push(...placeText(primary), ...primary.notes.map(tidy).filter(Boolean)); pending.imgs.push(...takeImgs(game, s.title)); log.push(`kept for the next step: ${title}`);
    } else if (paras.length && steps.length && steps[steps.length - 1].game === game) {
      // nothing to pin on the map: keep the text with the step it follows
      const prev = steps[steps.length - 1]; prev.text.push('## ' + niceTitle, ...paras); if (primary) prev.text.push(...placeText(primary), ...primary.notes.map(tidy).filter(Boolean)); prev.imgs.push(...takeImgs(game, s.title)); log.push(`folded into "${prev.title}": ${title}`);
    } else if (paras.length) log.push(`no place for: ${title}`);
    steps.push(...subs);
    if (blockStart) blockStart.steps = steps.slice(blockStart.at);
  }
  flush();
}

for (const st of steps) if (st.own) st.m.push(...itemsOf(st.own.p, st.own.pin));
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
for (const mk of all.values()) {
  if (mk.cat !== 'Locations' || isPin.has(mk.key)) continue;
  const p = PLACES[slugOf('/' + encodeURIComponent(bare(mk.title)))] || placeByTitle.get(norm(bare(mk.title))); if (!p || usedPlace.has(p.slug) || !p.walk.length) continue;
  // a step only mentioned this place in passing: it gets its own step instead
  if (claimed.has(mk.key)) for (const st of steps) { const i = st.m.indexOf(mk.key); if (i >= 0 && st.m.length > 1) st.m.splice(i, 1); }
  if (steps.some(st => st.m.includes(mk.key))) continue;
  let best = null, bd = 9; for (const st of steps) { if (st.map !== mk.map || st.game !== (mk.map === 'shadow' ? 'dlc' : 'base')) continue; const d = dist(pinXY(st), mk); if (d < bd) { bd = d; best = st; } }
  if (!best) continue;
  extras.push([best, placeStep(p, mk, mk.map === 'shadow' ? 'dlc' : 'base', best.region, true)]);
}
for (const [after, st] of extras) { let at = steps.indexOf(after) + 1; while (at < steps.length && steps[at].src === 'map') at++; steps.splice(at, 0, st); }

// ---- every remaining marker goes to the step that has something closest to it ----
// ---- the same paragraph is shown once: a place page often repeats what the walkthrough section already said ----
const pkey = t => t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60), shown = new Map();
// What a place's own page says stays with the place (its markers are there); the walkthrough section that sent you
// there keeps the rest. So places are looked at first.
const toldBy = new Map();   // a place -> the walkthrough step that describes going there (their text is the same)
for (const isPlace of [true, false]) for (let i = 0; i < steps.length; i++) {
  if ((steps[i].src !== 'walk') !== isPlace) continue;
  const st = steps[i];
  { const once = new Set(); st.text = st.text.filter(p => { if (p.startsWith('## ') || p.length <= 60) return true; const k = pkey(p); if (once.has(k)) return false; once.add(k); return true; }); }   // never twice inside one step
  // where the wiki's walkthrough itself says something in two sections, both steps keep it; only a place page's copy gives way
  const gone = p => { const h = shown.get(pkey(p)); const g = !!h && !(h.src === 'walk' && st.src === 'walk'); if (g && h !== st && h.src !== 'walk' && st.src === 'walk' && !toldBy.has(h)) toldBy.set(h, st); return g; };
  const firstHome = st.text.map(p => p.length > 60 && gone(p) ? shown.get(pkey(p)) : undefined).find(x => x !== undefined);
  st.text = st.text.filter(p => p.startsWith('## ') || p.length <= 60 || !gone(p));
  st.text = st.text.filter((p, j) => !(p.startsWith('## ') && (st.text[j + 1] || '## ').startsWith('## ')));
  if (!st.text.some(p => !p.startsWith('## ')) && firstHome) {      // everything it had to say is already in another step: it is that step
    firstHome.m.push(...st.m.filter(k => !firstHome.m.includes(k)));
    if (st.place) { const extra = [...st.place.walk, ...st.place.notes].filter(p => p.startsWith('## ') || !shown.has(pkey(p))); if (extra.some(p => !p.startsWith('## '))) { firstHome.text.push('## ' + st.place.title, ...extra); extra.forEach(p => shown.set(pkey(p), firstHome)); } }
    log.push(`merged into "${firstHome.title}" (same text): ${st.title}`); steps.splice(i, 1); i--; continue;
  }
  for (const p of st.text) if (p.length > 60 && !shown.has(pkey(p))) shown.set(pkey(p), st);
}
// a place that was slotted in by map distance, but which the walkthrough describes later, comes right after that part
let retold = 0;
for (const [pl, w] of toldBy) { if (!steps.includes(pl) || !steps.includes(w) || steps.indexOf(pl) > steps.indexOf(w)) continue; steps.splice(steps.indexOf(pl), 1); steps.splice(steps.indexOf(w) + 1, 0, pl); retold++; log.push(`moved behind "${w.title}" (the walkthrough describes it there): ${pl.title}`); }
// a dungeon's own page repeats the parts that already are steps of their own: its "in detail" block keeps only what is new
for (const st of steps) {
  if (!st.place) continue;
  let w = st.place.walk.filter(p => p.startsWith('## ') || p.length <= 60 || !shown.has(pkey(p)));
  w = w.filter((p, j) => !(p.startsWith('## ') && (w[j + 1] || '## ').startsWith('## ')));
  st.place.walk = w; for (const p of w) if (p.length > 60) shown.set(pkey(p), st);
  { const mine = new Set([...st.text, ...w].map(pkey)); st.place.notes = st.place.notes.filter(p => !mine.has(pkey(p))); }   // a note the step already says is not repeated
  if (!w.some(p => !p.startsWith('## ')) && !st.place.notes.length && !st.place.img) st.place = null;
}
// ---- one marker, one step: where it is the pin, else the first step that named it ----
const owner = new Map(); for (const st of steps) owner.set(st.pin, st);
for (const st of steps) st.m = st.m.filter(k => { if (!owner.has(k)) owner.set(k, st); return owner.get(k) === st; });
for (const k of owner.keys()) claimed.add(k);

// ---- every remaining marker: to a nearby step whose text talks about it, otherwise to the step that has something closest ----
let attached = 0, byText = 0, orphan = 0, byList = 0;
// a step's place on the map: its pin and what it named close to the pin (a stray mention far away must not pull items there)
const pts = steps.map(st => { const pin = all.get(st.pin); return [pin, ...st.m.map(k => all.get(k)).filter(p => p !== pin && dist(p, pin) < 0.03)]; });
// ---- what an area's own lists name goes to a step of that area ----
for (const L of lists) {
  const block = (L.block.steps || []).map(st => steps.indexOf(st)).filter(i => i >= 0 && steps[i].game === L.game); if (!block.length) continue;
  const cx = med(block.map(i => all.get(steps[i].pin).x)), cy = med(block.map(i => all.get(steps[i].pin).y)), C = { x: cx, y: cy }, mp = steps[block[0]].map;
  for (const cands of L.names) {
    const mk = cands.filter(x => x.map === mp && !owner.has(x.key) && dist(x, C) < 0.09).sort((p, q) => dist(p, C) - dist(q, C))[0]; if (!mk) continue;
    let best = block[0], bd = 9; for (const i of block) for (const p of pts[i]) { const d = dist(p, mk); if (d < bd) { bd = d; best = i; } }
    trace(mk, 'area list ' + L.title, steps[best]); (steps[best].n ||= []).push(mk.key); owner.set(mk.key, steps[best]); attached++; byList++;
  }
}
// "Nomadic Warrior's Cookbook [7]" is one particular book: a numbered thing is only named when its number is
const numbered = t => { const m = t.replace(/[‘’]/g, "'").match(/^(.*\S)\s*[\[(](\d+)[\])]\s*$/); return m ? [m[1].toLowerCase(), m[2]] : null; };
const nameOf = mk => { const q = numbered(mk.title); return q ? `${q[0]} [${q[1]}]` : bare(mk.title).toLowerCase(); };
const says = (txt, mk) => { const q = numbered(mk.title); if (q) return txt.includes(`${q[0]} [${q[1]}]`) || txt.includes(`${q[0]} (${q[1]})`); const nm = bare(mk.title).toLowerCase(); return nm.length >= 4 && txt.includes(nm); };
// a marker on the base game's maps belongs to a base-game step (the expansion's opening steps stand on those maps too)
let namedAfter = () => false;
const fit = (j, mk) => steps[j].map === mk.map && steps[j].game === (mk.map === 'shadow' ? 'dlc' : 'base');
const lower = steps.map(st => [...st.text, ...(st.place ? [...st.place.walk, ...st.place.notes] : [])].join(' ').toLowerCase().replace(/[‘’]/g, "'"));
// a name many markers share ("Golden Seed", "Scadutree Fragment", "Larval Tear"): the text of a step only means the one right there
const nameCount = new Map(); for (const mk of all.values()) if (mk.kind === 'g') { const n = nameOf(mk); nameCount.set(n, (nameCount.get(n) || 0) + 1); }
const reach = nm => nameCount.get(nm) >= 3 ? 0.03 : 0.08;
for (const mk of all.values()) {
  if (owner.has(mk.key)) continue;
  const nm = nameOf(mk); let best = -1, bd = 9, tbest = -1, td = 9;
  for (let i = 0; i < steps.length; i++) {
    if (!fit(i, mk)) continue; let d = 9; for (const p of pts[i]) d = Math.min(d, dist(p, mk));
    if (d < bd) { bd = d; best = i; }
    if (mk.kind === 'g' && d < reach(nm) && d < td && says(lower[i], mk)) { td = d; tbest = i; }
  }
  if (best < 0) { orphan++; continue; }
  if (tbest >= 0 && tbest !== best) byText++;
  trace(mk, tbest >= 0 ? 'text names it' : 'nearest ' + bd.toFixed(4), steps[tbest >= 0 ? tbest : best]); (steps[tbest >= 0 ? tbest : best].n ||= []).push(mk.key); attached++;
}

// ---- lists follow the text ----
// An objective sits, in this order of preference:
//   1. in the step whose TITLE names it ("Optional Field Boss: Tree Sentinel", "SCADUTREE AVATAR")
//   2. in the step whose text names it; when several do, the one that happens closest to it (a dungeon's overview
//      names its bosses, but the part of the dungeon where the boss is fought is where it belongs)
//   3. in the step of the place whose own page lists it
//   4. in the nearest step
let moved = 0;
{
  const home = new Map(); steps.forEach((st, i) => [...st.m, ...(st.n || [])].forEach(k => home.set(k, i)));
  // "Black Knife Catacombs" is not named after the Black Knife: a place's own name does not count
  namedAfter = (j, mk) => says(titles[j], mk) && !(placeByTitle.has(titles[j]) && titles[j] !== nameOf(mk));
  const D = (j, mk) => dist(all.get(steps[j].pin), mk);                     // how far from where the step happens
  const B = (j, mk) => { let d = 9; for (const p of pts[j]) if (p !== mk) d = Math.min(d, dist(p, mk)); return d; };   // ... or from anything the step named there
  const sakes = new Map(); for (const mk of all.values()) if (mk.kind === 'g') { const n = nameOf(mk); if (!sakes.has(n)) sakes.set(n, []); sakes.get(n).push(mk); }
  // a title means one thing: of several markers with that name, the one nearest to the step
  const meant = (j, mk, nm) => { const P = all.get(steps[j].pin), d = dist(P, mk); return !sakes.get(nm).some(o => o !== mk && o.map === mk.map && dist(P, o) < d); };
  const titles = steps.map(st => st.title.toLowerCase().replace(/[‘’]/g, "'"));
  for (const [k, i] of home) {
    const mk = all.get(k); if (mk.kind !== 'g') continue; const isPin = steps[i].pin === k;
    const nm = nameOf(mk);
    const generic = nameCount.get(nm) >= 3, r = reach(nm), di = D(i, mk);
    if (namedAfter(i, mk) && di < 0.1 && meant(i, mk, nm)) continue;
    let best = -1, why = '';
    // 1. a title
    { let bd = 0.1; for (let j = 0; j < steps.length; j++) { if (j === i || !fit(j, mk) || !namedAfter(j, mk) || !meant(j, mk, nm)) continue; const d = D(j, mk); if (d < bd) { bd = d; best = j; why = 'a step title names it'; } } }
    if (isPin) {   // the step was pinned on something another step is named after: it moves, and this step is pinned on what else it has there
      const others = [...steps[i].m, ...(steps[i].n || [])].filter(x => x !== k); if (best < 0 || !others.length) continue;
      steps[i].pin = others.sort((p, q) => (all.get(p).kind === 'p' ? 0 : 0.02) + dist(all.get(p), mk) - (all.get(q).kind === 'p' ? 0 : 0.02) - dist(all.get(q), mk))[0];
    }
    const namedHere = says(lower[i], mk) && di < r && meant(i, mk, nm), weak = !!steps[i].header;   // an area's overview names what its parts then cover
    // 2. the text
    const strong = (namedHere && !weak && (steps[i].src !== 'walk' || !!steps[i].own)) || (steps[i].src !== 'walk' && steps[i].listed && steps[i].listed.has(nm) && di < 0.03);   // a place whose own page talks about it keeps it
    if (best < 0 && !strong) { let bd = namedHere && !weak ? Math.min(r, di * 0.5) : r; for (let j = 0; j < steps.length; j++) { if (j === i || !fit(j, mk) || !says(lower[j], mk) || (namedHere && weak && (steps[j].region !== steps[i].region || steps[j].header))) continue; const d = B(j, mk); if (!meant(j, mk, nm) && d >= 0.03) continue; if (d < bd) { bd = d; best = j; why = 'text of a closer step names it'; } } }
    // 3. the place's own list
    if (best < 0 && !namedHere && !(steps[i].listed && steps[i].listed.has(nm) && di < 0.03)) { let ld = 0.025; for (let j = 0; j < steps.length; j++) { const st = steps[j]; if (j === i || !fit(j, mk) || !st.listed || !st.listed.has(nm)) continue; const d = dist(all.get(st.pin), mk); if (d < ld) { ld = d; best = j; why = 'the place page lists it'; } } }
    // 4. nobody talks about it here: the nearest step
    if (best < 0 && !namedHere && !(says(lower[i], mk) && !mk.desc) && !(steps[i].listed && steps[i].listed.has(nm) && di < 0.03)) { let bd = di * 0.5; for (let j = 0; j < steps.length; j++) { if (j === i || !fit(j, mk)) continue; const d = D(j, mk); if (d < bd) { bd = d; best = j; why = 'nearest step'; } } }
    if (best < 0) continue;
    steps[i].m = steps[i].m.filter(x => x !== k); if (steps[i].n) steps[i].n = steps[i].n.filter(x => x !== k);
    trace(mk, 'moved: ' + why, steps[best]); (steps[best].n ||= []).push(k); moved++;
  }
}

// ---- last look: an objective that sits far from its step while another step happens right next to it ----
// It stays only when its step's text names it unmistakably. A name that is also a common word or part of a place name
// ("Black Knife" / Black Knife Catacombs, "Ghost", "Greatsword") proves nothing, and a marker whose own note names the
// nearer place belongs to that place.
let nearer = 0;
{
  const bodyD = (j, mk) => { let d = dist(all.get(steps[j].pin), mk); for (const x of steps[j].m) { const p = all.get(x); if (p !== mk && p.kind !== 'x') d = Math.min(d, dist(p, mk)); } return d; };
  const tl = steps.map(st => st.title.toLowerCase().replace(/[‘’]/g, "'"));
  const weakName = (mk, nm) => (nameCount.get(nm) >= 3 && !numbered(mk.title)) || !/\s/.test(nm) || tl.some(t => t.includes(nm) && t !== nm) || [...placeByTitle.keys()].some(t => t.includes(nm) && t !== nm);
  // the wiki links the things its text is about ("Iron Ball" the weapon), not words that merely look like them (an iron ball trap)
  const linkSets = steps.map(st => { const out = st.listed ? [st.listed] : []; for (const p of [...st.text, ...(st.place ? st.place.walk : [])]) { const L = paraLinks.get(p.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60)); if (L && !out.includes(L)) out.push(L); } return out; });
  const linked = (i, mk) => { const nm = norm(bare(mk.title)); return linkSets[i].some(L => { if (L.has(nm) || L.has(norm(mk.title))) return true; for (const t of L) if (t.length >= 5 && (nm.includes(t) || t.includes(nm))) return true; return false; }); };
  // ... or writes with capitals, as a name: "the Bolt of Gransax", but "the iron ball trap"
  const rawText = steps.map(st => [...st.text, ...(st.place ? [...st.place.walk, ...st.place.notes] : [])].join(' ').replace(/[‘’]/g, "'"));
  const proper = (i, mk) => { const t = bare(mk.title); return t.includes(' ') && rawText[i].includes(t); };
  const twins = new Map(); for (const mk of all.values()) if (mk.kind === 'g') { const n = nameOf(mk); if (!twins.has(n)) twins.set(n, []); twins.get(n).push(mk); }
  for (let i = 0; i < steps.length; i++) for (const k of [...steps[i].m, ...(steps[i].n || [])]) {
    const mk = all.get(k); if (mk.kind !== 'g' || steps[i].pin === k || namedAfter(i, mk)) continue;
    const d0 = bodyD(i, mk); if (d0 <= 0.03) continue;
    let best = -1, bd = d0 * 0.5; for (let j = 0; j < steps.length; j++) { if (j === i || !fit(j, mk)) continue; const d = bodyD(j, mk); if (d < bd) { bd = d; best = j; } }
    if (best < 0) continue;
    const nm = nameOf(mk), note = (mk.title + ' . ' + mk.desc).toLowerCase(), pl = bare(all.get(steps[best].pin).title).toLowerCase(), byNote = (tl[best].length > 7 && note.includes(tl[best])) || (all.get(steps[best].pin).cat === 'Locations' && pl.length > 7 && note.includes(pl));
    const other = twins.get(nm).some(o => o !== mk && o.map === mk.map && bodyD(i, o) < d0 * 0.5);   // the text means its namesake that is right here
    if (!(byNote || other || !says(lower[i], mk) || !(linked(i, mk) || proper(i, mk)) || weakName(mk, nm))) continue;
    steps[i].m = steps[i].m.filter(x => x !== k); if (steps[i].n) steps[i].n = steps[i].n.filter(x => x !== k);
    trace(mk, 'moved: far from its step, right next to this one', steps[best]); (steps[best].n ||= []).push(k); nearer++;
  }
}

const stepsBefore = [...steps];
// ---- the order respects where the walkthrough has taken you ----
// Every place page says which region it is in ("Located In Three Sisters"). A region is entered at the walkthrough
// section that takes you there (its own header, or the section that opens the way: Three Sisters after Caria Manor,
// Moonlight Altar after the Lake of Rot, Nokron after the Radahn festival...). Places that were slotted in by map
// distance alone, and loose objectives, never come before that: two spots that are close on the map can be a cliff,
// a locked lift or a boss apart.
const regionOfPlace = t => { const br = (t.match(/\(([^)]+)\)\s*$/) || [])[1]; if (br && ENTRY.some(x => x[0] === br) || br === 'Limgrave') return br; const p = placeByTitle.get(norm(t)) || (br ? null : placeByTitle.get(norm(bare(t)))); return p ? canonRegion(p.region) : null; };
const entryStep = z => { const e = ENTRY.find(x => x[0] === z); return e ? steps.find(st => st.src === 'walk' && e[1].test(`${st.region} | ${st.title}`)) || null : null; };
let regated = 0, remarked = 0;
{
  // the region of a spot: the region of a marker is the one its own note names, else that of the nearest place
  const known = [...all.values()].filter(m => m.cat === 'Locations' && regionOfPlace(m.title)).map(m => ({ m, z: regionOfPlace(m.title), t: bare(m.title).toLowerCase() }));
  const zoneOf = (mk, lim = 0.05) => { const note = mk.cat === 'Locations' ? '' : (mk.title + ' . ' + mk.desc).toLowerCase(); let b = null, bd = lim, named = null, nd = 0.05;
    for (const k of known) { if (k.m.map !== mk.map || k.m === mk) continue; const d = dist(k.m, mk); if (d < bd) { bd = d; b = k.z; } if (k.t.length > 7 && d < nd && note.includes(k.t)) { nd = d; named = k.z; } }
    return named || b; };
  // 1. places: each goes right behind the step that opens its region; several for one region in walking order
  const late = new Map();
  for (const st of steps) {
    if (st.src === 'walk') continue;
    const z = regionOfPlace(st.title) || zoneOf(pinXY(st)), E = z && entryStep(z); if (!E || steps.indexOf(st) > steps.indexOf(E)) continue;
    if (!late.has(E)) late.set(E, []); late.get(E).push(st); log.push(`moved behind "${E.title}" (${z} is not open before it): ${st.title}`); regated++;
  }
  for (const [E, list] of late) {
    for (const st of list) steps.splice(steps.indexOf(st), 1);
    let at = steps.indexOf(E) + 1, from = pinXY(E), rest = [...list];
    while (rest.length) { const same = rest.filter(st => st.map === from.map), pool = same.length ? same : rest; const nx = pool.sort((p, q) => dist(pinXY(p), from) - dist(pinXY(q), from))[0]; rest.splice(rest.indexOf(nx), 1); steps.splice(at++, 0, nx); nx.fixed = true; from = pinXY(nx); }
  }
  // ... and the few places the walkthrough's own text puts at a particular point
  for (const [title, re, how] of SPECIAL) {
    const st = steps.find(x => x.src !== 'walk' && x.title === title), w = steps.find(x => x.src === 'walk' && re.test(x.title)); if (!st || !w) continue;
    steps.splice(steps.indexOf(st), 1); let at = steps.indexOf(w) + (how === 'after' ? 1 : 0);
    if (how === 'after') while (steps[at] && steps[at].src !== 'walk' && (steps[at].map === w.map || steps[at].special)) at++;   // behind the dungeon's own places and earlier entries of this table
    steps.splice(at, 0, st); st.fixed = st.special = true; regated++; log.push(`moved ${how} "${w.title}" (the walkthrough says so): ${title}`);
  }
  // 2. loose objectives
  for (let i = 0; i < steps.length; i++) for (const k of [...steps[i].m, ...(steps[i].n || [])]) {
    const mk = all.get(k); if (mk.kind !== 'g' || steps[i].pin === k || says(lower[stepsBefore.indexOf(steps[i])], mk)) continue;   // what the step's own text names stays
    const own = Math.min(dist(pinXY(steps[i]), mk), ...steps[i].m.map(x => all.get(x)).filter(p => p !== mk && p.kind !== 'x').map(p => dist(p, mk)));
    const z = zoneOf(mk, Math.min(0.05, own)), E = z && entryStep(z); if (!E) continue; const e = steps.indexOf(E); if (i >= e) continue;
    let best = e, bd = 0.15; for (let j = e; j < steps.length; j++) { if (steps[j].map !== mk.map || steps[j].game !== steps[e].game) continue; const d = dist(pinXY(steps[j]), mk); if (d < bd) { bd = d; best = j; } }
    if (steps[best].map !== mk.map) continue;
    steps[i].m = steps[i].m.filter(x => x !== k); if (steps[i].n) steps[i].n = steps[i].n.filter(x => x !== k);
    trace(mk, `moved: ${z} is not open before "${E.title}"`, steps[best]); (steps[best].n ||= []).push(k); remarked++;
  }
}

// ---- a place nothing around it leads to (reached by a waygate, like the Isolated Divine Tower): it follows the
// walkthrough step that speaks of it ----
for (const st of [...steps]) {
  if (st.src !== 'map' || st.fixed) continue; const i = steps.indexOf(st), a = steps[i - 1], b = steps[i + 1];
  const far = x => !x || x.map !== st.map || dist(pinXY(x), pinXY(st)) > 0.15; if (!far(a) || !far(b)) continue;
  const t = st.title.toLowerCase(), by = steps.filter(w => w.src === 'walk' && w.game === st.game && w.text.join(' ').toLowerCase().includes(t)); if (!by.length) continue;
  const w = by.sort((p, q) => Math.abs(steps.indexOf(p) - i) - Math.abs(steps.indexOf(q) - i))[0];
  steps.splice(i, 1); steps.splice(steps.indexOf(w) + 1, 0, st); log.push(`moved behind "${w.title}" (reached from there): ${st.title}`);
}
// an inserted place carries the area name of the step it follows
steps.forEach((st, i) => { if (st.src !== 'walk' && i && steps[i - 1].game === st.game) st.region = steps[i - 1].region; });

// The opening fight in the Chapel of Anticipation is meant to be lost. The Grafted Scion, its two drops and the
// chapel's other pickups are the ones you return for through the waygate at The Four Belfries, so they belong to that step.
{ const from = steps.find(s => s.title === 'The Chapel of Anticipation'), to = steps.find(s => s.title === 'The Four Belfries');
  const back = new Set(['Grafted Scion (Tutorial)', 'Golden Beast Crest Shield', 'Ornamental Straight Sword', 'Stormhawk Deenh', 'The Stormhawk King']);
  if (from && to) { const mv = from.m.filter(k => back.has(all.get(k).title)); from.m = from.m.filter(k => !mv.includes(k)); to.m.push(...mv);
    from.text = [...from.text, 'The Grafted Scion here is meant to kill you. You come back for it, its drops and the items of the chapel much later, through the waygate at The Four Belfries.'];
    log.push('moved to "The Four Belfries": ' + mv.map(k => all.get(k).title).join(', ')); } }

// The start of the game. The wiki's walkthrough says of Fringefolk Hero's Grave "return to this section later on when
// you are well-equipped" and never names the moment, so placing it by distance put it at step 3: before the player has
// two Stonesword Keys or the strength for it. It now comes at the end of Limgrave, right before Stormveil Castle.
// Things that only lie close to the starting cave as the crow flies (the beach below the cliff, the Seaside Ruins) go to
// the steps that actually walk there.
{ const S = t => steps.find(s => s.title === t), nameOf = k => all.get(k).title.replace(/<[^>]+>/g, '').trim();
  const move = (from, to, names, dest) => { if (!from || !to) return; for (const l of ['m', 'n']) { const mv = (from[l] || []).filter(k => names.includes(nameOf(k))); if (!mv.length) continue;
      from[l] = from[l].filter(k => !mv.includes(k)); to[dest] = [...(to[dest] || []), ...mv.filter(k => !(to.m || []).includes(k) && !(to.n || []).includes(k))]; log.push(`moved from "${from.title}" to "${to.title}": ` + mv.map(nameOf).join(', ')); } };
  const start = S('Tutorial - Stranded Graveyard'), grave = S("Fringefolk Hero's Grave"), elleh = S('Limgrave - Church of Elleh'), coast = S('Clear out the Coastal Cave'), burnt = S('Dragon-Burnt Ruins'), castle = S('Stormveil Castle');
  move(grave, start, ['Stranded Graveyard'], 'm'); move(grave, start, ['Cave of Knowledge', 'Small Golden Effigy'], 'n');
  move(grave, elleh, ['Church of Elleh'], 'm'); move(grave, elleh, ['Golden Rune [2]'], 'n');
  move(grave, coast, ['Gold-Pickled Fowl Foot', 'Golden Rune [1] H', "Spiritspring: Behind Fringefolk Hero's Grave"], 'n');
  move(start, burnt, ['Haligdrake Talisman'], 'm'); move(start, burnt, ['Incantation Scarab', 'Seaside Ruins', 'Ash of War: Gravitas', 'Lump of Flesh', 'Spiritspring: Seaside Ruins'], 'n');
  if (grave && castle) { steps.splice(steps.indexOf(grave), 1); steps.splice(steps.indexOf(castle), 0, grave); grave.region = 'Limgrave';
    grave.text = ['Now is the time to come back to the fog door in the Stranded Graveyard, where the game began: travel to the Stranded Graveyard site of grace. The door needs two Stonesword Keys.', ...grave.text];
    log.push('moved before "Stormveil Castle" (the walkthrough says to return later): Fringefolk Hero’s Grave'); } }

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
R.push(`place pages: ${Object.keys(PLACES).length}; used ${usedPlace.size}; with a walkthrough but unused: ${Object.values(PLACES).filter(p => p.walk.length && !usedPlace.has(p.slug) && !Object.values(PLACES).some(q => q !== p && q.title === p.title && usedPlace.has(q.slug))).map(p => p.title).join(', ') || 'none'}`);
R.push(`moved behind the point where their region opens: ${regated} places, ${remarked} objectives`);
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
await import('./boss-drops.mjs');   // adds each boss's own drops to markers.json
console.log('route.json', kb('app/data/route.json'), 'markers.json', kb('app/data/markers.json'));
