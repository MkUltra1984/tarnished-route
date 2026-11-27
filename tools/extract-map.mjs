// Turns a downloaded Fextralife map data file (raw/<name>.js.txt) into proto/<name>.data.js
// Usage: node tools/extract-map.mjs overland
import fs from 'node:fs';
import vm from 'node:vm';

const name = process.argv[2] || 'overland';
const src = fs.readFileSync(`raw/${name}.js.txt`, 'utf8');
const start = src.indexOf('new ValnetMap(');
const objStart = src.indexOf('{', start);
// the config object ends right before ");\nwindow[" + ".load()"
const end = src.indexOf('.load();', objStart);
const objEnd = src.lastIndexOf('});', end);
const cfg = vm.runInNewContext('(' + src.slice(objStart, objEnd + 1) + ')', {}, { timeout: 10000 });

const layerName = {};
const walk = (ls, parent) => ls.forEach(l => { layerName[l.uid] = { label: l.label, group: parent || l.label, icon: l.icon || null }; if (l.layers) walk(l.layers, l.label); });
walk(cfg.layers);

const markers = cfg.markers.map(m => {
  const L = layerName[(m.layers || [])[0]] || { label: 'Other', group: 'Other' };
  return {
    id: m.uid, x: m.x, y: m.y, cat: L.label, group: L.group,
    title: (m.popup && m.popup.title) || m.tooltip || '',
    desc: (m.popup && m.popup.description) || '',
    link: m.link || null,
    icon: m.src || null
  };
});
const out = { name, width: cfg.tileLayer.originalWidth, height: cfg.tileLayer.originalHeight, images: cfg.tileLayer.url, layers: Object.values(layerName), markers };
fs.writeFileSync(`proto/${name}.data.js`, 'window.MAPDATA=' + JSON.stringify(out) + ';'); fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(`data/map-${name}.json`, JSON.stringify(out));
const counts = {};
markers.forEach(m => { counts[m.cat] = (counts[m.cat] || 0) + 1; });
console.log(name, 'markers', markers.length, 'size', out.width + 'x' + out.height);
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(e => e.join('=')).join(', '));

