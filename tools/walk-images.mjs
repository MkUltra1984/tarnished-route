// Collects the pictures that sit inside each section of the saved wiki walkthrough pages and downloads them for the app.
// Sections are found exactly as tools/parse-walkthrough.mjs finds them, so (index, title) matches data/walkthrough-*.json.
//   data/walk-images.json : { base: { "<i>|<title>": ["file.jpg", ...] }, dlc: {...} }
//   app/walk/<file>.jpg   : resized to at most 800 px wide
// Usage: node tools/walk-images.mjs      (downloads are cached; polite: one picture per 250 ms)
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const STOP = /^(search|popular wikis|follow us|.* videos?|video walkthrough|.* trivia|.* maps?|.* guide|.* lore video|npcs in .*|bosses in .*|items in .*|enemies in .*|.* helpful links|.* route map|.* legacy dungeons walkthrough)$/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('app/walk', { recursive: true });
const out = {}; let got = 0, had = 0, small = 0, failed = 0;

for (const [tag, file] of [['base', 'raw/walkthrough.html'], ['dlc', 'raw/Shadow_of_the_Erdtree_Walkthrough.html']]) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  const root = $('#wiki-content-block').length ? $('#wiki-content-block') : $('body');
  const sections = []; let cur = null;
  const flush = () => { if (cur && (cur.text || cur.links)) sections.push(cur); cur = null; };
  root.find('h2, h3, p, li, img').each((_, el) => {
    const $el = $(el), name = el.tagName.toLowerCase();
    if (name === 'h2' || name === 'h3') {
      flush();
      const title = $el.text().replace(/\s+/g, ' ').trim();
      if (!title || STOP.test(title)) { cur = null; return; }
      cur = { i: sections.length, title, text: 0, links: 0, imgs: [] }; return;
    }
    if (!cur) return;
    if (name === 'img') { const src = $el.attr('src') || $el.attr('data-src') || ''; if (/fextralifeimages\.com\/file\//.test(src) && !cur.imgs.includes(src)) cur.imgs.push(src); return; }
    if (name === 'p' && $el.parents('li').length) return;
    if (name === 'li' && $el.find('li').length) return;
    if ($el.text().replace(/\s+/g, ' ').trim().length > 2) cur.text++;
    if ($el.find('a.wiki_link, a[href^="/"]').length) cur.links++;
  });
  flush();
  out[tag] = {};
  for (const s of sections) {
    const files = [];
    for (let src of s.imgs) {
      // thumbnails look like .../thumb/a/ab/Name.png/300px-Name.png : ask for the full picture
      const full = src.replace(/\/thumb\/(.+?\.(?:png|jpe?g|webp))\/[^/]+$/i, '/$1');
      const name = decodeURIComponent(full.split('/').pop()).toLowerCase().replace(/\.(png|jpe?g|webp)$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) + '.jpg';
      if (fs.existsSync('app/walk/' + name)) { files.push(name); had++; continue; }
      if (fs.existsSync('app/walk/.skip-' + name)) { small++; continue; }
      try {
        const r = await fetch(full, { headers: { 'User-Agent': UA, Referer: 'https://eldenring.wiki.fextralife.com/' } });
        if (!r.ok) throw new Error(r.status);
        const buf = Buffer.from(await r.arrayBuffer()), meta = await sharp(buf).metadata();
        if (meta.width < 360) { fs.writeFileSync('app/walk/.skip-' + name, ''); small++; }   // item icons and buttons, not pictures
        else { await sharp(buf).flatten({ background: '#1F1D17' }).resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile('app/walk/' + name); files.push(name); got++; }
      } catch (e) { failed++; console.log('FAILED', full, e.message); }
      await sleep(250);
    }
    if (files.length) out[tag][s.i + '|' + s.title] = files;
  }
  console.log(tag, sections.length, 'sections,', Object.keys(out[tag]).length, 'with pictures');
}
fs.writeFileSync('data/walk-images.json', JSON.stringify(out));
const mb = fs.readdirSync('app/walk').filter(f => f.endsWith('.jpg')).reduce((a, f) => a + fs.statSync('app/walk/' + f).size, 0) / 1048576;
console.log(`downloaded ${got}, already had ${had}, skipped ${small} small, failed ${failed}; app/walk is ${mb.toFixed(1)} MB`);
