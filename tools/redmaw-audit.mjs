// Audit of the Redmaw route: which objectives the sheet did not place, and why.
//   node tools/redmaw-audit.mjs            summary + samples
import fs from 'node:fs'; import * as cheerio from 'cheerio';
const R = JSON.parse(fs.readFileSync('app/data/route.json', 'utf8')), MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8')), L = MK.list;
const kind = i => MK.cats[L[i][3]].kind, plain = t => t.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const norm = s => plain(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const strip = t => { let p; t = plain(t); do { p = t; t = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').replace(/\s+[A-Z]$/, '').replace(/\s*-?\s*\d+x\b.*$/, '').trim(); } while (t !== p); return t; };
const dropOf = new Map(); for (const b in MK.drops || {}) for (const i of MK.drops[b]) dropOf.set(i, +b);
// all link texts and the whole text of the sheets
const linkCount = new Map(); let sheetText = '';
for (const f of ['walkthrough', 'dlc-walkthrough']) { const $ = cheerio.load(fs.readFileSync(`raw/redmaw/${f}.html`, 'utf8')); $('li').each((_, li) => { sheetText += ' ' + norm($(li).text()); $(li).find('a').each((_, a) => { const k = norm($(a).text().replace(/\s+x\d+$/i, '')); linkCount.set(k, (linkCount.get(k) || 0) + 1); }); }); }
const total = new Map(); L.forEach((m, i) => { if (kind(i) !== 'g') return; const k = norm(strip(m[4])); total.set(k, (total.get(k) || 0) + 1); });
const own = new Set(); R.forEach(s => { if (!s.extra) s.m.forEach(i => own.add(i)); });
const why = { 'named in the sheet, but fewer times than the map has markers (the sheet groups several, or the map has duplicates)': [], 'the sheet uses the name, the matcher skipped it (mention filter, distance, or enemy colour)': [], 'the sheet says it in running text without a link': [], 'not in the sheet at all': [] };
L.forEach((m, i) => { if (kind(i) !== 'g' || own.has(i) || dropOf.has(i)) return; const k = norm(strip(m[4])), links = linkCount.get(k) || 0, have = total.get(k);
  const row = `${m[3]}: ${plain(m[4])}`;
  if (links && links < have) why[Object.keys(why)[0]].push(row); else if (links) why[Object.keys(why)[1]].push(row); else if (k.length >= 6 && sheetText.includes(k)) why[Object.keys(why)[2]].push(row); else why[Object.keys(why)[3]].push(row); });
let n = 0; for (const k in why) n += why[k].length; console.log('objectives not placed by the sheet itself:', n);
for (const k in why) { const cat = {}; why[k].forEach(r => { const c = r.split(':')[0]; cat[c] = (cat[c] || 0) + 1; }); console.log(`\n${why[k].length}  ${k}\n   ${Object.entries(cat).sort((a, b) => b[1] - a[1]).map(x => x[0] + ' ' + x[1]).join(', ')}\n   ${process.argv.includes("--all") ? why[k].join(" | ") : "e.g. " + why[k].filter((_, j) => j % Math.ceil(why[k].length / 14) === 0).join(" | ")}`); }
