// Downloads the wiki's own page for every place in the game and keeps its detailed walkthrough, notes, picture and
// the names it links to (its items, characters and bosses).
// Places = every page a walkthrough section links to that is a place on the map or names the section, PLUS every
// "Locations" marker on the four maps, so places the overview walkthrough never mentions are covered too.
//   raw/places/<slug>.html : the saved pages (cache; a page is never fetched twice, missing pages are remembered)
//   data/places.json       : { "<slug>": { title, href, walk: [paragraphs, "## heading"], notes: [], img, links: [names] } }
//   app/walk/place-<slug>.jpg
// Usage: node tools/fetch-places.mjs      (polite: one page per 700 ms)
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => (s || '').replace(/\s+/g, ' ').replace(/\[\s*(Elden Ring )?Map (Coordinates|Link)[^\]]*\]/gi, '').replace(/(You can )?Click HERE for the map'?s coordinates\.?/gi, '').trim();
export const slugOf = href => decodeURIComponent(href.replace(/^\//, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
fs.mkdirSync('raw/places', { recursive: true }); fs.mkdirSync('app/walk', { recursive: true });

const hrefs = new Map(); // slug -> [href, text]
const add = (href, text) => { const s = slugOf(href); if (s && !hrefs.has(s)) hrefs.set(s, [href, text]); };
for (const f of ['walkthrough-base.json', 'walkthrough-dlc.json']) for (const s of JSON.parse(fs.readFileSync('data/' + f, 'utf8'))) {
  const title = s.title.toLowerCase(), cats = {};
  for (const l of s.markers || []) cats[l.text] = l.hits.map(h => h.cat);
  for (const l of s.links || []) {
    if (!l.href || !l.href.startsWith('/') || l.href.includes(':')) continue;
    const isPlace = (cats[l.text] || []).includes('Locations'), named = l.text.length > 4 && title.includes(l.text.toLowerCase());
    if (isPlace || named) add(l.href.split('#')[0], l.text);
  }
}
const fromWalk = hrefs.size;
for (const m of ['overland', 'underground', 'ashen', 'shadow']) for (const k of JSON.parse(fs.readFileSync(`data/map-${m}.json`, 'utf8')).markers) {
  if (k.cat !== 'Locations') continue;
  const t = k.title.replace(/<[^>]+>/g, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim(); if (t.length < 3) continue;
  add('/' + encodeURIComponent(t).replace(/%20/g, '+'), t);
}
console.log(hrefs.size, 'place pages:', fromWalk, 'from the walkthrough,', hrefs.size - fromWalk, 'more from map locations');

const out = {}; let fetched = 0, cached = 0, missing = 0, withWalk = 0, pics = 0;
for (const [slug, [href, text]] of hrefs) {
  const file = `raw/places/${slug}.html`, gone = `raw/places/${slug}.missing`;
  if (fs.existsSync(gone)) { missing++; continue; }
  let html;
  if (fs.existsSync(file)) { html = fs.readFileSync(file, 'utf8'); cached++; }
  else {
    try { const r = await fetch('https://eldenring.wiki.fextralife.com' + href, { headers: { 'User-Agent': UA } }); if (r.status === 404) { fs.writeFileSync(gone, ''); missing++; await sleep(700); continue; } if (!r.ok) throw new Error(r.status); html = await r.text(); fs.writeFileSync(file, html); fetched++; }
    catch (e) { console.log('FAILED', href, e.message); await sleep(700); continue; }
    await sleep(700);
  }
  const $ = cheerio.load(html), root = $('#mw-content-text').length ? $('#mw-content-text') : $('#wiki-content-block').length ? $('#wiki-content-block') : $('body');
  const walk = [], notes = []; let mode = null, sectioned = false;
  root.find('h2, h3, h4, p, li').each((_, el) => {
    const name = el.tagName.toLowerCase(), t = clean($(el).text());
    if (name === 'h2' || name === 'h3') {
      // Two page styles. Caves and ruins: one "Walkthrough for X" heading. Legacy dungeons: a "Full X Walkthrough" heading
      // followed by one heading per part of the dungeon, which all belong to the walkthrough until the summary lists start.
      const stop = /video|speed ?run|trivia|\bmaps?\b|\bguide\b|lore|gallery|npcs|merchants|bosses|all items|^items|enemies|creatures|general information/i.test(t);
      if (/walkthrough/i.test(t) && !/video|speed ?run/i.test(t)) { mode = walk; sectioned = name === 'h2'; }
      else if (/\bnotes\b/i.test(t)) { mode = notes; sectioned = false; }
      else if (mode === walk && sectioned && name === 'h3' && !stop && t.length > 2) walk.push('## ' + t);
      else { mode = null; sectioned = false; }
      return;
    }
    if (!mode || !t || t.length < 3) return;
    if (name === 'p' && $(el).parents('li').length) return;
    if (name === 'li' && $(el).find('li').length) return;
    if (/^(click|see|video|\[)/i.test(t) && t.length < 60) return;
    if (name === 'h4') { mode.push('## ' + t); return; }
    if (!mode.includes(t)) mode.push(t);
  });
  // every name the page links to: its item lists, characters, bosses and whatever the walkthrough mentions
  const links = [...new Set(root.find('a').map((_, a) => clean($(a).text())).get().filter(t => t.length > 2 && t.length < 70))];
  let img = null;
  const src = root.find('img').map((_, e) => $(e).attr('src') || $(e).attr('data-src') || '').get().find(s => /fextralifeimages\.com\/file\//.test(s) && !/map|icon|_\d{2,3}px/i.test(s.split('/').pop()));
  if (src) {
    const name = `place-${slug}.jpg`;
    if (fs.existsSync('app/walk/' + name)) img = name;
    else if (!fs.existsSync('app/walk/.skip-' + name)) try {
      const full = src.replace(/\/thumb\/(.+?\.(?:png|jpe?g|webp))\/[^/]+$/i, '/$1');
      const r = await fetch(full, { headers: { 'User-Agent': UA, Referer: 'https://eldenring.wiki.fextralife.com/' } }); if (!r.ok) throw new Error(r.status);
      const buf = Buffer.from(await r.arrayBuffer()), meta = await sharp(buf).metadata();
      if (meta.width >= 360) { await sharp(buf).flatten({ background: '#1F1D17' }).resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile('app/walk/' + name); img = name; }
      else fs.writeFileSync('app/walk/.skip-' + name, '');
      await sleep(250);
    } catch (e) { console.log('no picture for', href, e.message); }
  }
  if (walk.length) withWalk++; if (img) pics++;
  out[slug] = { title: (clean($('h1').first().text()) || text).replace(/\s*\|.*$/, '').trim() || text, href, walk: walk.slice(0, 400), notes: notes.slice(0, 20), img, links };
}
fs.writeFileSync('data/places.json', JSON.stringify(out));
console.log(`fetched ${fetched}, cached ${cached}, no such page ${missing}; ${withWalk} pages have a walkthrough, ${pics} have a picture`);
