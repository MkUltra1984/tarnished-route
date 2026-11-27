// Parses a saved Fextralife walkthrough page into ordered sections and links them to map markers.
// Usage: node tools/parse-walkthrough.mjs raw/walkthrough.html base
import fs from 'node:fs';
import * as cheerio from 'cheerio';

const [file = 'raw/walkthrough.html', tag = 'base'] = process.argv.slice(2);
const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
const root = $('#wiki-content-block').length ? $('#wiki-content-block') : $('body');

// marker index from every extracted map
const maps = ['overland', 'underground', 'ashen', 'shadow'].filter(n => fs.existsSync(`data/map-${n}.json`));
const byTitle = new Map();
const norm = s => s.toLowerCase().replace(/&amp;/g, '&').replace(/[‘’`]/g, "'").replace(/\s+/g, ' ').trim();
for (const n of maps) {
  const d = JSON.parse(fs.readFileSync(`data/map-${n}.json`, 'utf8'));
  for (const m of d.markers) { const k = norm(m.title); if (!byTitle.has(k)) byTitle.set(k, []); byTitle.get(k).push({ map: n, id: m.id, cat: m.cat, x: m.x, y: m.y }); }
}

const STOP = /^(search|popular wikis|follow us|.* videos?|video walkthrough|.* trivia|.* maps?|.* guide|.* lore video|npcs in .*|bosses in .*|items in .*|enemies in .*|.* helpful links|.* route map|.* legacy dungeons walkthrough)$/i;
const sections = [];
let cur = null;
const flush = () => { if (cur && (cur.text.length || cur.links.length)) sections.push(cur); cur = null; };
root.find('h2, h3, p, li').each((_, el) => {
  const $el = $(el), name = el.tagName.toLowerCase();
  if (name === 'h2' || name === 'h3') {
    flush();
    const title = $el.text().replace(/\s+/g, ' ').trim();
    if (!title || STOP.test(title)) { cur = null; return; }
    cur = { i: sections.length, level: name, title, text: [], links: [] };
    return;
  }
  if (!cur) return;
  if (name === 'p' && $el.parents('li').length) return;
  if (name === 'li' && $el.find('li').length) return;
  const t = $el.text().replace(/\s+/g, ' ').trim();
  if (t.length > 2) cur.text.push(t);
  $el.find('a.wiki_link, a[href^="/"]').each((__, a) => {
    const text = $(a).text().replace(/\s+/g, ' ').trim(), href = $(a).attr('href') || '';
    if (!text || /^(file|#)/i.test(href)) return;
    if (!cur.links.some(l => l.text === text)) cur.links.push({ text, href });
  });
});
flush();

let linked = 0, total = 0;
for (const s of sections) {
  s.markers = [];
  for (const l of s.links) {
    total++;
    const hit = byTitle.get(norm(l.text));
    if (hit) { linked++; l.m = hit.map(h => h.map + ':' + h.id); s.markers.push({ text: l.text, hits: hit }); }
  }
}
fs.writeFileSync(`data/walkthrough-${tag}.json`, JSON.stringify(sections));
console.log(`${tag}: sections ${sections.length}, links ${total}, links matching a map marker ${linked}`);
console.log(sections.slice(0, 12).map(s => `${s.i} [${s.level}] ${s.title} | paras ${s.text.length} | links ${s.links.length} | markers ${s.markers.length}`).join('\n'));
const cats = {};
for (const s of sections) for (const m of s.markers) { const c = m.hits[0].cat; cats[c] = (cats[c] || 0) + 1; }
console.log('marker mentions by category:', JSON.stringify(cats));
