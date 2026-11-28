# Handoff: Elden Ring route companion

Written 2026-11-27 for a new Claude Code session on a different PC. Read this fully before doing anything.

## What is being built

A personal web app (installable PWA) for an Android tablet and Android phone, used beside the PC while playing Elden Ring with Shadow of the Erdtree. It guides a brand-new character through a 100% route: every boss, weapon, armor piece, Ash of War, Spirit Ash, spell, talisman and questline, all endings kept open, then a custom boss gauntlet before the final boss. Hosting: free web hosting (GitHub Pages or similar). Everything is stored in this repository; the app must not load anything from the wiki at runtime.

## How the owner wants the work done (these are firm)

- No claude.ai artifacts in this project, ever.
- Never show unfinished work. Render every screen with the headless browser, inspect it yourself, and only then send a screenshot. The first version was shipped untested and rejected.
- Show every design decision (layout, colours, assets, setup questions) for approval before finalising it. Use multiple-choice questions.
- Game data comes from the Fextralife wiki pages and data files, never from memory.
- Order of work set by the owner: (1) new map, (2) custom symbols fitted to the new map, (3) other custom assets, (4) re-run the UX review, (5) build the app, (6) mods and the gauntlet.
- Keep sub-agent use lean; the first attempt burned a lot of usage.

## Decisions already approved

- Layout: split view. Map on the left, ONE step card on the right, bottom tabs (Route, Bosses, Collection, Quests, Gauntlet).
- One place per step. The card shows: step number, place name, short directions, a Grab list, a Missable line, one big DONE, Skip and Later, and "Next: ...".
- Grab list shows the real in-game item pictures (from the item's wiki page, see tools/fetch-item-art.mjs).
- Map shows only the current step by default. No search bar, no text and no buttons on the map, except one re-centre control. Drag to pan, pinch or scroll to zoom.
- Colours: gold on charcoal.
- Symbols: rim colour per group (red bosses, gold equipment, blue spells, green talismans, white places). Symbol art style is NOT chosen yet; the owner wants it fitted to the new map. Candidates are in assets/anchor (a gilded, b inked, c flat).
- Extras accepted: tap a Grab row to pan the map to it; a 4-second Undo after DONE. Numbered badges were not accepted.
- Map: AI repaint of all four maps, then AI upscale for sharp zoom.
- Old first version (artifact and Desktop folder) was deleted at the owner's request.

## Where the work stands

Done:
- data/map-*.json: all four wiki maps extracted (5,111 markers with exact positions, categories, descriptions, wiki links). 254 boss markers, 242 distinct names; not yet cross-checked against the wiki's full boss list.
- data/walkthrough-base.json (204 sections) and data/walkthrough-dlc.json (142 sections): the wiki's 100% walkthroughs parsed in order, with links matched to map markers.
- assets/maps: the original wiki map images, all four maps, six sizes each.
- DESIGN.md: the UX review (40-item audit plus spec). Its recommendation: build on the clean style, fixed header, scrolling middle, fixed footer with DONE at 72 px, one radius, one button height.
- proto/: throwaway prototypes used for screenshots. Not the app.

In progress, the map repaint:
- Method that works: tools/repaint-map.mjs. Each 8192 px map is cut into a 4x4 grid of 2816 px tiles (1024 px overlap), each repainted by the OpenAI image API (model gpt-image-2, images/edits), tone-matched in the overlaps and cross-faded in a 256 px band. Output: assets/maps2/<name>-8192.jpg plus shots/repaint-<name>.jpg and shots/repaint-<name>-seams.jpg for inspection.
- What failed, do not retry: 1024 px tiles (64 per map) gave visible tone jumps between tiles; a low-resolution whole-map colour guide hallucinated features; 3840x3840 tiles exceed the API's pixel budget.
- A single 2816 px tile measured within 2 px of the original everywhere. Accept a map only if no seam is visible in the seams sheet and the reported worst local shift is a few pixels at most.
- RESULT OF THE FIRST FULL RUN (overland, 16 tiles): REJECTED, not shown to the owner as finished. The overview (shots/repaint-overland.jpg) looks good, but the seam close-ups (shots/repaint-overland-seams.jpg) show doubled features where tiles overlap: two whirlpools, a ghost tower, a doubled banner, sea drawn over land near the Erdtree. Cause: tiles that are mostly sea or cloud drift far more than the 2 px seen on the land-heavy test tile (the alignment check hit its 16 px search limit on 8 of 16 tiles; real drift is larger). Tone also varied a lot between tiles (gains up to 1.69). The model also recoloured the Mountaintops green, against "keep each region's colour family".
- NEXT STEP for the repaint: register every repainted tile back onto the original before blending. Estimate the warp between the original tile and its repaint (dense optical flow or feature matching, e.g. OpenCV via Python, which is not installed yet) and warp the repaint to the original geometry; then tone-match and cross-fade as now. The 16 raw overland tiles are in assets/repaint/overland and are in the repository, so this needs no new API calls. Only run the other three maps after overland passes: no doubled features anywhere along the joins, checked by eye at full resolution.
- Fallback the owner has not chosen but which is exact and seamless: a colour regrade of the original map ("Vivid") plus AI upscaling.
- Check assets/maps2 to see which maps are finished (overland-8192.jpg there is the rejected stitch). Run the missing ones: `node tools/repaint-map.mjs <name> assets/maps/<file>-8192.jpg` for overland, underground, ashen, shadow (file names are in assets/maps). Raw tiles are cached in assets/repaint and are in the repository, so finished tiles are never paid for twice.

Not started:
- Cutting the finished maps into a tile pyramid for Leaflet (a single 8192 px image is too heavy for a phone), plus an extra sharpened zoom level using tools/bin/realesrgan (Real-ESRGAN, needs the graphics card).
- Symbols, tab icons, interface pieces, app icon.
- Downloading in-game pictures for all items (tools/fetch-item-art.mjs, one page per 700 ms, be polite to the wiki).
- Building the route: one step per place, from the walkthrough sections; every marker the walkthrough does not mention gets attached to the nearest route step. Filter noise sections (Speed Run, Notes, Enemies, General Information, item list sections).
- Setup questions at first launch: one choice per category, not grouped.
- The app itself, hosting, and the mods: Boss Arena (Nexus 5645) as the base for a custom gauntlet (every boss once, strongest version only, ordered by lore strength, shardbearers last, own character, early bosses scaled up). The owner must download the mod from Nexus; its page could not be fetched.

## Tools in this repository

- tools/shot.mjs: screenshot a local page at a device size (tablet 1280x800, phone 412x915, 2x pixel density).
- tools/extract-map.mjs, tools/parse-walkthrough.mjs: rebuild the data from raw/.
- tools/img.mjs: one image from the OpenAI API. Set IMG_MODEL; gpt-image-1.5 supports transparent backgrounds, gpt-image-2 does not. Set IMG_BG=opaque for gpt-image-2.
- The OpenAI key is read from the OPENAI_API_KEY user environment variable. It is not in this repository and must never be committed or printed.
- PowerShell sessions need the PATH refreshed after installs: `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`, and `$env:OPENAI_API_KEY = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY','User')`.

## A note on content

The map images, marker text and walkthrough text come from the Fextralife Elden Ring Wiki. The owner chose public web hosting; keep the address unlisted and credit the wiki in the app.

## UPDATE, later on 2026-11-27: read this before the sections above

- MAP DECISION CHANGED: the owner dropped the AI repaint. The app uses the ORIGINAL wiki map, unchanged. Ignore the repaint "next step" above; do not spend more on it. assets/maps2 and assets/repaint are leftovers from the rejected experiment.
- The original maps are already cut into tile pyramids for the app: app/tiles/<map>/<z>/<y>/<x>.jpg, 256 px tiles, zoom levels 0 to 5 (level 5 = native 8192 px), built by tools/build-tiles.mjs. Use them with a Leaflet tile layer in CRS.Simple. About 31 MB for all four maps.
- SYMBOL DIRECTION (owner's words): markers "in the style of the map", they should "blend in easily with the map while still being easily readable on first glance". That means inked, parchment-toned cartography symbols (closest earlier candidate: assets/anchor/b.png), with rim colour per group as already approved. Trimmed 96 px candidates are in assets/anchor/<a|b|c>-<boss|weapon|grace|key>.png.
- The owner also said: start generating the app assets now (symbols for all categories, route markers, tab icons, interface pieces, app icon). Generate one style anchor in the map's style, get it approved on a contact sheet rendered on the real map at real size (48 px), then generate the full set using the approved anchor as the reference image (images/edits) so the set is consistent. gpt-image-1.5 supports transparent backgrounds.
- After all custom assets are approved, re-run the UX review, then build the app.
- The project was moved to this PC through a private GitHub repository. The owner works from this PC from now on.
## UPDATE 3, evening of 2026-11-27: the app exists now. Read this first.

Owner decisions made in this session (they replace anything above that conflicts):
- Map: original wiki maps upscaled x2 with Real-ESRGAN (tools/upscale-map.mjs, 2048 px blocks with 64 px real padding, no seams found). Tiles in app/tiles, zoom 0 to 6, 89 MB, built by tools/build-tiles.mjs. assets/maps-up is ignored by git and can be rebuilt.
- Symbols: style "m3" (assets/anchor/m3.png), crisp, as compact discs with a thin rim (tools/tight-symbols.mjs -> app/icons). ONE fixed size on screen (40 px); the map zooms per step so that step's objectives fit. Plus, minus and re-centre buttons on the map.
- Rim colours: red bosses and invaders, gold gear, blue spells, green talismans, white places and NPCs, violet items. Violet and NPC white were my proposal; the owner has seen them but not explicitly confirmed.
- Step card (the owner rejected the DESIGN.md card): wider right panel; wiki walkthrough text first, in full, no "More"; then a compact list where EVERY objective has its own tick box; tapping an objective unfolds the wiki note for it and finds it on the map; tapping a map symbol opens the same note. One button: "Done" when all are ticked, otherwise "Next step, N left open"; steps with open objectives come back at the end of the route. Undo for 4 seconds.
- The owner is impatient with approval rounds: build, verify in the headless browser, then show. Still never show broken work.

What exists: app/ (index.html, app.css, app.js, sw.js, manifest, data/, icons/, tiles/, fonts/, vendor/leaflet). Data is built by tools/build-route.mjs (233 steps, 5,111 markers). Test with `node tools/serve.mjs` and `node tools/test-app.mjs` (all checks pass on tablet and phone sizes).

Open, in the owner's words or mine:
- Owner wants the wiki's walkthrough images, the detailed per-region / per-dungeon walkthrough pages with per-item info, and location pictures. Only the two overview walkthrough pages are in raw/; the detailed pages and images still have to be fetched from the wiki (politely) and wired into steps and item notes.
- Characters that change location: the wiki map has one marker per location ("... (First Location)"), each is its own objective in the nearest step. There is no quest-state logic yet.
- Walkthrough text is raw wiki prose (leftovers like "[ Map Coordinates for ...]" need cleaning). Missable line is a keyword heuristic.
- Item pictures in the list (tools/fetch-item-art.mjs) not fetched yet; rows show the category symbol.
- Quests tab is only a list of NPC markers; Gauntlet tab is a placeholder text. Remembrance symbol, route markers and app icon are first drafts.
- Nothing is committed or pushed since the session started; hosting (GitHub Pages) not set up. Ask before pushing.
- The OpenAI key was pasted into the chat in plain text; the owner was told to rotate it.

## UPDATE 4, late 2026-11-27
- Wiki pictures: tools/walk-images.mjs downloaded the pictures of every walkthrough section into app/walk (24 MB); 135 of 233 steps show them. tools/fetch-places.mjs saved the wiki's own page for 230 places (raw/places, data/places.json); 94 steps show its extra walkthrough text, notes or picture under "<place> in detail".
- Walkthrough text is cleaned of wiki leftovers. The keyword "Missable" guess was removed: the wiki walkthrough pages never mark anything as missable, so the app shows no missable warnings. A real source for missables is still needed.
- Quests tab: one block per character with every location in route order. Gauntlet tab: 160 distinct bosses in route order (not yet "lore strength" order; Boss Arena mod not set up).
- Map uses whole zoom levels only (half steps showed hairline gaps between tiles). Phone symbols are 30 px, tablet 40 px. Tight clusters zoom in deeper automatically.
- Owner accepted category symbols in lists instead of real item pictures.
- The owner checks from a phone: send screenshots with SendUserFile.

## UPDATE 5, 2026-11-28
- Live at https://mkultra1984.github.io/tarnished-route/ (repository is public; GitHub Pages deploys app/ on every push that touches it, via .github/workflows/pages.yml).
- History was rewritten to GitHub's no-reply author address before going public; keep using that identity (it is set in this repository's git config).
- The app updates itself: the deploy writes app/version.json, the app checks it on open, on return to the foreground and every 5 minutes, and reloads when it changed. Check with tools/test-update.mjs.


## UPDATE 6, 2026-11-28
- Undo is permanent (history of 200 moves, saved). Compact step card. Progress lives in localStorage on each device (no sync, no backup yet).
- Rerouting: objectives left open in passed steps show as 'Left open nearby' (list and map) in any later step within about 330 map px, are always listed behind the 'N open' counter in the header, and steps with open objectives return at the end of the route.
- Route data: base-game sections never use the Shadow map and DLC sections use it whenever they can (namesake markers had put 13 steps on the wrong map). 239 steps now.
- KNOWN, NOT FIXED: the order is the wiki walkthrough's section order and has not been checked for sense step by step. Legacy dungeons appear twice (overview sections plus the detailed section list: Stormveil, Leyndell), 17 consecutive steps jump more than 1500 map px (some are wrong pins, e.g. 'East Capital Rampart to Avenue Balcony'), and there is no final step for the last bosses of either game. The owner asked whether the walkthrough is coherent; this needs a real pass.


## UPDATE 7, 2026-11-28: route rebuilt from the place pages
- tools/fetch-places.mjs now saves the wiki page of every map location (297 pages, 234 with their own walkthrough). tools/build-route.mjs was rewritten (its header comment lists the rules): 372 steps = walkthrough sections in wiki order + a step per place with the place page's full text + places the walkthrough never mentions (after the nearest step). Speed-run blocks are dropped. Step ids are stable strings; saved progress key is tarnished-route-v2.
- tools/check-route.mjs is the whole-route coherence check (writes data/route-check.txt). Current result: all 1271 walkthrough paragraphs present, all 234 place walkthroughs present in full, all 5111 markers in exactly one step. Still open: 8 paragraphs shown twice, 12 out of wiki order, 128 objectives listed in one step but named only in another step's text, 856 objectives the wiki text never names (placed by map position only), 89 places ordered by map proximity because the walkthrough never mentions them, 8 long jumps. The check compares text and names; it cannot tell whether the order is actually playable (keys, locked areas). Run it after every rebuild.


## UPDATE 8, 2026-11-28
- The owner's point: the Fextralife walkthrough plus its subpages should cover everything. Measured: of 2025 objectives, about 1550 are named in the route's text, about 190 more are named on the walkthrough pages only inside item-list / speed-run blocks, about 170 only in place-page item lists, about 107 on no saved page under their map name (sets vs pieces, numbered items, merchants). My earlier '856 never named' figure was a name-matching fault (typographic apostrophes, '[2]' and ' - place' suffixes) and is wrong.
- fetch-places.mjs now also reads legacy-dungeon pages ('Full X Walkthrough' h2 followed by one h3 per part). The dungeon page's text is shown only where a part is not already its own step.
- Check result now: A/B/C pass; 3 paragraphs twice, 8 out of order, 153 objectives listed in a step other than the one whose text names them, 473 not named in the route text under their map name.


## UPDATE 9, 2026-11-28
- build-route.mjs: sections stay on the walkthrough's current map; a section naming only materials is folded into the previous step; a section takes one marker per name and picks the nearest variant ('Grafted Scion' vs 'Grafted Scion (Tutorial)'); an area's own item/boss lists place their items inside that area's steps; leftover markers go to the nearest step measured from its pin and what it named within 0.03 of the pin. Set TRACE='<marker title>' to see which rule placed a marker.
- Found and fixed with this: Stormveil Castle items had been landing in 'The Chapel of Anticipation' and 'Where is Boc?'. Similar faults may remain elsewhere; sample with the scratch script logic (objectives not named in their step's text, with their wiki description) before trusting a region.
- Check now: 356 steps; A/B/C pass; 1395 objectives named in their own step's text, 138 more in their place's item list, 112 named only in another step's text, 380 not named in route text under their map name.


## UPDATE 10 — route rules reworked (coherence round 2)

Faults found by going through the objectives whose text sits in another step, and fixed in `tools/build-route.mjs`:
- "Explore Siofra River" and "Investigate Ainsel River" were folded into surface steps. A section's map is now decided by the
  non-material things it names (or "(Underground)" in its title); going underground is always its own step.
- A link to the wiki home page was taken as the "place" of the Stormveil overview, so Stormveil never got its dungeon page.
- Where a section happens is decided by everything it names, not only by what earlier steps left unclaimed.
- A place's item list is applied after every section has taken what its text names. An area's overview is a weak owner:
  what a later part of the same area names goes to that part. A step whose title names a thing gets it.
- Names shared by many markers (Golden Seed, Scadutree Fragment) only count within 0.03; numbered things
  ("Cookbook [7]") only match with their number. A name can be both a grace and its boss.
- A place's own page text stays with the place (dedupe looks at place steps first). Area introductions go to the first
  step of their area, not the last step of the previous one. Wiki page footer ("Follow us on socials") dropped.
- `TRACE="<marker title>" node tools/build-route.mjs` prints which rule placed a marker.

Check now (369 steps): A/B/C pass. D: 1324 objectives named in their own step's text, 181 in their place's item list,
144 named only in another step's text (mostly far-away mentions and multi-location characters), 376 the walkthrough
text never names (they sit in the nearest step; the app shows the map's own note for them).
Still open: read-through of the order for playability; "Malenia, Blade of Miquella" merged into the Elphael place step;
the 144/376 have not been checked one by one.

## UPDATE 11 — route closed out: every objective has a reason, order checked against region gates

`node tools/check-route.mjs` now has hard checks that all pass (exit 0):
- A: all 1269 walkthrough paragraphs are in the route, none more often than the wiki has them, none out of wiki order.
- B: all 245 place walkthroughs in full. C: all 5111 markers in exactly one step.
- F: each of the 2025 objectives is where it is for a stated reason: its step is named after it (22), its step's text
  names it (1280), its place's own item list has it (195), or it is passed on the way and explained by the map's own
  note (528). None is named after another step, none is named only by a step that happens closer to it.
- G: no inserted place comes before the walkthrough opens its region (`tools/regions.mjs`: ENTRY per region, read from
  each place page's "Located In" box; SPECIAL for five places the walkthrough text itself puts at a point: Divine Tower
  of Limgrave after "After Godrick", Renna's Rise and Divine Tower of Liurnia after the Nokron step, Mohgwyn after
  "Cave of the Forlorn", Forge of the Giants right before Crumbling Farum Azula). Base-game steps never follow DLC steps.
D and E in the output are statistics only.

Rules added this round (all in `tools/build-route.mjs`, each commented where it lives):
- place regions from the wiki (`fetch-places.mjs` stores `region`); places and loose objectives never before their region opens
- a place the walkthrough describes later follows that section; waygate-only places follow the step that mentions them
- last look: an objective far from its step and right next to another one stays only if its step's text links it or
  writes it as a proper name ("Bolt of Gransax" yes, "iron ball trap" no); place names do not count ("Black Knife Catacombs")
- "After Godrick" restored (it is not part of the speed run); "Avenue Balcony to West Capital Rampart" is (dropped)
- wiki's own repeated paragraphs are kept in both steps; expansion steps stay on the expansion map
The full order (367 steps) was read through once by hand after these rules; the 10 jumps over 1500 px that remain are the
walkthrough's own area changes and waygates.

## UPDATE 12 (2026-11-28): the gauntlet mod (not yet played)

Lives outside this repo, in `Desktop\Projects\Elden ring\`:
- `boss-arena-src\` : the unpacked Boss Arena mod (Sandbox 3.10.1, Nexus 5645), untouched reference.
- `tarnished-gauntlet\` : our build. `mod\` is the mod with our changes, `Launch Tarnished Gauntlet.me3` starts it with its own
  save copy (`TarnishedGauntlet.sl2`), `tools\` holds the scripts that made the changes, `data\gauntlet-order.txt` the order.
- `gauntlet-tools\` : DarkScript3 3.6.3 (event scripts), esdtool 0.5.1 (menu scripts), WitchyBND 3.0.1.0 (game data, text).

What our build changes against the mod:
- Order (`tools\build-order.mjs`): 134 bosses, each once, from the mod's own progression tiers, written into the mod's custom
  boss rush slot 1. Repeats and weaker twins dropped (DROP list), Gideon / Godfrey-Hoarah Loux / Radagon-Elden Beast left out
  (SKIP), shardbearers last (LAST). `tools\check-order.mjs` checks every boss has a warp and a defeat handler.
- Roundtable Hold grace (`tools\patch-grace.mjs`): "Prepare the gauntlet" (first time), then "Start the gauntlet" /
  "Resume the gauntlet". Texts in `tools\patch-text.mjs`, applied to all 15 languages.
- Mod menus off and the mod's extra characters removed from the room (`tools\patch-npcs.mjs`, `tools\patch-events.mjs`).
  Hewg, Roderika, Gideon and the Twin Maiden Husks stay; Gideon no longer talks (his lines were the mod's boss menu).
- Game data (`tools\patch-regulation.mjs`): base is the mod's "Restore Scadutree Blessing mechanics" file; level-ups cost
  runes again; all area scaling tiers below Tier 18 raised to Tier 18, so early bosses are endgame strength.

How to rebuild: run the patch scripts from `tarnished-gauntlet\`, then
- events: `DOTNET_ROLL_FORWARD=LatestMajor DarkScript3.exe //cmd -compile -game er -indir <dir with the two .js> -outdir <out> -force`
  (in Git Bash the switch must be written `//cmd`; DarkScript3 wants .NET 6, the variable lets it run on the installed 9/10).
  Compiling the mod's untouched sources reproduces its files byte for byte.
- menus: `esdtool.exe -er -basedir <mod> -i <mod bnd> -i <.py files> -writebnd <out>`.
- data and text: WitchyBND unpack, edit the XML, WitchyBND on the XML, then on the folder. For regulation.bin WitchyBND refused
  ("regulation version exceeds latest known"); `Assets\Paramdex\ER\Upgrader\version.txt` was raised from 1_16_1 to 1_17_1
  (original kept as version.txt.orig). Check after repack: only CalcCorrectGraph and SpEffectParam differ from the base.

Not done: nobody has started the game with it yet. The Gauntlet tab in the app still lists 160 bosses in route order, not these 134.

## UPDATE 13 (2026-11-28)
- App: the Gauntlet tab is gone for good (owner: "its in the walkthrough anyway"). Four tabs: Route, Bosses, Collection, Quests.
- Gauntlet mod, no handouts: `tarnished-gauntlet\tools\patch-gifts.mjs` strips every item gift from "Prepare the gauntlet"
  (event 10010001), ends the gift events 11107803/811/821/843, removes the awards in 11107808 and the grace's
  "max out flasks" entry. Recompiled: common_func, m11_10_00_00 (DarkScript3), m00_00_00_00 talk (esdtool).
- Twin Maiden Husks: the mod had emptied their shop (11 of 737 rows). `tools\patch-shop.mjs` puts the game's own rows
  100000-102999 back into ShopLineupParam (vanilla regulation unpacked in `gauntlet-tools\work-vanilla`); regulation
  repacked from `gauntlet-tools\work-verify`, round-trip checked (194 tables identical to intent).
- Still untested in the game.
- Boss drops (owner request): `tools/boss-drops.mjs` (run by build-route) writes `drops` into markers.json: 245 items on
  194 bosses, read from the wiki notes ("Dropped by X") and matched to the boss marker beside them. The app does not list
  them as objectives; the boss row names them and ticking the boss ticks them (and the other way round in Collection).
  Test: `node tools/test-drops.mjs`.
- The Grafted Scion (Tutorial), its drops and the chapel's Stormhawk items moved from step 1 to The Four Belfries
  (build-route.mjs, just before "write").
- Start of the route (owner report): Fringefolk Hero's Grave was step 3, placed by distance although the wiki says
  "return later" and never says when. It is now right before Stormveil Castle (step 53), with a line about the two
  Stonesword Keys. Beach / Seaside Ruins items that hung on steps 2-3 as "nearby" moved to Coastal Cave and
  Dragon-Burnt Ruins (build-route.mjs, block before "write"). Known general weakness: "nearby" is as the crow flies,
  so cliffs are ignored; other steps may have the same kind of stray item.

## UPDATE 14 (2026-11-28)
- Tabs: Route, Bosses, Collection, Quests, Materials, Settings (the gear is gone). New tab icons were generated with
  `IMG_MODEL=gpt-image-1.5` and recoloured with `tools/match-tab-icons.mjs` so all six share one tone.
- OpenAI key: a 401 in a session usually means the session holds an old copy; read the stored user variable (never print it).
- Dungeon steps hold only what is inside (`tools/boss-drops.mjs`, second block; list in data/outside-moves.txt).
  "check the page here" sentences are removed there too. Step 1's starting-class sentence is replaced in build-route.mjs.
- Cards: `tools/fetch-cards.mjs` saves the wiki page of every boss and collectible (raw/cards, cached) and writes
  app/data/cards.json + app/cards/ pictures. all 1824 markers have a card and a picture (names resolved through the wiki index pages saved in raw/index; gestures and two empty cookbook pages use the list entry on the Gestures / Cookbooks page; Ghost Troll uses the Troll page, the turtle markers the Chelona's Rise page). Earlier note: (mostly numbered cookbooks /
  bell bearings whose page name differs). Tapping a row in Bosses / Collection, or "Picture and details" under an
  objective in a step, opens the card.
- Phone layout: app is `position:fixed; inset:0` and no longer uses viewport-fit=cover (Android Chrome hid the tab labels
  under the gesture bar). Sideways phones get map and text side by side.
- Offered, not done: shortening all walkthrough texts with a language model (3,092 paragraphs, ~180,000 words), with an
  automatic name/number check and a Short/Full switch. Waiting for the owner's go.

## UPDATE 15 (2026-11-28): the route now follows Redmaw
- Owner: "follow the Elden Ring Redmaw 100% walkthrough for order of acquiring, then use Fextra's descriptions, and
  if they are not there use Redmaw's". Redmaw = Elden Ring Completion Sheets, https://eldenring.redmaw.dev,
  github.com/rdmaw/elden-ring-completion-sheets (no licence file; credited in Settings). Saved in raw/redmaw/.
- `tools/build-route-redmaw.mjs` writes app/data/route.json: 1,324 steps (946 base, 378 expansion). Every sheet line
  that names an objective ends a step. Names are matched to the wiki map's markers (nearest unused one of that name);
  mentions ("use a Stonesword Key", "die to ...", notes) are not pick-ups; only red names can be bosses.
  Text of a step = the wiki's note per named thing, Redmaw's line where the wiki has none.
  People / bosses the sheet never names get their own step behind the nearest step; other unnamed things are
  "nearby, on the way" of the nearest step. Report: data/redmaw-report.txt.
- Build order now: `node tools/build-route.mjs` (markers.json, boss drops; also the OLD wiki-ordered route and its
  check-route.mjs), then `node tools/build-route-redmaw.mjs`, which replaces route.json. The old route's extras in
  boss-drops.mjs (dungeon clean-up, small steps) only matter for the old route.
- Known weak spots: 349 objectives are not named by the sheet in a way the matcher finds; a few names are matched to
  the wrong one of several same-named markers. Step ids changed, so saved step progress restarts (ticks are kept).
- The wiki's long texts are kept in the Redmaw route: 239 of its place pages as "... in detail" on the first step at
  the place, and 170 walkthrough sections as a fold-out "Wiki walkthrough: ..." on the step where their things begin
  (taken from the wiki-ordered route, saved as data/route-fextra.json by build-route-redmaw.mjs).
- Redmaw matching, second round (owner: "research all things not exact"): a sheet line is now read without its nested
  sub-lines (they were swallowed into one step before); names that can only mean one marker anchor the line; a drop
  named in a line identifies its boss; unlinked names in running text match things within 0.03; a second pass places
  things whose name a nearby step's line links; a repair pass swaps same-named picks that lie far from their
  neighbours. Result: 1,402 steps, 1,921 of 2,025 objectives in the sheet's order, 208 not placed by the sheet
  (137 of them are not in the sheet at all). `node tools/redmaw-audit.mjs --all` lists them (data/redmaw-audit.txt).
- App: when the route is rebuilt, saved ticks are carried over to step progress (carryOver in app.js).
- raw/redmaw/ (the four sheet pages) and raw/index/, raw/cards/ (saved wiki pages) are NOT in the repository. Refetch the
  sheets with: curl -sL https://raw.githubusercontent.com/rdmaw/elden-ring-completion-sheets/HEAD/sheets/<name>.html
  for walkthrough, dlc-walkthrough, npc-walkthrough, questlines.

## UPDATE 16 (2026-11-28): independent recheck, fixes
- Independent code review (a separate agent, read-only) found 14 defects; fixed: server error / stalled network no
  longer replaces a saved copy (sw.js, 8 s limit); offline after one visit (cards.json, tiles/meta.json in the shell,
  icons fetched once the worker controls the page); missable warnings shown in full; sideways phone starts a new step
  at its top; ticking in Bosses/Collection/Quests settles the step; ?tab= is not remembered; a step's card picture
  opens the card; ticking through a card keeps the list position; tiles/meta.json is no longer cached for good;
  end of route says "what you left open" and keeps Undo; tooltip text escaped; materials that are a step's own are
  listed. Tests: `node tools/test-fixes.mjs`.
  Not changed: ticks are stored by marker index (stable as long as markers.json is rebuilt from the same wiki data);
  pressing "Next step" while looking at a step through ?step= still marks that step.
- Route coherence (`node tools/route-coherence.mjs --all`, data/route-coherence.txt), fixed in build-route-redmaw.mjs:
  a step's text is now Redmaw's line (where to go, what to do) followed by the wiki's note per thing; a boss and its
  drops stay together; an objective far from its step's main thing becomes its own step; a person's numbered places
  come in order (2 left, both in steps the sheet itself orders that way); long or repeated titles are shortened and
  given their place; a step far from the one before names the nearest site of grace; drops are only matched to lines
  that speak of a fight; place names in a line say where it is. The same-name "repair" swap was removed: it did harm.
- Left: 87 long jumps between consecutive steps (the sheet fast-travels; 146 steps carry the grace hint), 41 same-named
  picks that lie far from the steps around them (not verified by hand), 204 objectives the sheet does not place.
- Third matching round (owner: "get to work"): of several same-named markers the one whose place (in its own name,
  "Stonesword Key - Stormhill Shack") is spoken of in the section title or the last lines wins; a mention word only
  counts right before the name; an enemy named as a landmark ("run past the Tree Sentinel") is not a fight; "x2" takes
  the next ones beside the first; a name the line links is not matched a second time from its text; the last free
  marker of a shared name is no longer taken blindly. App: "Next step" while looking through ?step= saves nothing;
  "Tick all" settles every step; Undo list is cleaned when left-open steps come back.
- Rest of the review: ticks are saved by map and position (gotV 2; old saves by number are still read); card pictures
  are asked for as cards/<file>?v=<cards.json v> (count v up when pictures are fetched again); the step header says
  "left open earlier" once the route has come round. `node tools/test-offline.mjs` checks offline start on the live app.

## UPDATE 17 (2026-11-28): completeness
- Owner asked why the tutorial gesture was no step, whether graces count, and what else 100% needs.
- Sites of Grace are now things to tick (cats kind 'g' in markers.json; inside build-route-redmaw.mjs they stay places).
  335 of 429 are named by a step, the rest are "nearby".
- `tools/sheet-only.mjs` -> data/sheet-only.json: 113 names the sheet has you obtain that the wiki map has no marker
  for; 82 of them (27 gestures, rewards from people, some weapons/sets) become objectives of their step. They are
  appended to markers.json with a[6] === 'rm' (stripped and re-added on every run).
- Redmaw's item sheets (raw/redmaw/weapons|armor|talismans|spells|ashes|key-items|miscellaneous-items.html) are the
  complete lists. 693 things on them had no marker at all (merchant wares, enemy drops, starting gear, remembrance
  trades): added to the Collection with map -1 (a[7] === 'list'), tickable, no place on the map, in no step.
  `node tools/completion-audit.mjs` compares the sheets with the markers (16 left, mostly plural boss names).
- Ticks are saved by map + position + kind + name (gotV 3); gotV 2 and number-keyed saves are still read.
- Cards for the 693 Collection-only things fetched (all have a card, 690 a picture); app/cards is 30 MB, cards.json v 4.
