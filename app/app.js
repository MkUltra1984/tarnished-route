/* Tarnished Route: a step-by-step 100% route companion. All data is local (built by tools/build-route.mjs). */
(async function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const json = (u, fallback) => fetch(u).then(r => r.ok ? r.json() : Promise.reject()).catch(() => fallback);

  const [ROUTE, MK, TILES, CARDS] = await Promise.all([json('data/route.json'), json('data/markers.json'), json('tiles/meta.json', {}), json('data/cards.json', { by: {}, pages: {} })]);
  const MAPNAME = { overland: 'The Lands Between', underground: 'Underground', ashen: 'Leyndell, Ashen Capital', shadow: 'Realm of Shadow' };
  const TABS = [['route', 'Route'], ['bosses', 'Bosses'], ['collection', 'Collection'], ['quests', 'Quests'], ['materials', 'Materials'], ['settings', 'Settings']];
  const M = MK.list.map((a, i) => ({ i, map: MK.maps[a[0]], x: a[1], y: a[2], cat: a[3], title: a[4], desc: a[5], f: MK.cats[a[3]].f, label: MK.cats[a[3]].label, kind: MK.cats[a[3]].kind }));
  const BOSSES = M.filter(m => m.cat === 'Bosses');
  // a boss's own drops are not objectives of their own: they are ticked together with the boss
  const DROPS = MK.drops || {}, dropOf = new Map(); for (const b in DROPS) for (const i of DROPS[b]) dropOf.set(i, +b);
  const syncDrops = () => { for (const b in DROPS) for (const i of DROPS[b]) { if (S.got[b]) S.got[i] = 1; else delete S.got[i]; } };

  // ---------- saved progress ----------
  const KEY = 'tarnished-route-v2';   // v2: steps are saved by their stable id, so rebuilding the route keeps your progress
  const S = Object.assign({ st: {}, got: {}, hist: [], size: 18, extras: false, all: false, tab: 'route' }, JSON.parse(localStorage.getItem(KEY) || '{}'));
  let keptTab = null;   // the tab to remember while a tab from the address (?tab=) is only being looked at
  const save = () => { syncDrops(); localStorage.setItem(KEY, JSON.stringify(keptTab == null ? S : { ...S, tab: keptTab })); };
  syncDrops();
  const q = new URLSearchParams(location.search);
  let peek = q.has('step') ? +q.get('step') : null;          // look at a step without changing progress
  if (q.has('tab')) { keptTab = S.tab; S.tab = q.get('tab'); }
  if (!TABS.some(t => t[0] === S.tab)) S.tab = 'route';

  function currentStep() {
    if (peek != null && ROUTE[peek]) return ROUTE[peek];
    let s = ROUTE.find(x => !S.st[x.id]);
    if (!s) { // end of the list: bring back "Later" steps first, then skipped ones
      for (const kind of ['l', 's']) { const ids = Object.keys(S.st).filter(k => S.st[k] === kind); if (ids.length) { ids.forEach(k => delete S.st[k]); save(); return currentStep(); } }
    }
    return s || null;
  }
  const nextAfter = s => { const at = ROUTE.indexOf(s); return ROUTE.find((x, i) => i > at && !S.st[x.id]) || ROUTE.find(x => x !== s && !S.st[x.id]); };
  const doneCount = () => ROUTE.filter(x => S.st[x.id] === 'd').length;
  const grabOf = s => [...new Set([...s.m, ...s.n])].map(i => M[i]).filter(m => m.kind === 'g' && !dropOf.has(m.i));
  const extraOf = s => [...new Set([...s.m, ...s.n])].map(i => M[i]).filter(m => m.kind === 'x');
  // The route was rebuilt (new steps, new ids): the saved step position cannot be carried over, the ticks can.
  // Steps whose objectives are all ticked count as done, up to the last such step; steps on the way with something
  // still open count as "left open", so they come back.
  (function carryOver() {
    const known = new Set(ROUTE.map(s => s.id)), old = Object.keys(S.st).filter(k => !known.has(k)); if (!old.length && S.routeV === ROUTE.length) return;
    if (old.length) { S.st = {}; S.hist = [];
      const state = ROUTE.map(s => { const g = grabOf(s); return !g.length ? 0 : g.every(m => S.got[m.i]) ? 2 : g.some(m => S.got[m.i]) ? 1 : -1; });
      const last = state.lastIndexOf(2); for (let k = 0; k <= last; k++) S.st[ROUTE[k].id] = state[k] === 2 || state[k] === 0 ? 'd' : 'l'; }
    S.routeV = ROUTE.length; save();
  })();

  // ---------- map ----------
  const SIZE = Math.min(innerWidth, innerHeight) < 600 ? 30 : 40, MAXZOOM = 7, FITZOOM = 5;   // symbols have one fixed size; each step zooms in until its objectives are spread out
  const map = L.map('map', { crs: L.CRS.Simple, zoomControl: false, attributionControl: false, zoomSnap: 1,   // whole zoom levels only: tiles scaled by half steps show hairline gaps between them
     minZoom: 1, maxZoom: MAXZOOM, maxBoundsViscosity: 0.8, inertia: true });
  const ll = (x, y) => map.unproject([x * 8192, y * 8192], 5);
  map.setMaxBounds(L.latLngBounds(ll(-0.1, -0.1), ll(1.1, 1.1)));
  const stepLayer = L.layerGroup().addTo(map), allLayer = L.layerGroup().addTo(map), spot = L.layerGroup().addTo(map);
  let tileLayer = null, mapName = null;
  function setMap(name) {
    if (name === mapName) return;
    mapName = name; if (tileLayer) tileLayer.remove();
    const native = (TILES[name] && TILES[name].maxZoom) || 5, hi = window.devicePixelRatio > 1.4;
    // on dense screens ask for the next sharper level and draw it at half size
    tileLayer = L.tileLayer(`tiles/${name}/{z}/{y}/{x}.jpg`, { tileSize: hi ? 128 : 256, zoomOffset: hi ? 1 : 0, minNativeZoom: 0, maxNativeZoom: hi ? native - 1 : native, minZoom: 0, maxZoom: MAXZOOM, noWrap: true, bounds: L.latLngBounds(ll(0, 0), ll(1, 1)), keepBuffer: 3 }).addTo(map);
  }
  const symIcon = (m, far) => L.icon({ iconUrl: `icons/${m.f}.png`, iconSize: [SIZE, SIZE], className: 'sym' + (S.got[m.i] ? ' got' : '') + (far ? ' far' : '') });
  const pinIcon = L.divIcon({ className: '', iconSize: [30, 40], iconAnchor: [15, 39], html: '<svg class="pin" viewBox="0 0 30 40"><path d="M15 38.5C15 38.5 2 24.6 2 14.6a13 13 0 0 1 26 0c0 10-13 23.9-13 23.9z" fill="#E3C27A" stroke="#0E0D0A" stroke-width="2.5"/><circle cx="15" cy="14.5" r="5.5" fill="#0E0D0A"/></svg>' });
  const markerOf = new Map();
  // hovering shows the name; tapping opens the wiki note that says what to do there
  const tipHTML = m => `<b>${esc(m.title)}</b><i>${esc(m.label)}</i>${m.desc ? `<span>${esc(m.desc)}</span>` : ''}`;
  const explain = mk => mk.bindTooltip(esc(mk.options.title), { direction: 'top', offset: [0, -SIZE / 2], className: 'tt' }).bindPopup(tipHTML(mk.options.m), { className: 'tip', closeButton: false, offset: [0, -SIZE / 2 + 4], maxWidth: 280, autoPanPadding: [16, 16] });
  function drawStep(s, fit) {
    setMap(s.map); stepLayer.clearLayers(); markerOf.clear(); spot.clearLayers();
    const show = [...new Set([...s.m, ...s.n])].map(i => M[i]).filter(m => !dropOf.has(m.i) && (s.m.includes(m.i) ? true : m.kind === 'g' || (m.kind === 'x' && S.extras)));
    for (const m of show) { const mk = L.marker(ll(m.x, m.y), { icon: symIcon(m), zIndexOffset: m.kind === 'g' ? 200 : 0, title: m.title, m }).addTo(stepLayer); explain(mk); mk.on('click', () => focusRow(m.i)); markerOf.set(m.i, mk); }
    for (const m of nearbyLeft(s)) { if (markerOf.has(m.i)) continue; const mk = L.marker(ll(m.x, m.y), { icon: symIcon(m), zIndexOffset: 150, title: m.title, m }).addTo(stepLayer); explain(mk); mk.on('click', () => focusRow(m.i)); markerOf.set(m.i, mk); }
    L.marker(ll(s.x, s.y), { icon: pinIcon, zIndexOffset: 1000, interactive: false }).addTo(stepLayer);
    if (fit) fitStep(s);
    drawAll();
  }
  function fitStep(s) {
    // everything this step shows must be on screen, as large as the pane allows
    const near5 = grabOf(s).filter(m => Math.hypot(m.x - s.x, m.y - s.y) < 0.05).map(m => ll(m.x, m.y));   // everything on the to-do list that is close by
    const pts = [ll(s.x, s.y), ...s.m.map(i => ll(M[i].x, M[i].y)), ...near5];   // the step's own objectives; nearby extras show if they fall inside
    map.invalidateSize();
    const sz = map.getSize(), px = Math.round(Math.min(SIZE + 70, sz.x * 0.12)), py = Math.round(Math.min(SIZE + 70, sz.y * 0.14));
    // objectives that sit almost on top of each other need a deeper zoom, as far as the whole step still fits
    const P = pts.map(p => map.project(p, FITZOOM)); let near = Infinity;
    for (let i = 1; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const d = P[i].distanceTo(P[j]); if (d > 2 && d < near) near = d; }
    const want = near < SIZE ? Math.min(MAXZOOM, FITZOOM + Math.ceil(Math.log2(SIZE / near))) : FITZOOM;
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [px, py + 20], paddingBottomRight: [px + 40, py], maxZoom: want, animate: false });
  }
  function drawAll() {
    allLayer.clearLayers(); if (!S.all || !mapName) return;
    const b = map.getBounds().pad(0.1), list = M.filter(m => m.map === mapName && !markerOf.has(m.i) && b.contains(ll(m.x, m.y)));
    list.sort((a, c) => (a.kind === 'g' ? 0 : 1) - (c.kind === 'g' ? 0 : 1));
    for (const m of list.slice(0, 350)) explain(L.marker(ll(m.x, m.y), { icon: symIcon(m, true), title: m.title, m, zIndexOffset: -500 }).addTo(allLayer));
  }
  map.on('moveend', drawAll);
  function pulse(mk) { const el = mk && mk.getElement(); if (!el) return; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  function showSpot(m, pan) { // locate any marker from a list, even when it is not part of the current step
    setMap(m.map); let mk = markerOf.get(m.i);
    if (!mk) { spot.clearLayers(); mk = explain(L.marker(ll(m.x, m.y), { icon: symIcon(m), zIndexOffset: 900, title: m.title, m }).addTo(spot)); }
    if (pan) map.setView(ll(m.x, m.y), Math.max(map.getZoom(), 5), { animate: true });
    setTimeout(() => pulse(mk), 300);
  }
  $('#recentre').onclick = () => { const s = currentStep(); if (s) { if (S.tab !== 'route') { S.tab = 'route'; render(); } else drawStep(s, true); } };
  $('#zin').onclick = () => map.zoomIn(1); $('#zout').onclick = () => map.zoomOut(1);
  function placeMapButton() { const r = $('#map').getBoundingClientRect(); ['#recentre', '#zout', '#zin'].forEach((id, k) => { const b = $(id); b.style.left = (r.right - 48) + 'px'; b.style.top = (r.bottom - 48 - k * 44) + 'px'; }); }
  addEventListener('resize', () => { placeMapButton(); map.invalidateSize(); });

  // ---------- rows ----------
  const artOf = m => { const c = CARDS.pages[CARDS.by[m.title]]; return c && c.img; };
  function rowHTML(m, sub, name) {
    const art = artOf(m);
    return `<button class="row${S.got[m.i] ? ' got' : ''}" data-i="${m.i}"><span class="tile" data-tick="${m.i}"><img ${art ? `class="art${/jpg$/.test(art) ? ' ph' : ''}" src="cards/${esc(art)}" loading="lazy"` : `src="icons/${m.f}.png"`} alt=""><span class="tick">&#10003;</span></span><span class="txt"><span class="name">${esc(name || m.title)}</span><span class="cat">${esc(sub || m.label)}</span></span></button>`;
  }
  function wireRows(root) {
    root.querySelectorAll('.row').forEach(r => r.onclick = e => {
      const m = M[+r.dataset.i];
      if (e.target.closest('[data-tick]')) { const t = dropOf.has(m.i) ? dropOf.get(m.i) : m.i; if (S.got[t]) delete S.got[t]; else S.got[t] = 1; settle(t); save(); root.querySelectorAll('.row').forEach(x => x.classList.toggle('got', !!S.got[+x.dataset.i])); const mk = markerOf.get(m.i); if (mk) mk.setIcon(symIcon(m)); refreshCounts(); return; }
      showSpot(m, true); openCard(m);
    });
  }
  let refreshCounts = () => {};

  // ---------- cards: the wiki's picture and notes for a boss or an item ----------
  const cardOf = m => CARDS.pages[CARDS.by[m.title]] || null;
  function openCard(m) {
    const c = cardOf(m); if (!c) return false;
    const sh = $('#sheet'), para = a => a.map(p => p.startsWith('## ') ? `<h4>${esc(p.slice(3))}</h4>` : `<li>${esc(p)}</li>`).join('');
    const sec = (title, a) => a && a.length ? `<h3>${title}</h3><ul>${para(a)}</ul>` : '';
    const drops = DROPS[m.i] ? `<h3>Drops</h3><ul>${DROPS[m.i].map(i => `<li>${esc(M[i].title)}</li>`).join('')}</ul>` : '';
    sh.hidden = false;
    sh.innerHTML = `<div class="panel card"><button class="cx" aria-label="Close">&times;</button>
      ${c.img ? `<div class="cpic${c.boss ? ' boss' : ''}"><img src="cards/${esc(c.img)}" alt=""></div>` : ''}
      <h2>${esc(m.title)}</h2><div class="over">${esc(m.label)} &middot; ${esc(MAPNAME[m.map])}</div>
      ${m.desc ? `<p class="cnote">${esc(m.desc)}</p>` : ''}
      ${c.intro.length ? c.intro.map(p => `<p>${esc(p)}</p>`).join('') : ''}
      ${c.boss ? sec('Key facts', c.facts) + drops + sec('Strategy', c.strat) : sec('Where to find', c.where)}
      <div class="seg cbtn"><button class="btn" id="cmap">Show on map</button><button class="btn${S.got[m.i] ? ' on' : ''}" id="ctick">${S.got[m.i] ? '&#10003; ' : ''}${c.boss ? 'Defeated' : 'Collected'}</button></div>
      <p class="credit">Picture and text from the <a href="https://eldenring.wiki.fextralife.com/${encodeURIComponent(c.list || CARDS.by[m.title]).replace(/%20/g, '+')}" target="_blank" rel="noopener">Fextralife Elden Ring Wiki</a>.</p></div>`;
    const close = () => { sh.hidden = true; sh.innerHTML = ''; sh.onclick = null; };
    sh.onclick = e => { if (e.target === sh) close(); }; $('.cx', sh).onclick = close; $('#cmap').onclick = () => { close(); showSpot(m, true); };
    $('#ctick').onclick = () => { const t = dropOf.has(m.i) ? dropOf.get(m.i) : m.i; if (S.got[t]) delete S.got[t]; else S.got[t] = 1; settle(t); save(); close(); if (S.tab === 'route') { renderRoute(); const mk = markerOf.get(m.i); if (mk) mk.setIcon(symIcon(m)); } else { document.querySelectorAll('.row').forEach(x => x.classList.toggle('got', !!S.got[+x.dataset.i])); refreshCounts(); } };
    return true;
  }

  // ---------- Route tab ----------
  // Every objective has its own tick. "Next step" moves on: a step with everything ticked is done; a step with open
  // objectives is remembered and comes back at the end of the route with only what is still open.
  // Rerouting: what you leave open is not parked until the end. It is offered again in every later step that passes
  // close to it ("Left open nearby", also drawn on the map), it is always reachable through the "open" counter in the
  // header, and whatever is still open at the very end comes back as its own steps.
  let openInfo = null, showOpen = false;   // openInfo: the objective whose wiki note is unfolded
  const NEAR = 0.04;                        // about 330 px on the 8192 px map: "you are passing by"
  const leftOpen = () => M.filter(m => m.kind === 'g' && !dropOf.has(m.i) && !S.got[m.i] && stepOf.has(m.i) && S.st[ROUTE[stepOf.get(m.i)].id]);
  function nearbyLeft(s) {
    const mine = new Set([...s.m, ...s.n]), pts = [[s.x, s.y], ...s.m.map(i => [M[i].x, M[i].y])];
    return leftOpen().filter(m => m.map === s.map && !mine.has(m.i) && pts.some(p => Math.hypot(p[0] - m.x, p[1] - m.y) < NEAR));
  }
  function settle(i) { // a passed step is done exactly when nothing in it is open any more
    const st = stepOf.has(i) ? ROUTE[stepOf.get(i)] : null; if (!st || !S.st[st.id]) return;
    S.st[st.id] = grabOf(st).some(m => !S.got[m.i]) ? 'l' : 'd';
  }
  function renderOpen() {
    const all = leftOpen(), by = new Map(); for (const m of all) { const k = stepOf.get(m.i); if (!by.has(k)) by.set(k, []); by.get(k).push(m); }
    const html = [...by.keys()].sort((a, b) => a - b).map(k => `<div class="over sec qh"><span>${esc(ROUTE[k].title)}</span><span>${by.get(k).length}</span></div>` + by.get(k).map(m => rowHTML(m, m.desc || m.label)).join('')).join('');
    listPage('Left open', all.length + ' objectives from steps you moved past', '<button class="back">&lsaquo; Back to the route</button>' + (html || '<p class="lead">Nothing is open. Everything in the steps behind you is ticked.</p>'));
    $('.back').onclick = () => { showOpen = false; renderRoute(); const s = currentStep(); if (s) drawStep(s, true); };
    refreshCounts = () => { all.forEach(m => settle(m.i)); save(); const y = $('.list').scrollTop; renderOpen(); $('.list').scrollTop = y; };
  }
  function checkHTML(m, sub) {
    // the symbol already says what kind of thing it is; the second line is only for what the name cannot say
    const note = [typeof sub === 'string' ? sub : '', DROPS[m.i] ? 'Drops ' + DROPS[m.i].map(i => baseName(M[i].title)).join(', ') : ''].filter(Boolean).join(' · ');
    return `<button class="chk${S.got[m.i] ? ' got' : ''}" data-i="${m.i}"><img class="ci" data-pan="${m.i}" src="icons/${m.f}.png" alt=""><span class="cn">${note ? `<span class="nm">${esc(m.title)}</span><small>${esc(note)}</small>` : esc(m.title)}</span><span class="box" data-tick="1" aria-hidden="true"></span></button>${openInfo === m.i ? `<div class="info">${esc(m.desc || "The wiki map has no extra note for this one.")}${DROPS[m.i] ? `<br><br>Drops, ticked together with the boss: ${esc(DROPS[m.i].map(i => M[i].title).join(', '))}.` : ''}${cardOf(m) ? `<button class="link more" data-card="${m.i}">Picture and details &rsaquo;</button>` : ''}</div>` : ""}`;
  }
  const shot = (f, cls) => f ? `<img class="shot ${cls || ''}" loading="lazy" src="walk/${esc(f)}" alt="">` : '';
  function zoomPicture(src) { const sh = $('#sheet'); sh.hidden = false; sh.innerHTML = `<img class="bigshot" src="${src}" alt="">`; sh.onclick = () => { sh.hidden = true; sh.innerHTML = ''; }; }
  function renderRoute() {
    if (showOpen) return renderOpen();
    const pane = $('#pane'), s = currentStep(), total = ROUTE.length, dn = doneCount();
    if (!s) { pane.innerHTML = `<div class="listhead"><h1>Route complete</h1></div><div class="list"><p class="lead">Every step is done.</p>${S.hist.length ? '<button class="link wide" id="undo">&#8630; Undo the last step</button>' : ''}</div>`;
      const u = $('#undo', pane); if (u) u.onclick = () => { const id = S.hist.pop(); delete S.st[id]; save(); renderRoute(); const c = currentStep(); if (c) drawStep(c, true); }; return; }
    const keep = $('.body', pane) ? $('.body', pane).scrollTop : 0;
    const pos = ROUTE.indexOf(s) + 1, grab = grabOf(s), extra = extraOf(s), nx = nextAfter(s), open = grab.filter(m => !S.got[m.i]).length;
    // what the step is about, and what merely lies close to its path
    const own = new Set(s.m), here = grab.filter(m => own.has(m.i)), onway = grab.filter(m => !own.has(m.i)), got = l => l.filter(m => S.got[m.i]).length;
    const para = s.text.length ? s.text : ['Explore this place and pick up everything listed below.'];
    const back = nearbyLeft(s), openAll = leftOpen().length;
    pane.innerHTML = `
      <div class="head">
        <div class="steprow"><span class="over gold">Step ${pos} of ${total}</span><span style="display:flex;align-items:center">${openAll ? `<button class="chip" id="openb">${openAll} open</button>` : ''}<span class="meta">${Math.round(dn / total * 100)}%</span></span></div>
        <div class="bar"><i style="width:${dn / total * 100}%"></i></div>
        <h1 class="title">${esc(s.title)}</h1>
        ${s.region ? `<div class="reg">${esc(s.region)}</div>` : ''}
        ${s.travel ? `<div class="travel">Far from the last step. Nearest site of grace: <b>${esc(s.travel)}</b></div>` : ''}
      </div>
      <div class="body">
        <div class="sechead"><span class="over">Walkthrough</span>${grab.length ? `<button class="link" id="jump">To do &middot; ${grab.length - open} of ${grab.length} &darr;</button>` : ''}</div>
        <div class="dir">${shot(s.imgs[0], 'lead')}${s.card != null && cardOf(M[s.card]) && cardOf(M[s.card]).img ? `<img class="shot lead cardlead${cardOf(M[s.card]).boss ? '' : ' item'}" data-card="${s.card}" loading="lazy" src="cards/${esc(cardOf(M[s.card]).img)}" alt="">` : ''}${para.map(p => p.startsWith('## ') ? `<h3>${esc(p.slice(3))}</h3>` : `<p>${esc(p)}</p>`).join('')}${s.imgs.length > 1 ? `<div class="strip">${s.imgs.slice(1).map(f => shot(f, 'thumb')).join('')}</div>` : ''}</div>
        ${s.place && (s.place.walk.length || s.place.notes.length || s.place.img) ? `<div class="over sechead">${esc(s.place.title)} in detail</div><div class="dir">${shot(s.place.img, 'lead')}${s.place.walk.map(p => p.startsWith('## ') ? `<h3>${esc(p.slice(3))}</h3>` : `<p>${esc(p)}</p>`).join('')}${s.place.notes.length ? `<h3>Notes</h3><ul>${s.place.notes.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div>` : ''}
        ${(s.guide || []).map(g => `<details class="guide"><summary>Wiki walkthrough: ${esc(g.title)}</summary><div class="dir">${g.text.map(p => `<p>${esc(p)}</p>`).join('')}</div></details>`).join('')}
        ${s.miss ? `<div class="miss"><b>Missable:</b> ${esc(s.miss)}</div>` : ''}
        <div class="sechead" id="todo"><span class="over">To do here &middot; ${got(here)} of ${here.length}</span>${grab.length > 1 ? `<button class="link" id="allb">${open ? 'Tick all' : 'Untick all'}</button>` : ''}</div>
        ${here.map(checkHTML).join('') || '<div class="none">Nothing to pick up here.</div>'}
        ${onway.length ? `<div class="sechead"><span class="over">Nearby, on the way &middot; ${got(onway)} of ${onway.length}</span></div>${onway.map(checkHTML).join('')}` : ''}
        ${back.length ? `<div class="sechead"><span class="over warn">Left open nearby &middot; ${back.length}</span></div>${back.map(m => checkHTML(m, 'from ' + ROUTE[stepOf.get(m.i)].title)).join('')}` : ''}
        ${extra.length ? `<button class="link wide" id="xt">${S.extras ? 'Hide' : 'Show'} ${extra.length} nearby materials</button>${S.extras ? extra.map(checkHTML).join('') : ''}` : ''}
      </div>
      <div class="foot">
        <button class="done">${open && grab.length ? `Next step<small>${open} left open</small>` : 'Done'}</button>
        <div class="undo"><span class="next">${nx ? `Next: <b>${esc(nx.title)}</b>${nx.boss ? '<em>Boss</em>' : ''}` : Object.values(S.st).some(v => v === 'l' || v === 's') ? 'Next: what you left open' : 'Last step'}</span>${S.hist.length ? '<button id="undo">&#8630; Undo</button>' : ''}</div>
      </div>`;
    $('.body', pane).scrollTop = keep;
    pane.querySelectorAll('.chk').forEach(r => r.onclick = e => {
      const m = M[+r.dataset.i];
      if (!e.target.closest('[data-tick]')) { openInfo = openInfo === m.i ? null : m.i; renderRoute(); if (openInfo != null) showSpot(m, true); return; }   // the row explains it and finds it on the map
      if (S.got[m.i]) delete S.got[m.i]; else S.got[m.i] = 1; settle(m.i); save();                                                                      // the box ticks it
      const mk = markerOf.get(m.i); if (mk) mk.setIcon(symIcon(m));
      renderRoute();
    });
    pane.querySelectorAll('[data-card]').forEach(b => b.onclick = () => openCard(M[+b.dataset.card]));
    const allb = $('#allb', pane); if (allb) allb.onclick = () => { grab.forEach(m => { if (open) S.got[m.i] = 1; else delete S.got[m.i]; }); settle(grab[0].i); save(); renderRoute(); drawStep(s, false); };
    const xt = $('#xt', pane); if (xt) xt.onclick = () => { S.extras = !S.extras; save(); renderRoute(); drawStep(s, false); };
    const ob = $('#openb', pane); if (ob) ob.onclick = () => { showOpen = true; renderRoute(); };
    const jump = $('#jump', pane); if (jump) jump.onclick = () => $('#todo', pane).scrollIntoView({ behavior: 'smooth', block: 'start' });
    pane.querySelectorAll('.shot:not(.cardlead)').forEach(im => im.onclick = () => zoomPicture(im.src));
    $('.done', pane).onclick = () => finish(s, open && grab.length ? 'l' : 'd');
    const u = $('#undo', pane); if (u) u.onclick = () => { const id = S.hist.pop(); delete S.st[id]; peek = null; openInfo = null; save(); renderRoute(); drawStep(currentStep(), true); };
  }
  function finish(s, how) {
    $('#pane').scrollTop = 0;
    peek = null;
    showOpen = false; S.st[s.id] = how; S.hist.push(s.id); if (S.hist.length > 200) S.hist.shift();
    save(); openInfo = null; const b = $('.body'); if (b) b.scrollTop = 0; renderRoute(); const n = currentStep(); if (n) drawStep(n, true);
  }
  function focusRow(i) { if (openInfo !== i && M[i].kind === 'g') { openInfo = i; if (S.tab === 'route') renderRoute(); } const r = $(`.chk[data-i="${i}"], .row[data-i="${i}"]`); if (r) { r.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 900); } pulse(markerOf.get(i)); }

  // ---------- list tabs ----------
  function listPage(title, sub, inner) { $('#pane').innerHTML = `<div class="listhead"><h1>${esc(title)}</h1><div class="meta" id="cnt">${sub}</div></div><div class="list">${inner}</div>`; wireRows($('#pane')); }
  const count = list => `${list.filter(m => S.got[m.i]).length} of ${list.length}`;
  function renderBosses() {
    const html = MK.maps.map(mp => { const l = BOSSES.filter(b => b.map === mp).sort((a, b) => a.title.localeCompare(b.title)); return l.length ? `<div class="over sec">${esc(MAPNAME[mp])} &middot; ${l.length}</div>` + l.map(m => rowHTML(m, m.desc || 'Boss')).join('') : ''; }).join('');
    listPage('Bosses', count(BOSSES) + ' defeated', html); refreshCounts = () => $('#cnt').textContent = count(BOSSES) + ' defeated';
  }
  let openCat = null;
  function renderCollection() {
    const cats = Object.keys(MK.cats).filter(c => MK.cats[c].kind === 'g' && !['Bosses', 'NPCs', 'NPC Invaders'].includes(c));
    const all = M.filter(m => cats.includes(m.cat));
    if (openCat) {
      const l = M.filter(m => m.cat === openCat).sort((a, b) => a.title.localeCompare(b.title));
      listPage(openCat, count(l) + ' collected', `<button class="back">&lsaquo; All categories</button>` + l.map(m => rowHTML(m, MAPNAME[m.map])).join(''));
      $('.back').onclick = () => { openCat = null; renderCollection(); }; refreshCounts = () => $('#cnt').textContent = count(l) + ' collected'; return;
    }
    listPage('Collection', count(all) + ' collected', cats.map(c => { const l = M.filter(m => m.cat === c); return `<button class="group" data-c="${esc(c)}"><span><img src="icons/${MK.cats[c].f}.png" alt="">${esc(c)}</span><span class="meta">${count(l)}</span></button>`; }).join(''));
    document.querySelectorAll('.group').forEach(g => g.onclick = () => { openCat = g.dataset.c; renderCollection(); }); refreshCounts = () => {};
  }
  const baseName = s => s.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+.*$/, '').trim();
  const stepOf = new Map(); ROUTE.forEach((s, k) => [...s.m, ...s.n].forEach(i => { if (!stepOf.has(i)) stepOf.set(i, k); }));
  const routeOrder = (a, b) => (stepOf.get(a.i) ?? 1e9) - (stepOf.get(b.i) ?? 1e9);
  function renderQuests() {
    // characters move as their story goes on: the wiki map has one marker per place, shown here in route order
    const people = M.filter(m => m.cat === 'NPCs' || m.cat === 'NPC Invaders'), groups = new Map();
    for (const m of people) { const k = baseName(m.title); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
    const names = [...groups.keys()].sort((a, b) => a.localeCompare(b));
    const html = names.map(k => { const l = groups.get(k).sort(routeOrder), met = l.filter(m => S.got[m.i]).length;
      return `<div class="over sec qh"><span>${esc(k)}</span><span>${met} of ${l.length}</span></div>` + l.map((m, j) => { const where = (m.title.match(/\(([^)]*)\)\s*$/) || [])[1], st = stepOf.has(m.i) ? ROUTE[stepOf.get(m.i)] : null; return rowHTML(m, m.desc || m.label, (l.length > 1 ? (j + 1) + '. ' : '') + (where || (st ? st.title : MAPNAME[m.map]))); }).join(''); }).join('');
    listPage('Quests', `${names.length} characters &middot; ${count(people)} meetings`, `<p class="lead">Each character is listed with every place they appear, in the order the route reaches them. Tap a row to find the spot, tap the picture to tick it off.</p>` + html);
    refreshCounts = () => { if (S.tab === 'quests') { const y = $('.list').scrollTop; renderQuests(); $('.list').scrollTop = y; } };
  }

  // ---------- Materials tab: where each material can be found ----------
  const MATS = M.filter(m => m.kind === 'x'), matName = m => { let t = m.title, p; do { p = t; t = baseName(t).replace(/\s+[A-Z]$/, '').trim(); } while (t !== p); return t; }, matQty = m => +((m.title.match(/(\d+)x\b/) || [])[1] || 1);
  let matCat = null, matOpen = null;
  function renderMaterials() {
    const cats = Object.keys(MK.cats).filter(c => MK.cats[c].kind === 'x');
    if (matOpen) {
      const l = MATS.filter(m => m.cat === matCat && matName(m) === matOpen).sort(routeOrder);
      listPage(matOpen, `${l.length} ${l.length === 1 ? 'place' : 'places'} &middot; ${l.reduce((a, m) => a + matQty(m), 0)} pieces`, `<button class="back">&lsaquo; ${esc(matCat)}</button><p class="lead">In the order the route passes them. Tap a row to see the spot on the map, tap the picture once you have it.</p>` +
        l.map(m => { const st = stepOf.has(m.i) ? ROUTE[stepOf.get(m.i)] : null; return rowHTML(m, m.desc || MAPNAME[m.map], (matQty(m) > 1 ? matQty(m) + 'x \u00b7 ' : '') + (st ? st.title : MAPNAME[m.map])); }).join(''));
      $('.back').onclick = () => { matOpen = null; renderMaterials(); }; return;
    }
    if (matCat) {
      const g = new Map(); for (const m of MATS) if (m.cat === matCat) { const k = matName(m); if (!g.has(k)) g.set(k, []); g.get(k).push(m); }
      const names = [...g.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      listPage(matCat, `${names.length} different materials`, `<button class="back">&lsaquo; All materials</button>` + names.map(k => `<button class="group" data-k="${esc(k)}"><span><img src="icons/${MK.cats[matCat].f}.png" alt="">${esc(k)}</span><span class="meta">${g.get(k).length} ${g.get(k).length === 1 ? 'place' : 'places'}</span></button>`).join(''));
      $('.back').onclick = () => { matCat = null; renderMaterials(); };
      document.querySelectorAll('.group').forEach(b => b.onclick = () => { matOpen = b.dataset.k; renderMaterials(); }); return;
    }
    listPage('Materials', `${MATS.length} places on the map`, `<p class="lead">Every place the wiki's map marks for a material, grouped by material.</p>` + cats.map(c => `<button class="group" data-c="${esc(c)}"><span><img src="icons/${MK.cats[c].f}.png" alt="">${esc(c)}</span><span class="meta">${new Set(MATS.filter(m => m.cat === c).map(matName)).size}</span></button>`).join(''));
    document.querySelectorAll('.group').forEach(b => b.onclick = () => { matCat = b.dataset.c; renderMaterials(); });
  }

  // ---------- Settings tab ----------
  function renderSettings() {
    const seg = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(o => `<button class="btn${o[0] === cur ? ' on' : ''}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
    $('#pane').innerHTML = `<div class="listhead"><h1>Settings</h1></div><div class="list set">
      <button class="btn danger" id="reset">Start new playthrough</button>
      <p class="credit" style="margin-top:8px">Clears every tick and puts the route back to step 1.</p>
      <div class="opt">Markers on the map</div>${seg('al', [[0, 'This step only'], [1, 'Everything']], S.all ? 1 : 0)}
      <p class="credit">The order of the route follows <a href="https://eldenring.redmaw.dev/" target="_blank" rel="noopener">Redmaw's Elden Ring Completion Sheets</a>, and where the wiki has no note the step shows Redmaw's own line. Map images, marker positions and descriptions come from the <a href="https://eldenring.wiki.fextralife.com/" target="_blank" rel="noopener">Fextralife Elden Ring Wiki</a>. Elden Ring is a trademark of its owners; this is a personal fan tool.</p></div>`;
    document.querySelectorAll('#al .btn').forEach(b => b.onclick = () => { S.all = !!+b.dataset.v; save(); drawAll(); renderSettings(); });
    let armed = false; $('#reset').onclick = e => { if (!armed) { armed = true; e.target.textContent = 'Tap again to erase all progress'; return; } S.st = {}; S.got = {}; S.hist = []; S.tab = 'route'; save(); peek = null; openInfo = null; showOpen = false; render(); };
  }


  // ---------- shell ----------
  function render() {
    $('#tabs').innerHTML = TABS.map(t => `<button class="tab${S.tab === t[0] ? ' on' : ''}" data-t="${t[0]}"><span><img src="icons/tab-${t[0]}.png" alt="">${t[1]}</span></button>`).join('');
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => { S.tab = b.dataset.t; keptTab = null; save(); render(); $('#pane').scrollTop = 0; });
    refreshCounts = () => {};
    ({ route: renderRoute, bosses: renderBosses, collection: renderCollection, quests: renderQuests, materials: renderMaterials, settings: renderSettings }[S.tab] || renderRoute)();
    placeMapButton();
    const s = currentStep(); if (s && (S.tab === 'route' || !mapName)) drawStep(s, true);
  }
  render();
  // ---------- automatic updates ----------
  // Every deploy writes a new version.json. The app checks it when it opens, when it comes back to the foreground and
  // every few minutes; when the version changed it reloads itself and picks up the new files. Progress is kept.
  let seen = null, reloading = false;
  const reload = () => { if (!reloading) { reloading = true; location.reload(); } };
  async function checkVersion() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const v = (await r.json()).v; if (seen == null) { seen = v; return; }
      if (v !== seen) { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) await reg.update().catch(() => {}); reload(); }
    } catch (e) { /* offline: keep going with what we have */ }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadWorker = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    navigator.serviceWorker.ready.then(() => setTimeout(() => { if (!navigator.serviceWorker.controller) return;
      const files = ['data/cards.json', 'tiles/meta.json', ...TABS.map(t => `icons/tab-${t[0]}.png`), 'icons/tab-recentre.png', ...Object.values(MK.cats).map(c => `icons/${c.f}.png`)];
      files.forEach(u => fetch(u).catch(() => {})); }, 2500));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) reload(); });   // a new worker took over
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  checkVersion(); setInterval(checkVersion, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
})();
