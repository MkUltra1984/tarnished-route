// What does 100% need that the app cannot tick? Redmaw's item sheets (weapons, armor, talismans, spells, ashes of war,
// spirit ashes, key items, bosses, miscellaneous) list every thing once; this compares them with the app's markers.
//   node tools/completion-audit.mjs [--all]      writes data/completion-audit.txt
import fs from 'node:fs'; import * as cheerio from 'cheerio';
const MK = JSON.parse(fs.readFileSync('app/data/markers.json', 'utf8')), L = MK.list, all = process.argv.includes('--all');
const plain = t => t.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim(), norm = s => plain(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const strip = t => { let p; t = plain(t); do { p = t; t = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').replace(/\s+[A-Z]$/, '').replace(/\s*-?\s*\d+x\b.*$/, '').trim(); } while (t !== p); return t; };
const have = new Set(); L.forEach(m => { for (const k of [norm(strip(m[4])), norm(m[4]), norm(strip(m[4]).replace(/^ash of war: /i, '')), norm(strip(m[4]).split(',')[0]), norm(strip(m[4]).replace(/ set$/i, '')), norm(strip(m[4]).replace(/ ashes$/i, ''))]) have.add(k); });
// armour pieces count as there when their set is ("Banished Knight Helm" with "Banished Knight Set")
const sets = [...have].filter(k => k.endsWith('set')).map(k => k.slice(0, -3));
const out = []; let totalMissing = 0;
for (const f of ['bosses', 'weapons', 'armor', 'talismans', 'spells', 'ashes', 'key-items', 'miscellaneous-items']) {
  const file = `raw/redmaw/${f}.html`; if (!fs.existsSync(file)) continue; const $ = cheerio.load(fs.readFileSync(file, 'utf8')); const names = new Map();
  $('input[type=checkbox]').each((_, box) => { const li = $(box).closest('li').clone(); li.find('ul,ol').remove(); const a = li.find('a[href*="wiki.gg"]').first(); const t = plain(a.length ? a.text() : li.text()).replace(/\s+x\d+$/i, ''); if (t.length > 2 && t.length < 70) names.set(t, plain(li.text()).slice(0, 160)); });
  const miss = [...names.keys()].filter(t => { const k = norm(t); if (have.has(k) || have.has(norm(strip(t))) || have.has(k + 'set') || have.has(k + 'ashes') || have.has('ashofwar' + k)) return false; return !sets.some(s => s.length >= 6 && k.startsWith(s)); });
  totalMissing += miss.length; out.push(`\n${f}: ${names.size} entries in Redmaw's sheet, ${miss.length} with no marker in the app`); out.push('   ' + (all ? miss : miss.slice(0, 40)).join(' | ') + (!all && miss.length > 40 ? ' | ...' : ''));
}
out.unshift(`Things on Redmaw's item sheets the app has no marker for: ${totalMissing}`);
fs.writeFileSync('data/completion-audit.txt', out.join('\n')); console.log(out.join('\n'));
