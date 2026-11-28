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
// page names to try for a marker, most likely first
const names = t => {
  const b = strip(plain(t)), out = [b];
  for (const sep of [' & ', ' / ', ' and ']) if (b.includes(sep)) out.push(...b.split(sep).reverse().map(x => x.trim()));
  if (plain(t) !== b) out.push(plain(t));
  return [...new Set(out)].filter(x => x.length > 2);
};
const want = MK.list.filter(m => MK.cats[m[3]].kind === 'g' && !['NPCs', 'NPC Invaders'].includes(m[3]));
const by = {}, pages = {};
let fetched = 0, none = 0, pics = 0;

async function page(name) {
  const f = `raw/cards/${slugOf(name)}.html`, gone = f.replace('.html', '.missing');
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
  const bad = s => !s || !/fextralifeimages\.com\/file\//.test(s) || /\d{2}px|icon|status_effect|currency|banner|logo/i.test(s.split('/').pop());
  const imgs = (boss && $('.infobox').length ? $('.infobox').first() : root).find('img').map((_, e) => $(e).attr('src') || $(e).attr('data-src') || '').get();
  out.src = imgs.find(s => !bad(s)) || null;
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
        : (/where to find/i.test(t) ? 'where' : /\beffect\b/i.test(t) ? 'effect' : null);
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
  if (!by[m[4]]) none++;
  if (k % 100 === 0) console.log(k, '/', uniq.length, '| fetched', fetched, 'pictures', pics, 'no page', none);
}
fs.writeFileSync('app/data/cards.json', JSON.stringify({ by, pages }));
console.log(`done: ${Object.keys(pages).length} pages for ${Object.keys(by).length} names (${none} names without a page); fetched ${fetched}, new pictures ${pics}; cards.json ${Math.round(fs.statSync('app/data/cards.json').size / 1024)} KB`);
