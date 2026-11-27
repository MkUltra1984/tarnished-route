// Downloads the in-game item picture from each item's wiki page into assets/items/.
// Usage: node tools/fetch-item-art.mjs "Flail" "Whetstone Knife" ...   (polite: one page per 700 ms)
import fs from 'node:fs';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const names = process.argv.slice(2);
fs.mkdirSync('assets/items', { recursive: true });
const indexFile = 'assets/items/index.json';
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const name of names) {
  if (index[name]) { console.log('have', name); continue; }
  const url = 'https://eldenring.wiki.fextralife.com/' + name.split(' ').map(encodeURIComponent).join('+');
  try {
    const html = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
    const $ = cheerio.load(html);
    let src = $('.portable-infobox img').first().attr('src') || $('#infobox img').first().attr('src') || $('.infobox img').first().attr('src') || $('table.wiki_table img').first().attr('src');
    if (!src) { console.log('NO IMAGE', name); continue; }
    if (src.startsWith('/')) src = 'https://eldenring.wiki.fextralife.com' + src;
    const buf = Buffer.from(await (await fetch(src, { headers: { 'User-Agent': UA, Referer: url } })).arrayBuffer());
    const ext = (src.split('?')[0].match(/\.(png|jpg|jpeg|webp)$/i) || ['.png'])[0].toLowerCase();
    const file = slug(name) + ext;
    fs.writeFileSync('assets/items/' + file, buf);
    index[name] = file;
    console.log('ok', name, '->', file, buf.length, 'bytes');
  } catch (e) { console.log('FAILED', name, e.message); }
  await sleep(700);
}
fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
