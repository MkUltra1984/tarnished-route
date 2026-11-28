// Things Redmaw's sheet has you obtain that the wiki's map has no marker for (most gestures, rewards handed over by
// people, some weapons and sets). For each name this looks up the wiki's page once and reads what kind of thing it is,
// so tools/build-route-redmaw.mjs can add it as an objective of the step that obtains it.
//   data/sheet-only.json : { "<name>": { cat: "<category of the app>" | null, gesture: true|false, page: "<wiki page>" | null } }
// Materials, ammunition and consumables get cat null: they are not objectives.
// Usage: node tools/sheet-only.mjs      (polite: one page per 700 ms; pages are cached in raw/cards)
import fs from 'node:fs';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8')), L = MK.list.filter(a => a[6] !== 'rm');
const plain = t => t.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim(), norm = s => plain(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const strip = t => { let p; t = plain(t); do { p = t; t = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').replace(/\s+[A-Z]$/, '').replace(/\s*-?\s*\d+x\b.*$/, '').trim(); } while (t !== p); return t; };
const names = new Set(); L.forEach(m => { for (const k of [norm(strip(m[4])), norm(m[4]), norm(strip(m[4]).replace(/^ash of war: /i, '')), norm(strip(m[4]).split(',')[0])]) names.add(k); });
const words = new Set(); L.forEach(m => { if (['NPCs', 'NPC Invaders', 'Bosses'].includes(m[3])) strip(m[4]).toLowerCase().split(/[^a-z']+/).forEach(w => w.length >= 4 && words.add(w)); });
export const GET = /\b(pick up|picks? up|grab|obtain|obtaining|receive|learn|loot|collect|acquire|get|find|for|containing|contains|with|holding|rewards?|gives? you|earn|unlock)\b[^.;]*$/i;

const found = new Map();
for (const f of ['walkthrough', 'dlc-walkthrough']) {
  const $ = cheerio.load(fs.readFileSync(`raw/redmaw/${f}.html`, 'utf8'));
  $('input[type=checkbox]').each((_, box) => {
    const li = $(box).closest('li').clone(); li.find('ul,ol').remove(); const html = $.html(li);
    li.find('a').each((_, a) => {
      const t = plain($(a).text()).replace(/\s+x\d+$/i, ''), href = $(a).attr('href') || '';
      if (!/wiki\.gg/.test(href) || /\bred\b/.test($(a).attr('class') || '')) return;
      if (names.has(norm(t)) || names.has(norm(t.replace(/s$/, ''))) || t.toLowerCase().split(/[^a-z']+/).some(w => words.has(w))) return;
      const at = html.indexOf($.html(a)), before = plain(html.slice(0, at)).split(/[.;!?]\s/).pop() || '', after = plain(html.slice(at + $.html(a).length)).slice(0, 12);
      const gesture = /^\s*gesture/i.test(after); if (!gesture && !GET.test(before)) return;
      if (!found.has(t)) found.set(t, { gesture, page: decodeURIComponent((href.match(/wiki\/([^#?]+)/) || [, ''])[1]).replace(/_/g, ' ') });
    });
  });
}

const TYPE = [
  [/\bpuppet\b/i, 'Spirit Ashes'], [/\bset$/i, 'Armor'],
  [/\b(crafting material|material|consumable|arrow|bolt|greatarrow|ammunition|grease|pot\b|aromatic|dart|stone clump|cured meat|liver|moss|butterfly|fulgurbloom|bud\b|egg\b|fragment|innards)/i, null],
  [/\btalisman/i, 'Talismans'], [/\bash(es)? of war/i, 'Ashes of War'], [/\b(sorcery|sorceries|incantation|spell)/i, 'Spells'], [/\bspirit ash|spirit summon|\bashes\b|puppet/i, 'Spirit Ashes'],
  [/\b(armor set|armor|helm|chest armor|gauntlets|leg armor|greaves|\bset\b|robe|mask|hood|crown)/i, 'Armor'], [/\b(greatshield|shield)/i, 'Shields'],
  [/\b(key item|bell bearing|cookbook|letter|tool|info item|multiplayer item|whistle|medallion|map\b|crystal tear|remembrance|great rune|note\b|painting|key\b|prayerbook|scroll|shackle|needle|blessing|tonic|invitation|clue|riddle|tongue)/i, 'Key Items'],
  [/\b(weapon|sword|greatsword|katana|dagger|axe|greataxe|hammer|spear|halberd|bow|crossbow|ballista|seal|staff|claw|fist|whip|flail|torch|rapier|scythe|twinblade|glaive|sling|pata|lance|club|reaper|longbow)/i, 'Weapons'],
];
const kindOf = text => { for (const [re, cat] of TYPE) if (re.test(text)) return cat; return undefined; };
const slugOf = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
fs.mkdirSync('raw/cards', { recursive: true });
const out = {}; let fetched = 0;
for (const [name, e] of found) {
  if (e.gesture) { out[name] = { cat: 'Key Items', gesture: true, page: 'Gestures' }; continue; }
  let cat = kindOf(name), page = null;   // the name itself often says it ("... Talisman", "Ash of War: ...", "... Set")
  if (cat === undefined) for (const n of [name, e.page].filter(Boolean)) {
    const f = `raw/cards/${slugOf(n)}.html`; let html = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    if (!html) { try { const r = await fetch('https://eldenring.wiki.fextralife.com/' + encodeURIComponent(n).replace(/%20/g, '+'), { headers: { 'User-Agent': UA } }); await sleep(700); if (!r.ok) continue; html = await r.text(); fs.writeFileSync(f, html); fetched++; } catch { continue; } }
    const $ = cheerio.load(html), intro = $('#mw-content-text p').map((_, p) => plain($(p).text())).get().find(t => t.length > 40 && / is an? | are /i.test(t)) || '';
    const m = intro.match(/ (?:is|are) (?:an?|one of the|the)?\s*([^.]{3,80}?) (?:in|of) Elden Ring/i); cat = kindOf(m ? m[1] : intro.slice(0, 160)); page = n; if (cat !== undefined) break;
  }
  out[name] = { cat: cat === undefined ? null : cat, gesture: false, page };
}
fs.writeFileSync('data/sheet-only.json', JSON.stringify(out, null, 1));
const by = {}; for (const v of Object.values(out)) by[v.gesture ? 'gesture' : v.cat || 'not an objective'] = (by[v.gesture ? 'gesture' : v.cat || 'not an objective'] || 0) + 1;
console.log(Object.keys(out).length, 'names without a map marker;', JSON.stringify(by), '| pages fetched', fetched);
