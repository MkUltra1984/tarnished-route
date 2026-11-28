// The parts of Redmaw's Completion Sheets that are neither route nor collectible:
//   questlines      -> one checklist per person (Quests tab)
//   achievements    -> the 72 achievements and how to get each (Collection tab)
//   new-game-plus   -> what is worth repeating in a later cycle (Collection tab)
//   resources       -> reference tables: soft caps, upgrade material counts ... (Materials tab)
// Not used: npc-walkthrough (604 lines, 58% word for word in the main walkthrough, the rest are the questlines again)
// and the bosses sheet (the app's Bosses tab comes from the wiki's map).
// Writes app/data/extra.json. Sheets are read from raw/redmaw/ (see HANDOFF for how to fetch them).
// Usage: node tools/build-extra.mjs
import fs from 'node:fs';
import * as cheerio from 'cheerio';

const plain = t => (t || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
const load = f => cheerio.load(fs.readFileSync(`raw/redmaw/${f}.html`, 'utf8'));
const title = ($, h) => { const x = $(h).clone(); x.find('button').remove(); return plain(x.text()); };
// the lines of one section, nested lines indented by one level
const linesOf = ($, list) => { const out = []; const walk = (ul, depth) => $(ul).children('li').each((_, li) => { const box = $(li).find('input[type=checkbox]').first(), me = $(li).clone(); me.find('ul,ol').remove();
    const miss = me.find('.missable').first().attr('data-tooltip') || (me.find('.badge').filter((_, b) => /missable/i.test($(b).text())).length ? 'Missable' : null), opt = me.find('.badge').filter((_, b) => /optional/i.test($(b).text())).length > 0;
    me.find('.badge').remove(); const text = plain(me.text()); if (text.length > 1) out.push({ id: box.attr('id') || null, text, d: depth, ...(opt ? { opt: 1 } : {}), ...(miss ? { miss } : {}) });
    $(li).children('ul,ol').each((_, sub) => walk(sub, depth + 1)); }); walk(list, 0); return out; };
const sections = f => { const $ = load(f), out = []; $('h3').each((_, h) => { const list = $(h).nextAll('ul,ol').first(); if (!list.length) return; const lines = linesOf($, list).filter(l => l.id); if (lines.length) out.push({ name: title($, h), lines }); }); return out; };

const extra = { quests: sections('questlines'), achievements: sections('achievements'), ngplus: sections('new-game-plus'), reference: [] };
// an achievement line is "Name: how to get it"
for (const s of extra.achievements) for (const l of s.lines) { const k = l.text.indexOf(':'); if (k > 0 && k < 60) { l.name = l.text.slice(0, k).trim(); l.text = l.text.slice(k + 1).trim(); } }

{ const $ = load('resources'); $('h3').each((_, h) => { const sec = { title: title($, h), blocks: [] }; let el = $(h).next();
    while (el.length && !el.is('h3')) { el.find('table').addBack('table').each((_, t) => { const rows = $(t).find('tr').map((_, tr) => [$(tr).find('th,td').map((_, c) => plain($(c).text())).get()]).get().filter(r => r.length); if (rows.length) sec.blocks.push({ rows, cap: plain($(t).find('caption').text()) || null }); });
      if (!el.is('table') && !el.find('table').length) { const t = plain(el.text()); if (t.length > 3) sec.blocks.push({ text: t }); }
      el.find('h4').each((_, h4) => 0); el = el.next(); }
    if (sec.blocks.length) extra.reference.push(sec); }); }

fs.writeFileSync('app/data/extra.json', JSON.stringify(extra));
const n = a => a.reduce((x, s) => x + s.lines.length, 0);
console.log(`extra.json: ${extra.quests.length} questlines (${n(extra.quests)} lines), ${n(extra.achievements)} achievements, ${n(extra.ngplus)} New Game Plus lines, ${extra.reference.length} reference sections (${extra.reference.reduce((x, s) => x + s.blocks.filter(b => b.rows).length, 0)} tables); ${Math.round(fs.statSync('app/data/extra.json').size / 1024)} KB`);
