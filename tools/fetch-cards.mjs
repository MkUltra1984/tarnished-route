// Downloads the wiki's own page for every boss and every collectible and keeps what a card in the app shows:
// the picture, the key facts, and for bosses the fight strategy. Cached: a page is never fetched twice.
//   raw/cards/<slug>.html     saved pages (.missing = the wiki has no page under that name)
//   app/cards/<slug>.jpg|webp pictures (bosses 800 px wide, items 320 px with their transparent background)
//   app/data/cards.json       { by: { "<marker title>": "<page>" }, pages: { "<page>": { img, boss, facts, intro, where, strat } } }
// Usage: node tools/fetch-cards.mjs      (polite: one page per 700 ms)
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const slugOf = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const clean = s => (s || '').replace(/\s+/g, ' ').replace(/\[\s*(Elden Ring )?(Map|Video)( (Coordinates|Link|Location))?[^\]]*\]/gi, '').replace(/\bMap link\b/gi, '').replace(/\s+([.,;:])/g, '$1').trim();
fs.mkdirSync('raw/cards', { recursive: true });
fs.mkdirSync('app/cards', { recursive: true });

const MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8'));
const plain = t => t.replace(/<[^>]+>/g, ' ').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const strip = t => { let p; do { p = t; t = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').replace(/\s+[A-Z]$/, '').replace(/\s*-?\s*\d+x\b.*$/, '').trim(); } while (t !== p); return t; };
// raw/index/*.html: the wiki's list pages (Cookbooks, Bell Bearings, Bosses ...), saved by hand; every link text -> its page
const norm = x => x.toLowerCase().replace(/[^a-z0-9]/g, ''), ALIAS = new Map();
if (fs.existsSync('raw/index')) for (const f of fs.readdirSync('raw/index')) { const $ = cheerio.load(fs.readFileSync('raw/index/' + f, 'utf8'));
  $('#mw-content-text a[href^="/"]').each((_, a) => { const t = $(a).text().replace(/\s+/g, ' ').trim(), h = $(a).attr('href').split('#')[0]; if (t.length > 2 && !h.includes(':') && !ALIAS.has(norm(t))) ALIAS.set(norm(t), h); }); }
// page names to try for a marker, most likely first
const names = t => {
  const b = strip(plain(t)), out = [b];
  for (const sep of [' & ', ' / ', ' and ']) if (b.includes(sep)) out.push(...b.split(sep).reverse().map(x => x.trim()));
  if (plain(t) !== b) out.push(plain(t));
  // other spellings the wiki uses for the same page: without the "[3]", "the" in lower case, every word capitalised
  for (const x of [...out]) { out.push(x.replace(/\s*\[\d+\]$/, ''), x.replace(/, The /g, ', the '), x.replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Of|The|And|In)\b/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase())); }
  // the name without its place ("Imp Head (Lion) - Scorpion River Catacombs"), without a count ("Golden Vow x3"),
  // with the wiki's round brackets ("Cookbook (23)"), and a few kinds of thing the wiki files under another page
  const p = plain(t); out.push(p.replace(/\s+-\s+.*$/, ''), p.split(':')[0]);
  for (const x of [...out]) out.push(x.replace(/\s+x\d+$/, ''), x.replace(/\[(\d+)\]/, '($1)'), x.replace(/ Solution$/, ''), x.replace(/ Altar$/, ''), x.replace(/^"([^"]+)" Painting$/, '$1 Painting'));
  // the wiki's own index pages know the exact page of most names
  for (const x of [...out]) { const h = ALIAS.get(norm(x)); if (h) out.push(decodeURIComponent(h.slice(1)).replace(/_/g, ' ')); }
  if (/Turtle Marker/.test(p)) out.push("Chelona's Rise");
  if (p === 'Ghost Troll') out.push('Troll');
  for (const x of [...out]) if (x.includes('"')) out.push(x.replace(/"/g, ''));
  return [...new Set(out)].filter(x => x.length > 2);
};
// Things the wiki only describes in a list: the rows of its tables ("Name | Crafting Repertoire | Location") and the
// boxes of its Gestures page (picture, name, how to get it). Used when a thing has no page of its own or an empty one.
const ENTRY = new Map();
if (fs.existsSync('raw/index')) for (const f of fs.readdirSync('raw/index')) { const $ = cheerio.load(fs.readFileSync('raw/index/' + f, 'utf8')), root = $('#mw-content-text');
  const src = el => { const s = $(el).find('img').map((_, e) => $(e).attr('src') || $(e).attr('data-src') || '').get().find(x => /fextralifeimages\.com\/file\//.test(x) && !/Sote-new|[-_]\d{2}\.(png|webp)$/i.test(x)); return s || null; };
  root.find('table').each((_, tb) => { const head = $(tb).find('tr').first().find('th,td').map((_, c) => clean($(c).text())).get();
    $(tb).find('tr').slice(1).each((_, tr) => { const cells = $(tr).find('th,td'), name = clean(cells.first().text()); if (name.length < 3 || cells.length < 2 || ENTRY.has(norm(name))) return;
      const lines = cells.slice(1).map((i, c) => { const t = clean($(c).text()); return t.length > 1 ? (head[i + 1] ? head[i + 1] + ': ' : '') + t : null; }).get().filter(Boolean);
      if (lines.length) ENTRY.set(norm(name), { title: name, lines, src: src(tr), from: f.replace('.html', '').replace(/\+/g, ' ') }); }); });
  root.find('div[class*="col-"] > h4').each((_, h) => { const name = clean($(h).text()), box = $(h).parent(), t = clean(box.text()).slice(name.length).trim(); if (name.length < 3 || t.length < 8 || ENTRY.has(norm(name))) return;
    ENTRY.set(norm(name), { title: name, lines: [t], src: src(box), from: f.replace('.html', '').replace(/\+/g, ' ') }); }); }
const entryOf = t => { const p = plain(t); for (const x of [p, strip(p), p.replace(/\s+-\s+.*$/, ''), strip(p.replace(/\(?gesture\)?/i, '')), p.replace(/\s+-\s+.*$/, '').replace(/\(?gesture\)?/i, '')]) { const e = ENTRY.get(norm(x)); if (e) return e; } return null; };

const want = MK.list.filter(m => MK.cats[m[3]].kind === 'g' && !['NPCs', 'NPC Invaders', 'Sites of Grace'].includes(m[3]));
const by = {}, pages = {};
let fetched = 0, none = 0, pics = 0;

async function page(name) {
  const f = `raw/cards/${slugOf(name)}.html`, gone = `raw/cards/${slugOf(name)}.${Buffer.from(name).toString('hex').slice(-16)}.missing`;   // the wiki's names are case-sensitive, the cache file is not
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  if (fs.existsSync(gone)) return null;
  for (let tries = 0; tries < 3; tries++) {
    try {
      const r = await fetch('https://eldenring.wiki.fextralife.com/' + encodeURIComponent(name).replace(/%20/g, '+'), { headers: { 'User-Agent': UA } });
      await sleep(700);
      if (r.status === 404) { fs.writeFileSync(gone, ''); return null; }
      if (!r.ok) throw new Error(r.status);
      const h = await r.text(); fs.writeFileSync(f, h); fetched++; return h;
    } catch (e) { await sleep(3000); }
  }
  console.log('FAILED', name); return null;
}

async function picture(src, slug, boss) {
  const name = `${slug}.${boss ? 'jpg' : 'webp'}`;
  if (fs.existsSync('app/cards/' + name)) return name;
  if (fs.existsSync('app/cards/.skip-' + slug)) return null;
  try {
    const full = src.replace(/\/thumb\/(.+?\.(?:png|jpe?g|webp))\/[^/]+$/i, '/$1');
    const r = await fetch(full.startsWith('/') ? 'https://eldenring.wiki.fextralife.com' + full : full, { headers: { 'User-Agent': UA, Referer: 'https://eldenring.wiki.fextralife.com/' } });
    if (!r.ok) throw new Error(r.status);
    const buf = Buffer.from(await r.arrayBuffer()); await sleep(200);
    if (boss) await sharp(buf).flatten({ background: '#1F1D17' }).resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile('app/cards/' + name);
    else await sharp(buf).resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile('app/cards/' + name);
    pics++; return name;
  } catch (e) { fs.writeFileSync('app/cards/.skip-' + slug, ''); return null; }
}

function parse(html, boss) {
  const $ = cheerio.load(html), root = $('#mw-content-text'); if (!root.length) return null;
  const out = { title: clean($('h1').first().text()).replace(/\s*\|.*$/, ''), boss: boss ? 1 : 0, facts: [], intro: [], where: [], strat: [] };
  const bad = s => !s || !/fextralifeimages\.com\/file\//.test(s) || /(^|[^0-9])\d{2}px|[-_]\d{2}\.(png|webp|jpe?g)$|icon|status_effect|currency|runes|banner|logo|damage|upgrades/i.test(decodeURIComponent(s.split('/').pop()));
  const imgs = (boss && $('.infobox').length ? $('.infobox').first() : root).find('img').map((_, e) => $(e).attr('src') || $(e).attr('data-src') || '').get();
  const big = s => /fextralifeimages\.com\/file\//.test(s) && /(^|[^0-9])(1[5-9]\d|[2-9]\d\d)px/.test(decodeURIComponent(s.split('/').pop())) && !/\d\dpx_\d\dpx/.test(s);   // "..._200px.png" is the page's main picture, whatever else its name says
  out.src = (boss ? null : imgs.find(big)) || imgs.find(s => !bad(s)) || (boss ? root.find('img').map((_, e) => $(e).attr('src') || $(e).attr('data-src') || '').get().find(s => !bad(s)) : null) || null;
  let mode = null; const seen = new Set();
  const push = (arr, t, cap, max = 420) => { if (t.length > 2 && arr.length < cap && !arr.includes(t)) arr.push(t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + ' ...' : t); };
  root.find('h2,h3,h4,p,li').each((_, el) => {
    const tag = el.tagName.toLowerCase(), t = clean($(el).text());
    if (/^h/.test(tag)) {
      if (boss) {
        if (/melee|magic|ranged/i.test(t) && mode === 'strat') { push(out.strat, '## ' + t, 30); return; }
        if (/negations|absorptions|resistances/i.test(t) && (mode === 'combat' || mode === 'neg')) { mode = 'neg'; push(out.facts, '## ' + t.replace(/\s*\(or Absorptions\)/i, ''), 40); return; }
      }
      const key = boss ? (/fight strategy|^strategy|strategy tips|best tips/i.test(t) ? 'strat' : /combat information/i.test(t) ? 'combat' : tag === 'h3' && /boss(\s*\([^)]*\))? in elden ring/i.test(t) ? 'facts' : null)
        : (/where to find|\blocations? in elden ring|how to get/i.test(t) ? 'where' : /\beffect\b/i.test(t) ? 'effect' : null);
      if (key && seen.has(key)) { mode = null; return; }
      if (key) seen.add(key);
      mode = key; return;
    }
    if ($(el).parents('table').length) return;
    if (tag === 'p' && $(el).parents('li').length) return;
    if (tag === 'li' && $(el).find('li').length) return;
    if (!boss && !mode && tag === 'p' && !out.intro.length && t.length > 60 && / is an? | are /i.test(t)) { push(out.intro, t, 1, 600); return; }
    if (!mode || (/^(click|see|video)\b/i.test(t) && t.length < 80)) return;
    if (mode === 'strat') push(out.strat, t, 24, 520);
    else if (mode === 'facts' || mode === 'combat' || mode === 'neg') push(out.facts, t, 40, 240);
    else if (mode === 'where') push(out.where, t, 6);
    else if (mode === 'effect') push(out.intro, t, 4);
  });
  // a page written differently from the rest: its first real paragraph is still better than no card
  if (!out.src && !out.intro.length && !out.where.length && !out.facts.length && !out.strat.length) root.find('p').each((_, el) => { const t = clean($(el).text()); if (t.length > 60 && !$(el).parents('table').length) push(out.intro, t, 2, 600); });
  return out;
}

const uniq = [...new Map(want.map(m => [m[4] + '|' + (m[3] === 'Bosses'), m])).values()];
console.log(want.length, 'markers,', uniq.length, 'different names');
let k = 0;
for (const m of uniq) {
  const boss = m[3] === 'Bosses'; k++;
  for (const n of names(m[4])) {
    if (pages[n] && !!pages[n].boss === boss) { by[m[4]] = n; break; }
    const html = await page(n); if (!html) continue;
    const p = parse(html, boss); if (!p) continue;
    if (p.src) p.img = await picture(p.src, slugOf(n), boss);
    delete p.src;
    if (!p.img && !p.facts.length && !p.intro.length && !p.where.length && !p.strat.length) continue;
    pages[n] = p; by[m[4]] = n; break;
  }
  // no page of its own (or one without a picture): the wiki's list entry
  const e = entryOf(m[4]);
  if (e && !by[m[4]]) { const key = e.title + ' (' + e.from + ')'; if (!pages[key]) pages[key] = { title: e.title, boss: boss ? 1 : 0, facts: [], intro: e.lines, where: [], strat: [], img: e.src ? await picture(e.src, slugOf('entry-' + e.title), false) : null, list: e.from }; by[m[4]] = key; }
  else if (e && e.src && by[m[4]] && !pages[by[m[4]]].img) pages[by[m[4]]].img = await picture(e.src, slugOf('entry-' + e.title), false);
  if (!by[m[4]]) none++;
  if (k % 100 === 0) console.log(k, '/', uniq.length, '| fetched', fetched, 'pictures', pics, 'no page', none);
}
// v: the pictures' version. The app asks for cards/<file>?v=<v>; count it up after fetching pictures again, so that
// installed copies (which keep pictures for good) take the new ones.
const prevV = fs.existsSync('app/data/cards.json') ? (JSON.parse(fs.readFileSync('app/data/cards.json', 'utf8')).v || 1) : 1;
fs.writeFileSync('app/data/cards.json', JSON.stringify({ v: pics ? prevV + 1 : prevV, by, pages }));
console.log(`done: ${Object.keys(pages).length} pages for ${Object.keys(by).length} names (${none} names without a page); fetched ${fetched}, new pictures ${pics}; cards.json ${Math.round(fs.statSync('app/data/cards.json').size / 1024)} KB`);
