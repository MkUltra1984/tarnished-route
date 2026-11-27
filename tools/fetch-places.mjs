// Downloads the wiki's own page for every place the walkthrough visits (caves, ruins, castles, ...) and keeps its
// detailed walkthrough, its notes and its location picture.
//   raw/places/<slug>.html : the saved pages (cache; a page is never fetched twice)
//   data/places.json       : { "<href>": { title, walk: [paragraphs], notes: [lines], img: "file.jpg" | null } }
//   app/walk/place-<slug>.jpg
// Usage: node tools/fetch-places.mjs      (polite: one page per 700 ms)
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => (s || '').replace(/\s+/g, ' ').replace(/\[\s*Map (Coordinates|Link)[^\]]*\]/gi, '').replace(/Click HERE for the map'?s coordinates\.?/gi, '').trim();
fs.mkdirSync('raw/places', { recursive: true }); fs.mkdirSync('app/walk', { recursive: true });

// which pages: links of walkthrough sections that point at a place on the map, or that the section is named after
const placeCats = new Set(['Locations']);
const hrefs = new Map();
for (const f of ['walkthrough-base.json', 'walkthrough-dlc.json']) for (const s of JSON.parse(fs.readFileSync('data/' + f, 'utf8'))) {
  const title = s.title.toLowerCase(), cats = {};
  for (const l of s.markers || []) cats[l.text] = l.hits.map(h => h.cat);
  for (const l of s.links || []) {
    if (!l.href || !l.href.startsWith('/') || l.href.includes(':')) continue;
    const isPlace = (cats[l.text] || []).some(c => placeCats.has(c)), named = l.text.length > 4 && title.includes(l.text.toLowerCase());
    if (isPlace || named) hrefs.set(l.href.split('#')[0], l.text);
  }
}
console.log(hrefs.size, 'place pages');

const out = {}; let fetched = 0, cached = 0, failed = 0, withWalk = 0, pics = 0;
for (const [href, text] of hrefs) {
  const slug = decodeURIComponent(href.slice(1)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80), file = `raw/places/${slug}.html`;
  let html;
  if (fs.existsSync(file)) { html = fs.readFileSync(file, 'utf8'); cached++; }
  else {
    try { const r = await fetch('https://eldenring.wiki.fextralife.com' + href, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error(r.status); html = await r.text(); fs.writeFileSync(file, html); fetched++; }
    catch (e) { failed++; console.log('FAILED', href, e.message); await sleep(700); continue; }
    await sleep(700);
  }
  const $ = cheerio.load(html), root = $('#mw-content-text').length ? $('#mw-content-text') : $('#wiki-content-block').length ? $('#wiki-content-block') : $('body');
  const walk = [], notes = []; let mode = null;
  root.find('h2, h3, h4, p, li').each((_, el) => {
    const name = el.tagName.toLowerCase(), t = clean($(el).text());
    if (name === 'h2' || name === 'h3') { mode = /walkthrough/i.test(t) && !/video/i.test(t) ? walk : /\bnotes\b/i.test(t) ? notes : null; return; }
    if (!mode || !t || t.length < 3) return;
    if (name === 'p' && $(el).parents('li').length) return;
    if (name === 'li' && $(el).find('li').length) return;
    if (/^(click|see|video|\[)/i.test(t) && t.length < 60) return;
    if (name === 'h4') { mode.push('## ' + t); return; }
    if (!mode.includes(t)) mode.push(t);
  });
  // the location picture: first real picture on the page that is not the little map
  let img = null;
  const src = root.find('img').map((_, e) => $(e).attr('src') || $(e).attr('data-src') || '').get().find(s => /fextralifeimages\.com\/file\//.test(s) && !/map|icon|_\d{2,3}px/i.test(s.split('/').pop()));
  if (src) {
    const name = `place-${slug}.jpg`;
    if (fs.existsSync('app/walk/' + name)) img = name;
    else try {
      const full = src.replace(/\/thumb\/(.+?\.(?:png|jpe?g|webp))\/[^/]+$/i, '/$1');
      const r = await fetch(full, { headers: { 'User-Agent': UA, Referer: 'https://eldenring.wiki.fextralife.com/' } }); if (!r.ok) throw new Error(r.status);
      const buf = Buffer.from(await r.arrayBuffer()), meta = await sharp(buf).metadata();
      if (meta.width >= 360) { await sharp(buf).flatten({ background: '#1F1D17' }).resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile('app/walk/' + name); img = name; }
      await sleep(250);
    } catch (e) { console.log('no picture for', href, e.message); }
  }
  if (walk.length) withWalk++; if (img) pics++;
  out[href] = { title: clean($('h1').first().text()) || text, walk: walk.slice(0, 60), notes: notes.slice(0, 20), img };
}
fs.writeFileSync('data/places.json', JSON.stringify(out));
console.log(`fetched ${fetched}, cached ${cached}, failed ${failed}; ${withWalk} pages have a walkthrough, ${pics} have a picture`);
