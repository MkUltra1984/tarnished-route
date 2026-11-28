// Builds app/data/route.json from Redmaw's Elden Ring Completion Sheets (https://eldenring.redmaw.dev,
// github.com/rdmaw/elden-ring-completion-sheets), saved in raw/redmaw/.
//
// Owner's rule: Redmaw's walkthrough gives the ORDER in which things are done and picked up. The words come from the
// Fextralife wiki (each thing's note on the wiki's map); where the wiki has no note, Redmaw's own line is shown.
//
//  - Redmaw's sheet is a list of single actions. Every line that names at least one objective (boss, person, item)
//    ends a step, so a step is one meeting, one fight or one pick-up, together with the lines that lead to it.
//  - A name in a line is matched to the wiki map's marker of that name; of several markers with one name
//    ("Golden Rune [1]") the nearest unused one to where the walkthrough currently is.
//  - Markers Redmaw never names stay in the app: each goes to the nearest step on its map as "nearby, on the way".
//  - A step that names a place the wiki has a page for carries that page's detailed text ("... in detail").
//
// Needs app/data/markers.json (written by tools/build-route.mjs, which also knows boss drops). Writes route.json only.
// Usage: node tools/build-route-redmaw.mjs
import fs from 'node:fs';
import * as cheerio from 'cheerio';

const MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8')), L = MK.list;
const PLACES = JSON.parse(fs.readFileSync('data/places.json', 'utf8'));
const kind = i => MK.cats[L[i][3]].kind, mapOf = i => MK.maps[L[i][0]];
const plain = t => t.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const norm = s => plain(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const strip = t => { let p; t = plain(t); do { p = t; t = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').replace(/\s+[A-Z]$/, '').replace(/\s*-?\s*\d+x\b.*$/, '').trim(); } while (t !== p); return t; };
const short = t => { let p, x = plain(t); do { p = x; x = x.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').trim(); } while (x !== p); return x; };
const DROPS = MK.drops || {}, dropOf = new Map(); for (const b in DROPS) for (const i of DROPS[b]) dropOf.set(i, +b);

// every marker under the names it can be called by
const byName = new Map();
L.forEach((m, i) => { for (const k of new Set([norm(strip(m[4])), norm(m[4]), norm(strip(m[4]).replace(/^ash of war: /i, '')), norm(strip(m[4]).split(',')[0])])) { if (k.length < 3) continue; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(i); } });
const lookup = t => { const a = plain(t).replace(/\s+x\d+$/i, ''); for (const k of [norm(a), norm(strip(a)), norm(a.replace(/s$/, '')), norm(a.replace(/^the /i, ''))]) { const c = byName.get(k); if (c) return c; } return null; };
// people and bosses are often called by one word of their name ("Alexander", "Varre", "Kale"): a word that belongs to
// exactly one of them finds that one
const GENERIC = new Set('knight black blade queen king lord first elden golden order great greater lesser spirit ulcerated tree erdtree burial watchdog cemetery shade night cavalry omen full moon mother fingers captain fire knights valiant dragon ancient flying magma putrid death beast clergyman crucible warrior royal commander general elder leader apostle noble godskin giant merchant nomadic hermit isolated finger bloody hunter sorceress sorcerer brother preceptor location second third fourth fifth sixth seventh final maiden twin husks'.split(' '));
const byWord = new Map(); L.forEach((m, i) => { if (!['NPCs', 'NPC Invaders', 'Bosses'].includes(m[3])) return; for (const w of new Set(short(m[4]).toLowerCase().split(/[^a-z']+/).filter(w => w.length >= 4 && !GENERIC.has(w)))) { if (!byWord.has(w)) byWord.set(w, new Map()); const g = byWord.get(w), k = norm(short(m[4])); if (!g.has(k)) g.set(k, []); g.get(k).push(i); } });
const lookupPerson = t => { const words = plain(t).toLowerCase().split(/[^a-z']+/).filter(w => w.length >= 4 && !GENERIC.has(w)); for (const w of words) { const g = byWord.get(w); if (g && g.size === 1) return [...g.values()][0]; } return null; };
const placeByTitle = new Map(Object.values(PLACES).map(p => [norm(p.title), p]));

const nameOf = i => { const t = short(L[i][4]); return t.length < 5 || L[i][3] === 'Maps' ? plain(L[i][4]) : t; };
const allLines = [];
const used = new Set(), steps = [], stats = { lines: 0, links: 0, matched: 0, plain: 0 };
// objective names as they would stand in running text (lower case, at least 7 letters, longest first)
const plainNames = (() => { const m = new Map(); L.forEach((x, i) => { if (kind(i) !== 'g') return; const k = strip(x[4]).toLowerCase(); if (k.replace(/[^a-z]/g, '').length < 7) return; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return [...m.entries()].sort((p, q) => q[0].length - p[0].length); })();
const KIND = { 'NPCs': 'Talk to ', 'NPC Invaders': 'Invader: ', 'Bosses': 'Boss: ' };

for (const [file, game, maps] of [['walkthrough', 'base', ['overland', 'underground', 'ashen']], ['dlc-walkthrough', 'dlc', ['shadow']]]) {
  const $ = cheerio.load(fs.readFileSync(`raw/redmaw/${file}.html`, 'utf8'));
  let cur = null;   // where the walkthrough currently is: the last thing it named
  const dist = i => cur && cur.map === mapOf(i) ? Math.hypot(L[i][1] - cur.x, L[i][2] - cur.y) : 5;
  $('h3').each((_, h3) => {
    const region = plain($(h3).clone().children('button, span').remove().end().text()).replace(/\s*\d+\/\d+$/, '');
    const list = $(h3).nextAll('ul, ol').first(); if (!list.length) return;
    let pending = [];   // lines since the last step
    const sectionSteps = [];
    const close = () => {
      if (!pending.length) return;
      const marks = [...new Set(pending.flatMap(l => l.marks))], g = marks.filter(i => kind(i) === 'g' && !dropOf.has(i)), lead = g[0] ?? marks[0];
      const names = (g.length ? g : marks.filter(i => kind(i) === 'g')).map(i => (KIND[L[i][3]] || '') + nameOf(i));
      const title = names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') : region;
      // the words: the wiki's note for each named thing; Redmaw's line where the wiki says nothing
      const text = []; const said = new Set();
      for (const l of pending) { const notes = l.marks.filter(i => kind(i) !== 'p' && plain(L[i][5] || '').length > 12).map(i => { const d = plain(L[i][5]); return `${nameOf(i)}: ${d}`; }).filter(d => !said.has(d));
        notes.forEach(d => said.add(d)); if (notes.length) text.push(...notes); else if (!l.marks.some(i => kind(i) === 'g')) text.push(l.text); else if (!l.marks.some(i => plain(L[i][5] || '').length > 12)) text.push(l.text); }
      const miss = pending.filter(l => l.miss).map(l => l.miss).join(' ') || null;
      let place = null; for (const i of marks) if (L[i][3] === 'Locations') { const p = placeByTitle.get(norm(short(L[i][4]))); if (p && !p.taken && (p.walk.length || p.notes.length)) { p.taken = true; place = { title: p.title, walk: p.walk, notes: p.notes, img: p.img || null }; break; } }
      const at = lead != null ? { map: mapOf(lead), x: L[lead][1], y: L[lead][2] } : (steps.length ? { map: steps[steps.length - 1].map, x: steps[steps.length - 1].x, y: steps[steps.length - 1].y } : { map: maps[0], x: 0.5, y: 0.5 });
      const st = { id: `rm:${pending[pending.length - 1].id}`, game, region, title, ...at, text, miss, boss: g.some(i => L[i][3] === 'Bosses'), m: marks, n: [], imgs: [], place, card: g[0] ?? null, optional: pending.every(l => l.optional) || undefined };
      for (const l of pending) { l.step = st; allLines.push(l); }
      steps.push(st); sectionSteps.push(st); pending = [];
    };
    list.find('input[type=checkbox]').each((_, box) => {
      // a line of the sheet is the entry itself, without the sub-entries nested inside it (they are lines of their own)
      const li = $(box).closest('li').clone(); li.find('ul, ol').remove(); const id = $(box).attr('id'); stats.lines++;
      const missEl = li.find('.missable').first(), miss = missEl.length ? (missEl.attr('data-tooltip') || 'This can be lost for the rest of the playthrough.') : (li.find('.badge').filter((_, b) => /missable/i.test($(b).text())).length ? 'This can be lost for the rest of the playthrough.' : null);
      const optional = li.find('.badge').filter((_, b) => /optional/i.test($(b).text())).length > 0;
      const body = li.clone(); body.find('.badge').remove(); const text = plain(body.text()), low = text.toLowerCase();
      const marks = [], note = /^\s*(note|tip|warning)\b/i.test(text);
      const MENTION = /\b(needs?|requires?|requiring|using|use|used|uses|bought|buy|sells?|sold|give|giving|offer|spend|equip|equipped|without|instead of|such as|die to|avoid|avoiding|ignore|skip|run past|sneak past|if you (?:have|picked|chose))\b[^,]*$/i;
      const foe = i => L[i][3] === 'Bosses' || L[i][3] === 'NPC Invaders';
      const take = pick => { used.add(pick); marks.push(pick); stats.matched++; cur = { map: mapOf(pick), x: L[pick][1], y: L[pick][2] }; for (const d of DROPS[pick] || []) if (!used.has(d)) { used.add(d); marks.push(d); } };
      // 1. the names the line links
      const todo = [];
      li.find('a').each((_, a) => { stats.links++; const href = decodeURIComponent((($(a).attr('href') || '').match(/wiki\.gg\/wiki\/([^#?]+)/) || [, ''])[1]).replace(/_/g, ' ');
        const c = lookup($(a).text()) || (href && lookup(href)) || lookupPerson($(a).text()) || (href && lookupPerson(href)); if (!c || note) return;
        // Redmaw prints enemies in red: only a red name can be a boss or invader to defeat, and a red name is nothing to pick up
        const red = /\bred\b/.test($(a).attr('class') || '');
        // a name that is only mentioned (something to use, give, buy or need) is not a pick-up
        const html = $.html(li), at = html.indexOf($.html(a)), before = plain(html.slice(0, at)).split(/[.;!?]\s/).pop() || ''; if (MENTION.test(before)) return;
        const free = c.filter(i => !used.has(i) && maps.includes(mapOf(i)) && (red ? foe(i) || L[i][3] === 'NPCs' : !foe(i))); if (free.length) todo.push({ c, free, red }); });
      // names that can only mean one marker first: they say where the line is (after a fast travel, too)
      const anchors = []; const near = i => Math.min(dist(i), ...anchors.map(a => a.map === mapOf(i) ? Math.hypot(L[i][1] - a.x, L[i][2] - a.y) : 5));
      for (const t of todo) { if (t.free.length !== 1 || t.c.length > 1 && (!cur || dist(t.free[0]) > 0.15) && kind(t.free[0]) !== 'g') continue; const i = t.free[0]; if (used.has(i)) continue; t.done = true; take(i); anchors.push({ map: mapOf(i), x: L[i][1], y: L[i][2] }); }
      // a drop named in the line points at its boss ("kill the Deathbird for Blue-Feathered Branchsword")
      for (const t of todo) { if (t.done || !t.red) continue; const viaDrop = t.free.find(b => (DROPS[b] || []).some(d => marks.includes(d) || todo.some(o => o !== t && o.c.includes(d)))); if (viaDrop != null && !used.has(viaDrop)) { t.done = true; take(viaDrop); anchors.push({ map: mapOf(viaDrop), x: L[viaDrop][1], y: L[viaDrop][2] }); } }
      // of several markers with one name, the nearest to where the line is; too far away is a mention, not a pick-up
      for (const t of todo) { if (t.done) continue; const free = t.free.filter(i => !used.has(i)); if (!free.length) continue; const pick = free.sort((p, q) => near(p) - near(q))[0], d = near(pick);
        if (t.c.length >= 3 && d > 0.04) continue; if (t.c.length === 2 && d > 0.15) continue; if (d > 4 && kind(pick) !== 'g' && t.c.length > 1) continue;
        take(pick); anchors.push({ map: mapOf(pick), x: L[pick][1], y: L[pick][2] }); }
      // 2. names the line says without linking them: only things that are right here
      if (!note && cur) for (const [name, list2] of plainNames) { const p = low.indexOf(name); if (p < 0) continue; if (p > 0 && /[a-z]/.test(low[p - 1]) || /[a-z]/.test(low[p + name.length] || '')) continue;
        if (MENTION.test(text.slice(0, p).split(/[.;!?]\s/).pop() || '')) continue;
        const free = list2.filter(i => !used.has(i) && maps.includes(mapOf(i)) && !marks.includes(i)); if (!free.length) continue; const pick = free.sort((a, b) => near(a) - near(b))[0]; if (near(pick) > 0.03) continue;
        take(pick); stats.plain++; }
      pending.push({ id, text, marks, miss, optional, names: new Set(li.find('a').map((_, a) => norm($(a).text().replace(/s+xd+$/i, ''))).get()), red: new Set(li.find('a.red').map((_, a) => norm($(a).text())).get()), note });
      if (marks.some(i => kind(i) === 'g')) close();
    });
    // what is left at the end of a section belongs to its last step
    if (pending.length && sectionSteps.length) { const last = sectionSteps[sectionSteps.length - 1]; for (const l of pending) { l.step = last; allLines.push(l); last.text.push(l.text); for (const i of l.marks) if (!last.m.includes(i)) last.m.push(i); if (l.miss) last.miss = (last.miss ? last.miss + ' ' : '') + l.miss; } pending = []; } else close();
  });
}

// Repair of same-named things. "Golden Seed" or "Stonesword Key" stands for many markers; the first pass takes the
// nearest free one to where the walkthrough was. Looking at the finished route, a pick that lies far from everything
// in the steps around it, while a free marker of the same name lies among them, was the wrong one: they are swapped.
const nameKey = i => norm(strip(L[i][4])), siblings = new Map(); L.forEach((m, i) => { const k = nameKey(i); if (!siblings.has(k)) siblings.set(k, []); siblings.get(k).push(i); });
const context = (i, k) => { let d = 5; for (let q = Math.max(0, k - 3); q <= Math.min(steps.length - 1, k + 3); q++) for (const j of steps[q].m) if (j !== i && mapOf(j) === mapOf(i) && nameKey(j) !== nameKey(i)) d = Math.min(d, Math.hypot(L[j][1] - L[i][1], L[j][2] - L[i][2])); return d; };
let swapped = 0, lonely = 0;
steps.forEach((st, k) => { for (const i of [...st.m]) { const sib = siblings.get(nameKey(i)); if (sib.length < 2 || dropOf.has(i)) continue; const mine = context(i, k); if (mine <= 0.05) continue;
    const better = sib.filter(j => !used.has(j) && L[j][3] === L[i][3] && (mapOf(j) === 'shadow') === (st.game === 'dlc')).map(j => [context(j, k), j]).sort((a, b) => a[0] - b[0])[0];
    if (better && better[0] + 0.02 < mine && better[0] < 0.04) { st.m[st.m.indexOf(i)] = better[1]; used.delete(i); used.add(better[1]); if (st.card === i) st.card = better[1]; swapped++; } else lonely++; } });
for (const st of steps) { const lead = st.m.find(i => kind(i) === 'g' && !dropOf.has(i)) ?? st.m[0]; if (lead != null && (st.card == null || !st.m.includes(st.card))) { st.card = kind(lead) === 'g' ? lead : null; } if (lead != null) { st.map = mapOf(lead); st.x = L[lead][1]; st.y = L[lead][2]; } }
console.log('same-named picks repaired:', swapped, '| still far from their neighbours with no better candidate:', lonely);

// Second chance for objectives the first pass left out although the sheet links their name (the walkthrough had
// travelled, so "the nearest one" was not the right one, or the line read like a mention): each goes to the nearest
// step whose line names it, if that step is close to the thing on the map.
let rescued = 0;
L.forEach((m, i) => { if (used.has(i) || kind(i) !== 'g' || dropOf.has(i)) return; const keys = new Set([norm(strip(m[4])), norm(m[4]), norm(strip(m[4]).replace(/^ash of war: /i, ''))]), foe = m[3] === 'Bosses' || m[3] === 'NPC Invaders';
  let best = null, bd = 0.06; for (const l of allLines) { if (l.note || !l.step || l.step.map !== mapOf(i) || (l.step.game === 'dlc') !== (mapOf(i) === 'shadow')) continue; const hit = [...keys].find(k => l.names.has(k)); if (!hit || foe !== l.red.has(hit)) continue;
    const d = Math.min(Math.hypot(l.step.x - m[1], l.step.y - m[2]), ...l.step.m.map(j => mapOf(j) === mapOf(i) ? Math.hypot(L[j][1] - m[1], L[j][2] - m[2]) : 5)); if (d < bd) { bd = d; best = l.step; } }
  if (!best) return; best.m.push(i); used.add(i); rescued++; for (const d of DROPS[i] || []) if (!used.has(d)) { used.add(d); best.m.push(d); } });
// markers the sheet never names: to the nearest step on their map, as "nearby, on the way"
let leftG = 0, leftOther = 0; const far = [], extras = [];
const byMap = new Map(); steps.forEach(s => { if (!byMap.has(s.map)) byMap.set(s.map, []); byMap.get(s.map).push(s); });
const isDlc = i => mapOf(i) === 'shadow';
L.forEach((m, i) => { if (used.has(i)) return;
  if (dropOf.has(i)) { const s = steps.find(x => x.m.includes(dropOf.get(i)) || x.n.includes(dropOf.get(i))); if (s) { s.m.includes(dropOf.get(i)) ? s.m.push(i) : s.n.push(i); used.add(i); return; } }
  const pool = (byMap.get(mapOf(i)) || []).filter(s => (s.game === 'dlc') === isDlc(i)); if (!pool.length) { far.push(m[4]); return; }
  let best = null, bd = 9; for (const s of pool) { const d = Math.hypot(s.x - m[1], s.y - m[2]); if (d < bd) { bd = d; best = s; } }
  // a person, invader or boss the sheet does not name still gets a step of its own, right behind the nearest step
  if (KIND[m[3]]) { const st = { id: 'rm:extra:' + i, game: best.game, region: best.region.replace(/ · meeting.*$/, ''), title: KIND[m[3]] + nameOf(i), map: mapOf(i), x: m[1], y: m[2], text: [plain(m[5] || '')].filter(t => t.length > 3), miss: null, boss: m[3] === 'Bosses', m: [i], n: [], imgs: [], place: null, card: i, extra: 1 };
    extras.push([best, st]); used.add(i); leftG++; return; }
  best.n.push(i); used.add(i); if (kind(i) === 'g') leftG++; else leftOther++; if (bd > 0.08 && kind(i) === 'g') far.push(`${m[4]} (${bd.toFixed(2)} from "${best.title}")`); });
for (const [after, st] of extras) steps.splice(steps.indexOf(after) + 1, 0, st);
// drops whose boss sits in another step follow their boss
for (const s of steps) for (const l of ['m', 'n']) for (const i of [...s[l]]) { if (!dropOf.has(i)) continue; const b = dropOf.get(i), home = steps.find(x => x.m.includes(b) || x.n.includes(b)); if (home && home !== s) { s[l] = s[l].filter(k => k !== i); (home.m.includes(b) ? home.m : home.n).push(i); } }
for (const s of steps) { s.m = [...new Set(s.m)]; s.n = [...new Set(s.n)].filter(i => !s.m.includes(i)); s.boss = [...s.m].some(i => L[i][3] === 'Bosses'); if (s.optional === undefined) delete s.optional; }

// The wiki's detailed walkthrough of a place ("... in detail") goes to the first step at that place: the step that
// names the place, else the first step that has the place's marker beside it, else the first step that names
// something the place's own page lists, close to the place.
let placed = 0; const placeOf = p => ({ title: p.title, walk: p.walk, notes: p.notes, img: p.img || null });
for (const st of steps) { if (st.place) { placed++; continue; } for (const i of [...st.m, ...st.n]) if (L[i][3] === 'Locations') { const p = placeByTitle.get(norm(short(L[i][4]))); if (p && !p.taken && (p.walk.length || p.notes.length)) { p.taken = true; st.place = placeOf(p); placed++; break; } } }
const locOf = new Map(); L.forEach((m, i) => { if (m[3] === 'Locations') locOf.set(norm(short(m[4])), i); });
for (const p of Object.values(PLACES)) { if (p.taken || !(p.walk.length || p.notes.length)) continue; const li = locOf.get(norm(p.title)); if (li == null) continue; const links = new Set((p.links || []).map(norm));
  const st = steps.find(x => !x.place && x.map === mapOf(li) && Math.hypot(x.x - L[li][1], x.y - L[li][2]) < 0.03 && x.m.some(i => links.has(norm(short(L[i][4]))))) || steps.find(x => !x.place && x.map === mapOf(li) && Math.hypot(x.x - L[li][1], x.y - L[li][2]) < 0.012);
  if (st) { p.taken = true; st.place = placeOf(p); placed++; } }
const unplaced = Object.values(PLACES).filter(p => !p.taken && (p.walk.length || p.notes.length)).map(p => p.title);
console.log('wiki place pages with a detailed text:', placed + unplaced.length, '| shown in a step:', placed, '| not placed:', unplaced.length, unplaced.slice(0, 12).join('; '));

// The wiki's own walkthrough (its long running text, section by section) stays in the app too. The wiki-ordered
// route that tools/build-route.mjs builds has already worked out which things each section is about; it is kept in
// data/route-fextra.json. Each of its sections goes to the step of this route where its things begin
// ("Wiki walkthrough: ..."): the first step of the stretch of the route that holds most of them.
if (fs.existsSync('app/data/route.json')) { const old = JSON.parse(fs.readFileSync('app/data/route.json', 'utf8')); if (old.length && !String(old[0].id).startsWith('rm:')) fs.writeFileSync('data/route-fextra.json', JSON.stringify(old)); }
const stepOfMarker = new Map(); steps.forEach((st, k) => [...st.m, ...st.n].forEach(i => { if (!stepOfMarker.has(i)) stepOfMarker.set(i, k); }));
let secs = 0, secPlaced = 0, paras = 0;
if (fs.existsSync('data/route-fextra.json')) for (const o of JSON.parse(fs.readFileSync('data/route-fextra.json', 'utf8'))) {
  if (o.side || !o.text || !o.text.length || o.text.join(' ').length < 80) continue;
  { const p = placeByTitle.get(norm(o.title)); if (p && p.taken) continue; }   // that text is already shown as the place's "in detail"
  secs++;
  const own = o.m.filter(i => kind(i) === 'g').map(i => stepOfMarker.get(i)).filter(k => k != null), any = o.m.map(i => stepOfMarker.get(i)).filter(k => k != null);
  const pool = own.length ? own : any; if (!pool.length) continue; const sorted = [...pool].sort((p, q) => p - q), mid = sorted[Math.floor((sorted.length - 1) / 2)];
  const close = sorted.filter(x => Math.abs(x - mid) <= 25), k = close.length ? close[0] : mid;
  (steps[k].guide = steps[k].guide || []).push({ title: o.title, text: o.text }); secPlaced++; paras += o.text.length; }
console.log('wiki walkthrough sections:', secs, '| shown in a step:', secPlaced, '(' + paras + ' paragraphs)');

// "meeting 2 of 5" for people who are met more than once
const meet = new Map(); steps.forEach(s => { for (const i of s.m) if (L[i][3] === 'NPCs') { const k = short(L[i][4]); if (!meet.has(k)) meet.set(k, []); meet.get(k).push(s); } });
for (const l of meet.values()) { const u = [...new Set(l)]; if (u.length > 1) u.forEach((s, n) => { if (s.card != null && L[s.card][3] === 'NPCs' && !/meeting/.test(s.region)) s.region = `${s.region} · meeting ${n + 1} of ${u.length}`; }); }

const ids = new Set(); for (const s of steps) { while (ids.has(s.id)) s.id += '+'; ids.add(s.id); s.x = +s.x.toFixed(5); s.y = +s.y.toFixed(5); }
fs.writeFileSync('app/data/route.json', JSON.stringify(steps));

// report
const inSteps = new Map(); steps.forEach(s => [...s.m, ...s.n].forEach(i => inSteps.set(i, (inSteps.get(i) || 0) + 1)));
const gAll = L.map((_, i) => i).filter(i => kind(i) === 'g'), gOwn = gAll.filter(i => steps.some(s => s.m.includes(i))).length;
const sizes = steps.map(s => s.m.filter(i => kind(i) === 'g' && !dropOf.has(i)).length), nearby = steps.map(s => s.n.filter(i => kind(i) === 'g' && !dropOf.has(i)).length);
const R = [
  `Redmaw route: ${steps.length} steps (${steps.filter(s => s.game === 'base').length} base game, ${steps.filter(s => s.game === 'dlc').length} expansion) from ${stats.lines} lines of the sheet.`,
  `Links in the sheet: ${stats.links}; things matched to a map marker: ${stats.matched}, of these ${stats.plain} from names the sheet says without a link.`,
  `Markers: ${L.length}; in exactly one step: ${[...inSteps.values()].filter(v => v === 1).length}; in none: ${L.length - inSteps.size}; in more than one: ${[...inSteps.values()].filter(v => v > 1).length}.`,
  `Second-chance matches (name linked by the sheet, step close by): ${rescued}.`,
  `Objectives (bosses, people, items): ${gAll.length}; named by the sheet and placed in its order: ${gOwn}; not named, attached to the nearest step: ${leftG}.`,
  `Objectives per step: largest own list ${Math.max(...sizes)}, steps with more than 5 of their own: ${sizes.filter(n => n > 5).length}; largest "nearby" list ${Math.max(...nearby)}, steps with more than 6 nearby: ${nearby.filter(n => n > 6).length}.`,
  `Steps with the wiki's detailed place text: ${steps.filter(s => s.place).length}. Missable steps: ${steps.filter(s => s.miss).length}.`,
  '', 'Objectives attached to a step that is far away (over 0.08 of the map):', ...far.slice(0, 80).map(x => '  - ' + x),
];
fs.writeFileSync('data/redmaw-report.txt', R.join('\n')); console.log(R.slice(0, 6).join('\n')); console.log('far away:', far.length);
