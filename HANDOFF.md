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
