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

const MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8'));
MK.list = MK.list.filter(a => a[6] !== 'rm');
if (MK.drops) for (const b of Object.keys(MK.drops)) { MK.drops[b] = MK.drops[b].filter(i => i < MK.list.length); if (+b >= MK.list.length || !MK.drops[b].length) delete MK.drops[b]; }   // and without the set parts an earlier run hung on them   // without the objectives an earlier run of this tool added (see "sheet-only" below)
const L = MK.list;
// Things the sheet has you obtain that the wiki's map has no marker for (gestures, rewards people hand over, a few
// weapons and sets): tools/sheet-only.mjs has looked up what each is. They become objectives of the step that obtains them.
const SHEET_ONLY = fs.existsSync('data/sheet-only.json') ? JSON.parse(fs.readFileSync('data/sheet-only.json', 'utf8')) : {};
const PLACES = JSON.parse(fs.readFileSync('data/places.json', 'utf8'));
const kind = i => L[i][3] === 'Sites of Grace' ? 'p' : MK.cats[L[i][3]].kind, mapOf = i => MK.maps[L[i][0]];   // inside this tool a site of grace is a place; the app lists it to be ticked
const plain = t => t.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const norm = s => plain(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const strip = t => { let p; t = plain(t); do { p = t; t = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').replace(/\s+[A-Z]$/, '').replace(/\s*-?\s*\d+x\b.*$/, '').trim(); } while (t !== p); return t; };
const short = t => { let p, x = plain(t); do { p = x; x = x.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').trim(); } while (x !== p); return x; };
const DROPS = MK.drops || {}, dropOf = new Map(); for (const b in DROPS) for (const i of DROPS[b]) dropOf.set(i, +b);

// Complete lists. Redmaw's item sheets (weapons, armor, talismans, spells, ashes, key items, miscellaneous) name every
// thing 100% needs. Whatever has no marker by now (bought from merchants, dropped by ordinary enemies, starting gear,
// remembrance trades) starts as a thing to tick that has no place on the map (map -1). Further down, a line of the walkthrough that
// names it gives it a place and a step; a merchant who sells it gives it the merchant's place.
let listOnly = 0;
{ const have = new Set(); L.forEach(m => { for (const k of [norm(strip(m[4])), norm(m[4]), norm(strip(m[4]).replace(/^ash of war: /i, '')), norm(strip(m[4]).split(',')[0])]) have.add(k); });
  const sets = [...have].filter(k => k.endsWith('set')).map(k => k.slice(0, -3)), hash = t => { let h = 2166136261; for (const c of t) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  for (const [file, cat] of [['weapons', 'Weapons'], ['armor', 'Armor'], ['talismans', 'Talismans'], ['spells', 'Spells'], ['ashes', null], ['key-items', 'Key Items'], ['miscellaneous-items', 'Key Items']]) {
    const f = 'raw/redmaw/' + file + '.html'; if (!fs.existsSync(f)) continue; const $ = cheerio.load(fs.readFileSync(f, 'utf8'));
    $('input[type=checkbox]').each((_, box) => { const li = $(box).closest('li').clone(); li.find('ul,ol').remove(); const a = li.find('a[href*="wiki.gg"]').first(); if (!a.length) return;
      const t = plain(a.text()).replace(/\s+x\d+$/i, ''), k = norm(t); if (t.length < 3 || t.length > 70 || /^coming soon/i.test(t)) return;
      if (have.has(k) || have.has(norm(strip(t))) || have.has(k + 'set') || have.has(k + 'ashes') || have.has('ashofwar' + k) || (file === 'armor' && sets.some(x => x.length >= 6 && k.startsWith(x)))) return;
      const c = cat || (/^ash of war/i.test(t) ? 'Ashes of War' : 'Spirit Ashes'), gesture = file === 'miscellaneous-items' && $(box).closest('ul,ol').prevAll('h3,h4').first().text().toLowerCase().includes('gesture');
      have.add(k); L.push([-1, +hash(c + ':' + t).toFixed(9), 0, c, gesture ? t + ' (Gesture)' : t, '', 'rm', 'list']); listOnly++; }); } }
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
const allLines = [], madeNew = new Set();
// places as they stand in running text ("... she left at Stormhill Shack"): they say where a line is, better than
// the spot of the line before, which may be far away after a fast travel
const placeNames = (() => { const m = new Map(); L.forEach((x, i) => { if (kind(i) !== 'p' || !['Locations', 'Sites of Grace'].includes(x[3])) return; const k = short(x[4]).toLowerCase(); if (k.replace(/[^a-z]/g, '').length < 8) return; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return [...m.entries()].filter(e => e[1].length <= 2).sort((p, q) => q[0].length - p[0].length); })();
const DROPPED = /dropped by|drops? from|after defeating|upon defeat|upon defeating|reward for defeating|by defeating/i, KILL = /\b(kill|kills|killing|defeat|defeating|slay|invade|beat|fight)\b/i;
let added = 0, fromLists = 0;
const used = new Set(), steps = [], stats = { lines: 0, links: 0, matched: 0, plain: 0 };
// objective names as they would stand in running text (lower case, at least 7 letters, longest first)
const plainNames = (() => { const m = new Map(); L.forEach((x, i) => { if (kind(i) !== 'g') return; const k = strip(x[4]).toLowerCase(); if (k.replace(/[^a-z]/g, '').length < 7) return; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return [...m.entries()].sort((p, q) => q[0].length - p[0].length); })();
const KIND = { 'NPCs': 'Talk to ', 'NPC Invaders': 'Invader: ', 'Bosses': 'Boss: ' };

for (const [file, game, maps] of [['walkthrough', 'base', ['overland', 'underground', 'ashen']], ['dlc-walkthrough', 'dlc', ['shadow']]]) {
  const $ = cheerio.load(fs.readFileSync(`raw/redmaw/${file}.html`, 'utf8'));
  let cur = null;   // where the walkthrough currently is: the last thing it named
  const recent = [];   // the last lines of the sheet, as context for names that many markers share
  const dist = i => cur && cur.map === mapOf(i) ? Math.hypot(L[i][1] - cur.x, L[i][2] - cur.y) : 5;
  $('h3').each((_, h3) => {
    const region = plain($(h3).clone().children('button, span').remove().end().text()).replace(/\s*\d+\/\d+$/, '');
    const list = $(h3).nextAll('ul, ol').first(); if (!list.length) return;
    let pending = [];   // lines since the last step
    const sectionSteps = [];
    const close = () => {
      if (!pending.length) return;
      // objectives without a marker on the wiki's map: a marker of their own, at the spot of the step
      { const spot = pending.flatMap(l => l.marks)[0], here = spot != null ? { m: L[spot][0], x: L[spot][1], y: L[spot][2] } : cur ? { m: MK.maps.indexOf(cur.map), x: cur.x, y: cur.y } : { m: MK.maps.indexOf(maps[0]), x: 0.5, y: 0.5 }; let k = 0;
        for (const l of pending) for (const f of l.fresh || []) { k++; const px = +(here.x + 0.0007 * k).toFixed(5), py = +(here.y + 0.0004 * k).toFixed(5);
          if (f.idx != null) { const m = L[f.idx]; m[0] = here.m; m[1] = px; m[2] = py; m[5] = l.text; m[7] = 'sheet'; l.marks.push(f.idx); fromLists++; continue; }
          const i = L.length; L.push([here.m, px, py, f.cat, f.gesture ? f.name + ' (Gesture)' : f.name, l.text, 'rm']); used.add(i); l.marks.push(i); added++; } }
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
      const st = { id: `rm:${pending[pending.length - 1].id}`, game, region, title, ...at, text, miss, boss: g.some(i => L[i][3] === 'Bosses'), m: marks, n: [], imgs: [], place, card: g[0] ?? null, optional: pending.every(l => l.optional) || undefined, lines: pending.map(l => ({ text: l.text, marks: l.marks })), links: pending.flatMap(l => l.links || []) };
      if (!st.links.length) delete st.links;
      for (const l of pending) { l.step = st; allLines.push(l); }
      steps.push(st); sectionSteps.push(st); pending = [];
    };
    list.find('input[type=checkbox]').each((_, box) => {
      // a line of the sheet is the entry itself, without the sub-entries nested inside it (they are lines of their own)
      const li = $(box).closest('li').clone(); li.find('ul, ol').remove(); const id = $(box).attr('id'); stats.lines++;
      const missEl = li.find('.missable').first(), miss = missEl.length ? (missEl.attr('data-tooltip') || 'This can be lost for the rest of the playthrough.') : (li.find('.badge').filter((_, b) => /missable/i.test($(b).text())).length ? 'This can be lost for the rest of the playthrough.' : null);
      const optional = li.find('.badge').filter((_, b) => /optional/i.test($(b).text())).length > 0;
      const body = li.clone(); body.find('.badge').remove(); const trophy = li.find('.badge').filter((_, b) => /\u{1F3C6}/u.test($(b).text())).length > 0;
      const text = (optional ? 'Optional: ' : '') + plain(body.text()) + (trophy ? ' (This earns an achievement.)' : ''), low = text.toLowerCase();
      const linksOut = li.find('a').map((_, a) => { const h = $(a).attr('href') || ''; return /youtu\.?be/.test(h) ? { t: 'Video: ' + plain($(a).text()), href: h } : /^\/images\//.test(h) ? { t: 'Picture: ' + plain($(a).text()), href: 'https://eldenring.redmaw.dev' + h } : null; }).get().filter(Boolean);
      const marks = [], fresh = [], note = /^\s*(note|tip|warning)\b/i.test(text);
      const MENTION = /\b(needs?|requires?|requiring|using|use|used|uses|bought|buy|sells?|sold|give|giving|offer|spend|equip|equipped|without|instead of|such as|die to|avoid|avoiding|ignore|skip|run past|sneak past|if you (?:have|picked|chose))\b(?:\s+(?:a|an|the|your|his|her|their|him|them|two|three|both|some|one|\d+))*\s*$/i;
      const foe = i => L[i][3] === 'Bosses' || L[i][3] === 'NPC Invaders';
      const take = pick => { used.add(pick); marks.push(pick); stats.matched++; cur = { map: mapOf(pick), x: L[pick][1], y: L[pick][2] }; for (const d of DROPS[pick] || []) if (!used.has(d)) { used.add(d); marks.push(d); } };
      // 1. the names the line links
      const todo = [];
      li.find('a').each((_, a) => { stats.links++; const href = decodeURIComponent((($(a).attr('href') || '').match(/wiki\.gg\/wiki\/([^#?]+)/) || [, ''])[1]).replace(/_/g, ' ');
        const c = lookup($(a).text()) || (href && lookup(href)) || lookupPerson($(a).text()) || (href && lookupPerson(href));
        if (!c && !note) { const nm = plain($(a).text()).replace(/\s+x\d+$/i, ''), so = SHEET_ONLY[nm]; if (so && so.cat && !madeNew.has(nm)) { const html = $.html(li), at = html.indexOf($.html(a)), before = plain(html.slice(0, at)).split(/[.;!?]\s/).pop() || ''; if (!MENTION.test(before)) { madeNew.add(nm); fresh.push({ name: nm, cat: so.cat, gesture: so.gesture }); } } }
        if (c && !note) { const lo = c.filter(i => L[i][0] < 0 && !used.has(i)), placed = c.filter(i => L[i][0] >= 0 && !used.has(i) && maps.includes(mapOf(i)));
          if (lo.length && !placed.length) { const html = $.html(li), at = html.indexOf($.html(a)), before = plain(html.slice(0, at)).split(/[.;!?]\s/).pop() || '';
            if (!MENTION.test(before) || /\b(buy|buying|bought|purchase|purchasing)\b[^,]*$/i.test(before)) { used.add(lo[0]); fresh.push({ idx: lo[0] }); } return; } }
        if (!c || note) return;
        // Redmaw prints enemies in red: only a red name can be a boss or invader to defeat, and a red name is nothing to pick up
        const red = /\bred\b/.test($(a).attr('class') || '');
        // a name that is only mentioned (something to use, give, buy or need) is not a pick-up
        const html = $.html(li), at = html.indexOf($.html(a)), before = plain(html.slice(0, at)).split(/[.;!?]\s/).pop() || ''; if (MENTION.test(before)) return;
        if (red && /\b(past|around|away from|behind|near|next to|beside|below|above|under|beneath|towards?|in front of|guarded by|guarding|patrolled by|between)(?:\s+(?:the|a|an|two|three|four|several|some|both))?\s*$/i.test(before)) return;
        const free = c.filter(i => !used.has(i) && maps.includes(mapOf(i)) && (red ? foe(i) || L[i][3] === 'NPCs' : !foe(i))); if (free.length) todo.push({ c, free, red, n: Math.min(6, +(($(a).text().match(/sx(d+)$/i) || [, 1])[1])) }); });
      // a thing the wiki says is dropped by someone is only meant by a line that speaks of a fight
      if (!KILL.test(text)) for (const t of todo) if (!t.red) t.free = t.free.filter(i => !DROPPED.test(plain(L[i][5] || '')) || t.c.length === 1);
      // a boss's drop can only be meant where the line also names that boss ("receive a Talisman Pouch" from someone is not Godfrey's)
      for (const t of todo) t.free = t.free.filter(i => !dropOf.has(i) || todo.some(o => o.c.includes(dropOf.get(i))) || low.includes(short(L[dropOf.get(i)][4]).toLowerCase().split(/[ ,]/)[0]));
      // names that can only mean one marker first: they say where the line is (after a fast travel, too)
      const anchors = []; for (const [name, list2] of placeNames) { const p = low.indexOf(name); if (p < 0) continue; for (const i of list2) if (maps.includes(mapOf(i))) anchors.push({ map: mapOf(i), x: L[i][1], y: L[i][2] }); }
      // where the line is: the places and unique things it names; only without any of these, where the line before was
      const near = i => anchors.length ? Math.min(...anchors.map(a => a.map === mapOf(i) ? Math.hypot(L[i][1] - a.x, L[i][2] - a.y) : 5)) : dist(i);
      for (const t of todo) { if (!t.free.length) { t.done = true; continue; } if (t.free.length !== 1 || t.c.length > 1) continue; const i = t.free[0]; if (used.has(i)) continue; t.done = true; take(i); anchors.push({ map: mapOf(i), x: L[i][1], y: L[i][2] }); }
      // a drop named in the line points at its boss ("kill the Deathbird for Blue-Feathered Branchsword")
      for (const t of todo) { if (t.done || !t.red) continue; const viaDrop = t.free.find(b => (DROPS[b] || []).some(d => marks.includes(d) || todo.some(o => o !== t && o.c.includes(d)))); if (viaDrop != null && !used.has(viaDrop)) { t.done = true; take(viaDrop); anchors.push({ map: mapOf(viaDrop), x: L[viaDrop][1], y: L[viaDrop][2] }); } }
      // Of several markers with one name: the wiki's markers usually carry their place in the name ("Stonesword Key -
      // Stormhill Shack", "Golden Seed (Ordina Liturgical Town)"). A marker whose place is spoken of in this stretch of
      // the sheet (the section title, the last lines, this line) is the one meant; among those, and where no place
      // helps, the nearest to where the line is. Too far away without such a hint is a mention, not a pick-up.
      const ctx = (region + ' . ' + recent.join(' . ') + ' . ' + text).toLowerCase();
      const hintOf = i => { const t = plain(L[i][4]), m = t.match(/\(([^)]+)\)\s*$/) || t.match(/\s+-\s+(.+)$/); if (!m) return null; const h = m[1].replace(/^\d+x\s*/i, '').replace(/\s*\([A-Z]\)$/, '').trim().toLowerCase(); return h.replace(/[^a-z]/g, '').length >= 6 ? h : null; };
      const says = i => { const h = hintOf(i); if (!h) return 0; if (ctx.includes(h)) return 2; const w = h.split(/[^a-z']+/).filter(x => x.length >= 6 && !GENERIC.has(x)); return w.length && w.every(x => ctx.includes(x)) ? 1 : 0; };
      for (const t of todo) { if (t.done) continue; const free = t.free.filter(i => !used.has(i)); if (!free.length) continue;
        const pick = free.sort((p, q) => (says(q) - says(p)) || (near(p) - near(q)))[0], d = near(pick), sure = says(pick);
        // a marker of another place is not meant when the line's own place is known and differs
        if (!sure && t.c.length >= 3 && free.some(i => says(i)) ) continue;
        if (t.c.length >= 3 && d > (sure ? 0.25 : 0.04)) continue; if (t.c.length === 2 && d > (sure ? 0.4 : 0.15)) continue; if (d > 4 && kind(pick) !== 'g' && t.c.length > 1) continue;
        // a named place that contradicts: the nearest marker says "X - Caelid" while the section is somewhere else entirely
        if (!sure && t.c.length >= 3 && hintOf(pick) && d > 0.02 && free.length > 1) { const other = free.filter(i => i !== pick && !hintOf(i) && near(i) <= 0.04).sort((p, q) => near(p) - near(q))[0]; if (other != null && near(other) < d + 0.01) { take(other); anchors.push({ map: mapOf(other), x: L[other][1], y: L[other][2] }); continue; } }
        take(pick); anchors.push({ map: mapOf(pick), x: L[pick][1], y: L[pick][2] });
        if (kind(pick) === 'g') for (let q = 1; q < t.n; q++) { const more = t.free.filter(i => !used.has(i) && mapOf(i) === mapOf(pick) && Math.hypot(L[i][1] - L[pick][1], L[i][2] - L[pick][2]) < 0.02).sort((a, b) => Math.hypot(L[a][1] - L[pick][1], L[a][2] - L[pick][2]) - Math.hypot(L[b][1] - L[pick][1], L[b][2] - L[pick][2]))[0]; if (more == null) break; take(more); } }
      // 2. names the line says without linking them: only things that are right here
      const linked = new Set(li.find('a').map((_, a) => norm($(a).text().replace(/s+xd+$/i, ''))).get());
      if (!note && cur) for (const [name, list2] of plainNames) { const p = low.indexOf(name); if (p < 0 || linked.has(norm(name))) continue; if (p > 0 && /[a-z]/.test(low[p - 1]) || /[a-z]/.test(low[p + name.length] || '')) continue;
        if (MENTION.test(text.slice(0, p).split(/[.;!?]\s/).pop() || '')) continue;
        const free = list2.filter(i => !used.has(i) && maps.includes(mapOf(i)) && !marks.includes(i) && !dropOf.has(i) && (KILL.test(text) || !DROPPED.test(plain(L[i][5] || '')))); if (!free.length) continue; const pick = free.sort((a, b) => near(a) - near(b))[0]; if (near(pick) > 0.03) continue;
        if (foe(pick) && (!KILL.test(text) || /(past|around|behind|near|next to|beside|guarded by|guarding|towards?|in front of|between)( the| a| an| two)?s*$/i.test(text.slice(0, p)))) continue;   // an enemy named in passing is a landmark
        take(pick); stats.plain++; }
      recent.push(text); if (recent.length > 6) recent.shift();
      const count = new Map(); li.find('a').each((_, a) => { const t = $(a).text(), k = norm(t.replace(/s+xd+$/i, '')), n = +((t.match(/sx(d+)$/i) || [, 1])[1]); count.set(k, (count.get(k) || 0) + Math.min(n, 6)); });
      pending.push({ id, text, marks, miss, optional, links: linksOut, count, names: new Set(li.find('a').map((_, a) => norm($(a).text().replace(/s+xd+$/i, ''))).get()), red: new Set(li.find('a.red').map((_, a) => norm($(a).text())).get()), note });
      pending[pending.length - 1].fresh = fresh;
      if (marks.some(i => kind(i) === 'g') || fresh.length) close();
    });
    // what is left at the end of a section belongs to its last step
    if (pending.length && sectionSteps.length) { const last = sectionSteps[sectionSteps.length - 1]; for (const l of pending) { l.step = last; allLines.push(l); last.lines.push({ text: l.text, marks: l.marks }); if ((l.links || []).length) last.links = [...(last.links || []), ...l.links]; last.text.push(l.text); for (const i of l.marks) if (!last.m.includes(i)) last.m.push(i); if (l.miss) last.miss = (last.miss ? last.miss + ' ' : '') + l.miss; } pending = []; } else close();
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
    // (Counted only. Swapping was tried and did harm: after a fast travel the steps around a pick are far away by nature, and the swap then replaced a right pick by one near the previous spot.)
    if (better && better[0] + 0.02 < mine && better[0] < 0.04) swapped++; else lonely++; } });
for (const st of steps) { const lead = st.m.find(i => kind(i) === 'g' && !dropOf.has(i)) ?? st.m[0]; if (lead != null && (st.card == null || !st.m.includes(st.card))) { st.card = kind(lead) === 'g' ? lead : null; } if (lead != null) { st.map = mapOf(lead); st.x = L[lead][1]; st.y = L[lead][2]; } }
console.log('same-named picks far from the steps around them:', swapped + lonely, '(of these', swapped, 'have a same-named free marker nearer to those steps; not changed)');

// Second chance for objectives the first pass left out although the sheet links their name (the walkthrough had
// travelled, so "the nearest one" was not the right one, or the line read like a mention): each goes to the nearest
// step whose line names it, if that step is close to the thing on the map.
let rescued = 0;
L.forEach((m, i) => { if (m[0] < 0 || used.has(i) || kind(i) !== 'g' || dropOf.has(i)) return; const keys = new Set([norm(strip(m[4])), norm(m[4]), norm(strip(m[4]).replace(/^ash of war: /i, ''))]), foe = m[3] === 'Bosses' || m[3] === 'NPC Invaders';
  let best = null, bd = 0.06; for (const l of allLines) { if (l.note || !l.step || l.step.map !== mapOf(i) || (l.step.game === 'dlc') !== (mapOf(i) === 'shadow')) continue; const lt = l.norm || (l.norm = norm(l.text)); const hit = [...keys].find(k => l.names.has(k)) || [...keys].find(k => k.length >= 9 && lt.includes(k)); if (!hit || (l.names.has(hit) && foe !== l.red.has(hit))) continue; if (!foe && DROPPED.test(plain(m[5] || '')) && !KILL.test(l.text)) continue;
    { const have = l.step.m.filter(j => j !== i && nameKey(j) === nameKey(i)).length, may = Math.max(1, ...allLines.filter(x => x.step === l.step).map(x => x.count.get(hit) || 0)); if (have >= may) continue; }
    const d = Math.min(Math.hypot(l.step.x - m[1], l.step.y - m[2]), ...l.step.m.map(j => mapOf(j) === mapOf(i) ? Math.hypot(L[j][1] - m[1], L[j][2] - m[2]) : 5)); if (d < bd) { bd = d; best = l.step; } }
  if (!best) return; best.m.push(i); used.add(i); rescued++; for (const d of DROPS[i] || []) if (!used.has(d)) { used.add(d); best.m.push(d); } });
// markers the sheet never names: to the nearest step on their map, as "nearby, on the way"
let leftG = 0, leftOther = 0; const far = [], extras = [];
const byMap = new Map(); steps.forEach(s => { if (!byMap.has(s.map)) byMap.set(s.map, []); byMap.get(s.map).push(s); });
const isDlc = i => mapOf(i) === 'shadow';
L.forEach((m, i) => { if (m[0] < 0 || used.has(i)) return;
  if (dropOf.has(i)) { const s = steps.find(x => x.m.includes(dropOf.get(i)) || x.n.includes(dropOf.get(i))); if (s) { s.m.includes(dropOf.get(i)) ? s.m.push(i) : s.n.push(i); used.add(i); return; } }
  const pool = (byMap.get(mapOf(i)) || []).filter(s => (s.game === 'dlc') === isDlc(i)); if (!pool.length) { far.push(m[4]); return; }
  let best = null, bd = 9; for (const s of pool) { const d = Math.hypot(s.x - m[1], s.y - m[2]); if (d < bd) { bd = d; best = s; } }
  // a person, invader or boss the sheet does not name still gets a step of its own, right behind the nearest step
  if (KIND[m[3]]) { const st = { id: 'rm:extra:' + i, game: best.game, region: best.region.replace(/ · meeting.*$/, ''), title: KIND[m[3]] + nameOf(i), map: mapOf(i), x: m[1], y: m[2], text: [plain(m[5] || '')].filter(t => t.length > 3), miss: null, boss: m[3] === 'Bosses', m: [i], n: [], imgs: [], place: null, card: i, extra: 1 };
    extras.push([best, st]); used.add(i); leftG++; return; }
  best.n.push(i); used.add(i); if (kind(i) === 'g') leftG++; else leftOther++; if (bd > 0.08 && kind(i) === 'g') far.push(`${m[4]} (${bd.toFixed(2)} from "${best.title}")`); });
for (const [after, st] of extras) steps.splice(steps.indexOf(after) + 1, 0, st);
// Merchants. Redmaw's merchants sheet says who sells what, and for how much. A thing from the lists that nobody has
// placed yet and that a merchant sells gets the merchant's spot, "Sold by ...", and is listed in the step where that
// merchant is met ("Sold here"), without counting as open: you buy when you can afford it.
let sold = 0, soldNoStep = 0;
if (fs.existsSync('raw/redmaw/merchants.html')) { const $ = cheerio.load(fs.readFileSync('raw/redmaw/merchants.html', 'utf8'));
  $('h3').each((_, h3) => { const h = $(h3).clone(); h.find('button').remove(); const place = plain(h.find('.secondary').text()).replace(/^\(|\)$/g, ''); h.find('.secondary').remove(); const name = plain(h.text()); if (!name) return;
    const ALIAS = { 'Knight Bernahl': 'Bernahl', 'Nomadic Merchant|Weeping Peninsula': 'Nomadic Merchant Castle Morne Rampart', 'Nomadic Merchant|South Liurnia': 'Nomadic Merchant Liurnia of the Lakes', 'Nomadic Merchant|North Liurnia': 'Nomadic Merchant North Liurnia of the Lakes',
      'Nomadic Merchant|North Caelid': 'Wandering Merchant Caelid Highway North', 'Nomadic Merchant|South Caelid': 'Nomadic Merchant Caelid South', 'Nomadic Merchant|Altus Plateau': 'Nomadic Merchant West Altus Plateau', 'Hermit Merchant|Capital Outskirts': 'Hermit Merchant',
      'Hermit Merchant|Mountaintops of the Giants': 'Hermit Merchant Mountaintops East', 'Abandoned Merchant': 'Wandering Merchant Siofra River', 'Count Ymir, High Priest': 'Count Ymir', 'Isolated Merchant|Weeping Peninsula': 'Isolated Merchant' };
    const al = ALIAS[name + '|' + place] || ALIAS[name], exact = al ? L.map((m, i) => i).filter(i => L[i][3] === 'NPCs' && plain(L[i][4]) === al) : null;
    const who = exact && exact.length ? exact : lookup(name + ' ' + place) || lookup(name) || lookupPerson(name), npc = who ? who.filter(i => L[i][3] === 'NPCs' && L[i][0] >= 0) : [];
    const hold = /^(Twin Maiden Husks|Finger Reader Enia|Brother Corhyn)$/.test(name) ? steps.find(x => (x.lines || []).some(l => /roundtable hold/i.test(l.text)) && x.m.length) : null;
    const st = hold || (npc.length ? steps.find(x => x.m.some(i => npc.includes(i))) || steps.find(x => x.n.some(i => npc.includes(i))) : null), at = st ? (npc.find(i => st.m.includes(i) || st.n.includes(i)) ?? st.m[0]) : null;
    let k = 0; $(h3).nextAll('ul, ol').first().find('input[type=checkbox]').each((_, box) => { const li = $(box).closest('li').clone(); li.find('ul,ol').remove(); const a = li.find('a[href*="wiki.gg"]').first(); if (!a.length) return;
      const c = lookup(a.text()); const i = c && c.find(j => L[j][0] < 0 && !used.has(j)); if (i == null) return;
      const price = plain(li.text()).split(':').slice(1).join(':').trim(), cond = plain($(box).closest('ul,ol').parent('li').clone().children('ul,ol').remove().end().text());
      L[i][5] = 'Sold by ' + name + (hold ? ' in the Roundtable Hold' : place && !/remembrances|equipment/i.test(place) ? ' (' + place + ')' : '') + (price ? ' for ' + price : '') + '.' + (cond && cond.length < 200 ? ' ' + cond.replace(/:$/, '.') : '');
      used.add(i); if (st) { k++; L[i][0] = L[at][0]; L[i][1] = +(L[at][1] + 0.0006 * (k % 9)).toFixed(5); L[i][2] = +(L[at][2] + 0.0006 * Math.floor(k / 9) + 0.0006).toFixed(5); L[i][7] = 'sold'; (st.sell = st.sell || []).push(i); sold++; } else soldNoStep++; }); }); }
// The rest of the complete lists: armour pieces and weapons that ordinary enemies drop, starting gear. Neither the
// walkthrough nor the merchants sheet places them; the wiki's page of each thing does (app/data/cards.json):
//  a. an armour piece whose set is in a step is part of that set: ticked with it, like a boss's drops;
//  b. otherwise the first place the wiki's "where to find" text names puts it into the step that holds that place,
//     as "found or farmed around here" (it does not hold the step open: a 2% drop is not an errand);
//  c. what names no place stays in the Collection with the wiki's sentence.
let asPart = 0, farmed = 0, noPlace = 0;
if (fs.existsSync('app/data/cards.json')) { const CARDS = JSON.parse(fs.readFileSync('app/data/cards.json', 'utf8')), pageOf = i => CARDS.pages[CARDS.by[L[i][4]]] || null;
  const setAt = new Map(); L.forEach((m, i) => { if (m[0] >= 0 && m[3] === 'Armor' && / Set\b/.test(m[4])) { const k = norm(plain(m[4]).replace(/\s*\(.*$/, '').replace(/\s+-\s+.*$/, '')); if (!setAt.has(k)) setAt.set(k, i); } });
  const spots = []; L.forEach((m, i) => { if (m[0] >= 0 && ['Locations', 'Sites of Grace'].includes(m[3])) { const k = plain(m[4]).replace(/\s*\(.*$/, '').toLowerCase(); if (k.replace(/[^a-z]/g, '').length >= 8) spots.push([k, i]); } });
  const holderOf = i => steps.find(x => x.m.includes(i) || x.n.includes(i)); const perStep = new Map();
  L.forEach((m, i) => { if (m[0] >= 0 || used.has(i)) return; const page = pageOf(i), where = page ? page.where.filter(t => !/can be found at( the following location)?s?:?\s*$/i.test(t) && !/^where to find/i.test(t)) : [];
    const sentence = where.slice(0, 2).join(' ').slice(0, 300);
    const si = page && page.set ? setAt.get(norm(page.set)) : null, sh = si != null ? holderOf(si) : null;
    if (sh) { (DROPS[si] = DROPS[si] || []).push(i); dropOf.set(i, si); m[0] = L[si][0]; m[1] = L[si][1]; m[2] = +(L[si][2] + 0.0003 * DROPS[si].length).toFixed(5); m[5] = 'Part of the ' + page.set + '.' + (sentence ? ' ' + sentence : ''); m[7] = 'part'; (sh.m.includes(si) ? sh.m : sh.n).push(i); used.add(i); asPart++; return; }
    const low = where.join(' ').toLowerCase(); let best = null, at = 1e9; for (const [k, p] of spots) { const q = low.indexOf(k); if (q >= 0 && (q < at || (q === at && k.length > best[0].length))) { at = q; best = [k, p]; } }
    const st = best ? holderOf(best[1]) : null;
    if (st) { const n = (perStep.get(st) || 0) + 1; perStep.set(st, n); m[0] = L[best[1]][0]; m[1] = +(L[best[1]][1] + 0.0006 * (n % 8)).toFixed(5); m[2] = +(L[best[1]][2] - 0.0006 - 0.0006 * Math.floor(n / 8)).toFixed(5); m[5] = sentence; m[7] = 'farm'; (st.farm = st.farm || []).push(i); used.add(i); farmed++; return; }
    if (sentence && !m[5]) m[5] = sentence; noPlace++; }); }
console.log('rest of the lists: part of a set in a step', asPart, '| found or farmed at a place of a step', farmed, '| no place named', noPlace);

// ---------- making the steps fit together ----------
const holder = i => steps.find(x => x.m.includes(i) || x.n.includes(i)), takeOut = (st, i) => { st.m = st.m.filter(k => k !== i); st.n = st.n.filter(k => k !== i); };
// a. A boss and its drops are one thing. A step that holds a drop pulls in the boss when the boss was only "nearby"
//    somewhere or had a small step of its own; otherwise the drop goes to the boss's step.
let joined = 0;
for (const st of [...steps]) for (const d of [...st.m, ...st.n]) { if (!dropOf.has(d)) continue; const b = dropOf.get(d); if (st.m.includes(b)) { if (st.n.includes(d)) { takeOut(st, d); st.m.push(d); } continue; }
  const hb = holder(b); if (!hb) continue;
  if (st.m.includes(d) && (hb.extra || hb.n.includes(b))) { takeOut(hb, b); st.m.unshift(b); for (const o of DROPS[b]) { const ho = holder(o); if (ho && ho !== st) { takeOut(ho, o); st.m.push(o); } } joined++; }
  else if (hb !== st) { takeOut(st, d); (hb.m.includes(b) ? hb.m : hb.n).push(d); joined++; } }
for (let k = steps.length - 1; k >= 0; k--) if (steps[k].extra && !steps[k].m.length) { const gone = steps[k]; steps.splice(k, 1); if (steps[k - 1]) steps[k - 1].n.push(...gone.n); }
// b. One step, one spot: an objective of a step that lies far from the step's main thing (or on another map) becomes a
//    step of its own right behind it.
let split = 0; const ownG = st => st.m.filter(i => kind(i) === 'g' && !dropOf.has(i));
for (let k = 0; k < steps.length; k++) { const st = steps[k]; if (st.extra) continue; const g = ownG(st); if (g.length < 2) continue; const lead = g[0];
  for (const i of g.slice(1)) { const d = mapOf(i) === mapOf(lead) ? Math.hypot(L[i][1] - L[lead][1], L[i][2] - L[lead][2]) : 9; if (d <= 0.06) continue;
    const along = [i, ...(DROPS[i] || []).filter(o => st.m.includes(o))]; st.m = st.m.filter(x => !along.includes(x));
    steps.splice(k + 1, 0, { id: 'rm:split:' + i, game: st.game, region: st.region, title: '', map: mapOf(i), x: L[i][1], y: L[i][2], text: [], miss: null, boss: false, m: along, n: [], imgs: [], place: null, card: i, extra: 1, lines: (st.lines || []).filter(l => l.marks.includes(i)).map(l => ({ text: l.text, marks: l.marks.filter(x => along.includes(x)) })) }); split++; } }
// c. A person is met in the order of the wiki's numbered places ("First Location", "Second Location"). Where two steps
//    hold them the wrong way round, the two markers change places if both still lie close to their new step;
//    a small inserted step is moved behind the earlier meeting instead.
const ORD = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, sixth: 6, '6th': 6, seventh: 7, eight: 8, eighth: 8, final: 99, last: 99 };
const ordOf = i => { const m = L[i][4].match(/\(?(first|second|third|fourth|fifth|sixth|seventh|eighth?|final|last|\d(?:st|nd|rd|th))\s+location\)?/i); return m ? ORD[m[1].toLowerCase()] : null; };
let reordered = 0, stillWrong = 0;
// Steps the sheet itself gives stay where they are. A small inserted step (a place of the person the sheet does not
// name) is moved, in the order of the numbers, so that it comes after the meeting before it: behind the step nearest
// to it on the map among the steps that follow that meeting.
{ const people = new Map(); steps.forEach(st => { for (const i of st.m) if (L[i][3] === 'NPCs' && ordOf(i) != null) { const n = short(L[i][4]); if (!people.has(n)) people.set(n, []); people.get(n).push({ i, st }); } });
  for (const list of people.values()) { list.sort((p, q) => ordOf(p.i) - ordOf(q.i)); let floor = -1;
    for (const { i, st } of list) { let k = steps.indexOf(st);
      if (k < floor && st.extra && ownG(st).length === 1) { let best = floor, bd = 9; for (let q = floor; q < steps.length; q++) { const x = steps[q]; if (x.map !== st.map) continue; const d = Math.hypot(x.x - st.x, x.y - st.y); if (d < bd) { bd = d; best = q; } }
        steps.splice(k, 1); steps.splice(best, 0, st); k = steps.indexOf(st); st.region = steps[k - 1] ? steps[k - 1].region.replace(/ · meeting.*$/, '') : st.region; reordered++; }
      floor = Math.max(floor, k); } } }
{ const seen = new Map(); steps.forEach(st => { for (const i of st.m) if (L[i][3] === 'NPCs' && ordOf(i) != null) { const n = short(L[i][4]), p = seen.get(n); if (p != null && p > ordOf(i)) stillWrong++; else seen.set(n, ordOf(i)); } }); }
// d. Titles and words, from what each step finally holds.
const sameShort = new Map(); L.forEach((m, i) => { if (kind(i) !== 'g') return; const k = norm(short(m[4])); sameShort.set(k, (sameShort.get(k) || 0) + 1); });
const whereOf = i => { const t = plain(L[i][4]), m = t.match(/\(([^)]+)\)\s*$/) || t.match(/\s+-\s+(.+)$/); return m && !/^(\d+x|[A-Z]|\d+)$/.test(m[1].trim()) && !/location|quest|gesture|boss|spectral|npc/i.test(m[1]) ? m[1].trim() : null; };
const labelOf = i => { const b = (KIND[L[i][3]] || '') + nameOf(i); return KIND[L[i][3]] && sameShort.get(norm(short(L[i][4]))) > 1 && whereOf(i) ? `${b} (${whereOf(i)})` : b; };
for (const st of steps) { st.m = [...new Set(st.m)]; st.n = [...new Set(st.n)].filter(i => !st.m.includes(i)); const g = ownG(st), shown = g.length ? g : st.m.filter(i => kind(i) === 'g');
  const names = shown.map(labelOf); let title = names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') : st.region.replace(/ · meeting.*$/, '');
  if (title.length > 58 && names.length > 1) title = names[0] + ` +${names.length - 1}`; st.title = title;
  // the words: Redmaw's line says where to go and what to do; under it the wiki's note for each thing the line names
  const text = [], said = new Set(), noted = new Set(), note = i => { const d = plain(L[i][5] || ''); if (kind(i) === 'p' || d.length <= 12 || noted.has(i) || L[i][6] === 'rm') return; noted.add(i); const t = `${nameOf(i)}: ${d}`; if (!said.has(t)) { said.add(t); text.push(t); } };
  for (const l of st.lines || []) { if (l.text && !said.has(l.text)) { said.add(l.text); text.push(l.text); } for (const i of l.marks) if (st.m.includes(i)) note(i); }
  for (const i of st.m) if (kind(i) === 'g') note(i);
  st.text = text.length ? text : st.text; delete st.lines;
  const lead = g[0] ?? st.m[0]; if (lead != null) { st.map = mapOf(lead); st.x = L[lead][1]; st.y = L[lead][2]; st.card = kind(lead) === 'g' ? lead : null; }
  st.boss = st.m.some(i => L[i][3] === 'Bosses'); if (st.optional === undefined) delete st.optional; }
// e. Where a step is far from the one before (the walkthrough travelled), it says which site of grace is nearest.
const graces = L.map((m, i) => i).filter(i => L[i][3] === 'Sites of Grace'); let hints = 0;
steps.forEach((st, k) => { const p = steps[k - 1]; if (!p) return; const d = p.map === st.map ? Math.hypot(p.x - st.x, p.y - st.y) : 9; if (d <= 0.1) return;
  let best = null, bd = 0.05; for (const i of graces) { if (mapOf(i) !== st.map) continue; const q = Math.hypot(L[i][1] - st.x, L[i][2] - st.y); if (q < bd) { bd = q; best = i; } }
  if (best != null) { st.travel = plain(L[best][4]); hints++; } });
console.log(`fitting: boss/drop joined ${joined}, far objectives split off ${split}, meetings put in order ${reordered} (still out of order: ${stillWrong}), travel hints ${hints}`);


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

for (const s of steps) delete s.lines;
const ids = new Set(); for (const s of steps) { while (ids.has(s.id)) s.id += '+'; ids.add(s.id); s.x = +s.x.toFixed(5); s.y = +s.y.toFixed(5); }
fs.writeFileSync('app/data/route.json', JSON.stringify(steps));
MK.cats['Sites of Grace'].kind = 'g';   // the app lists every site of grace to be ticked
fs.writeFileSync('app/data/markers.json', JSON.stringify(MK));
console.log('things from the complete lists:', listOnly, '| given a step by a line of the walkthrough:', fromLists, '| sold by a merchant met in a step:', sold, '| sold by a merchant without a step:', soldNoStep, '| still without a place:', L.filter(m => m[0] < 0).length);
console.log('objectives added from the sheet (no marker on the wiki map):', added, '| sites of grace named by a step:', steps.reduce((n, st) => n + st.m.filter(i => L[i][3] === 'Sites of Grace').length, 0), 'of', L.filter(m => m[3] === 'Sites of Grace').length);

// report
const inSteps = new Map(); steps.forEach(s => [...s.m, ...s.n, ...(s.sell || []), ...(s.farm || [])].forEach(i => inSteps.set(i, (inSteps.get(i) || 0) + 1)));
const gAll = L.map((_, i) => i).filter(i => kind(i) === 'g'), gOwn = gAll.filter(i => steps.some(s => s.m.includes(i))).length;
const sizes = steps.map(s => s.m.filter(i => kind(i) === 'g' && !dropOf.has(i)).length), nearby = steps.map(s => s.n.filter(i => kind(i) === 'g' && !dropOf.has(i)).length);
const R = [
  `Redmaw route: ${steps.length} steps (${steps.filter(s => s.game === 'base').length} base game, ${steps.filter(s => s.game === 'dlc').length} expansion) from ${stats.lines} lines of the sheet.`,
  `Links in the sheet: ${stats.links}; things matched to a map marker: ${stats.matched}, of these ${stats.plain} from names the sheet says without a link.`,
  `Markers with a place: ${L.filter(m => m[0] >= 0).length}; in exactly one step: ${[...inSteps.values()].filter(v => v === 1).length}; in none: ${L.filter(m => m[0] >= 0).length - inSteps.size}; in more than one: ${[...inSteps.values()].filter(v => v > 1).length}.`,
  `Second-chance matches (name linked by the sheet, step close by): ${rescued}.`,
  `Objectives (bosses, people, items): ${gAll.length}; named by the sheet and placed in its order: ${gOwn}; not named, attached to the nearest step: ${leftG}.`,
  `Objectives per step: largest own list ${Math.max(...sizes)}, steps with more than 5 of their own: ${sizes.filter(n => n > 5).length}; largest "nearby" list ${Math.max(...nearby)}, steps with more than 6 nearby: ${nearby.filter(n => n > 6).length}.`,
  `Steps with the wiki's detailed place text: ${steps.filter(s => s.place).length}. Missable steps: ${steps.filter(s => s.miss).length}.`,
  '', 'Objectives attached to a step that is far away (over 0.08 of the map):', ...far.slice(0, 80).map(x => '  - ' + x),
];
fs.writeFileSync('data/redmaw-report.txt', R.join('\n')); console.log(R.slice(0, 6).join('\n')); console.log('far away:', far.length);
