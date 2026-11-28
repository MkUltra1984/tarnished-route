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
const used = new Set(), steps = [], stats = { lines: 0, links: 0, matched: 0 };
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
      steps.push(st); sectionSteps.push(st); pending = [];
    };
    list.find('input[type=checkbox]').each((_, box) => {
      const li = $(box).closest('li'), id = $(box).attr('id'); stats.lines++;
      const missEl = li.find('.missable').first(), miss = missEl.length ? (missEl.attr('data-tooltip') || 'This can be lost for the rest of the playthrough.') : (li.find('.badge').filter((_, b) => /missable/i.test($(b).text())).length ? 'This can be lost for the rest of the playthrough.' : null);
      const optional = li.find('.badge').filter((_, b) => /optional/i.test($(b).text())).length > 0;
      const marks = [];
      li.find('a').each((_, a) => { stats.links++; const href = decodeURIComponent((($(a).attr('href') || '').match(/wiki\.gg\/wiki\/([^#?]+)/) || [, ''])[1]).replace(/_/g, ' ');
        const c = lookup($(a).text()) || (href && lookup(href)) || lookupPerson($(a).text()) || (href && lookupPerson(href)); if (!c) return;
        // Redmaw prints enemies in red: only a red name can be a boss or invader to defeat, and a red name is nothing to pick up
        const red = /\bred\b/.test($(a).attr('class') || ''), foe = i => L[i][3] === 'Bosses' || L[i][3] === 'NPC Invaders';
        // a name that is only mentioned (something to use, give, buy or need; a side note) is not a pick-up
        const html = $.html(li), at = html.indexOf($.html(a)), before = plain(html.slice(0, at)).split(/[.;!?]\s/).pop() || '';
        if (/^\s*(note|tip|warning)\b/i.test(plain(li.text()).replace(/^(optional|missable)\s*/i, '')) || /\b(needs?|requires?|requiring|using|use|used|uses|bought|buy|sells?|sold|give|giving|offer|spend|equip|equipped|without|instead of|such as|die to|avoid|avoiding|ignore|skip|run past|sneak past|if you (?:have|picked|chose))\b[^,]*$/i.test(before)) return;
        const free = c.filter(i => !used.has(i) && maps.includes(mapOf(i)) && (red ? foe(i) || L[i][3] === 'NPCs' : !foe(i))); if (!free.length) return;
        const pick = free.sort((p, q) => dist(p) - dist(q))[0];
        // a common name far from where the walkthrough is right now is probably a mention, not a pick-up
        // of many things with one name only one close to where the walkthrough is can be meant (0.04 of the map is about 330 px)
        if (c.length >= 3 && (!cur || dist(pick) > 0.04)) return;
        if (c.length === 2 && cur && dist(pick) > 0.15) return;
        if (!cur && kind(pick) !== 'g' && c.length > 1) return;
        used.add(pick); marks.push(pick); stats.matched++; cur = { map: mapOf(pick), x: L[pick][1], y: L[pick][2] };
        for (const d of DROPS[pick] || []) if (!used.has(d)) { used.add(d); marks.push(d); } });
      const body = li.clone(); body.find('.badge').remove(); const text = plain(body.text());
      pending.push({ id, text, marks, miss, optional });
      if (marks.some(i => kind(i) === 'g')) close();
    });
    // what is left at the end of a section belongs to its last step
    if (pending.length && sectionSteps.length) { const last = sectionSteps[sectionSteps.length - 1]; for (const l of pending) { last.text.push(l.text); for (const i of l.marks) if (!last.m.includes(i)) last.m.push(i); if (l.miss) last.miss = (last.miss ? last.miss + ' ' : '') + l.miss; } pending = []; } else close();
  });
}

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
  `Links in the sheet: ${stats.links}; matched to a map marker: ${stats.matched}.`,
  `Markers: ${L.length}; in exactly one step: ${[...inSteps.values()].filter(v => v === 1).length}; in none: ${L.length - inSteps.size}; in more than one: ${[...inSteps.values()].filter(v => v > 1).length}.`,
  `Objectives (bosses, people, items): ${gAll.length}; named by the sheet and placed in its order: ${gOwn}; not named, attached to the nearest step: ${leftG}.`,
  `Objectives per step: largest own list ${Math.max(...sizes)}, steps with more than 5 of their own: ${sizes.filter(n => n > 5).length}; largest "nearby" list ${Math.max(...nearby)}, steps with more than 6 nearby: ${nearby.filter(n => n > 6).length}.`,
  `Steps with the wiki's detailed place text: ${steps.filter(s => s.place).length}. Missable steps: ${steps.filter(s => s.miss).length}.`,
  '', 'Objectives attached to a step that is far away (over 0.08 of the map):', ...far.slice(0, 80).map(x => '  - ' + x),
];
fs.writeFileSync('data/redmaw-report.txt', R.join('\n')); console.log(R.slice(0, 6).join('\n')); console.log('far away:', far.length);
