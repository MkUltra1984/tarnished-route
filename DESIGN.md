# Tarnished Route: design audit and spec

Scope: the Route screen (map + step card + bottom tabs) on an Android tablet in landscape (1280x800 CSS px) and an Android phone in portrait (412x915).
All values are CSS px. Screenshots are 2x, so measurements taken from them are halved.

Sources are listed in section 6 and referenced as [S1]...[S10]. Where a value is my own judgement and not from a source, it says so.

---

## 1. Audit

Measured from `shots/style-1.png`, `style-2.png`, `style-3.png`, `style-1-phone.png` and checked against `proto/split.html`.

### Broken (fix before anything else)

1. **DONE button is crushed in all three styles.** CSS asks for 84 / 76 / 68 px; rendered height is 26 px (style 1), 30 px (style 2), 30 px (style 3). The 28 px label has about 1 px of clearance, and in style 1 the inset border touches the letters. Cause: the card content is taller than the card, and the buttons are flex items that are allowed to shrink. Fix: footer is a non-shrinking block (`flex: none`), DONE has a fixed `height: 72px`, and only the middle region scrolls (section 2.6).
2. **Phone: the primary action is off screen.** Only the top 14 px of DONE is visible above the tab bar; Skip, Later and "Next:" are not visible at all and the card does not scroll. Fix: pinned footer on phone too (section 2.10).
3. **Style 3: the card overflows its own frame.** The card border ends at y=728 but "Next: Where is Boc?" is drawn at y=775, on top of the tab bar, colliding with the "Quests" tab label. Skip/Later straddle the card's bottom edge. Same cause and fix as 1.
4. **Style 3: map attribution is drawn over the Later button** (bottom right of the card). Fix: attribution goes bottom-left of the map pane and never under the card (section 3.5).
5. **Style 2: the "Next:" box is cut off by the tab bar** (about 30 of 48 px visible). Same cause and fix as 1.
6. **Map target label has a broken background.** The dark pill behind "GO HERE: Gatefront Ruins" is about 20 px wide and covers only "G"; the remaining 180 px of text sits directly on the map with no halo (the shadow is switched off for this label). Cause: the Leaflet icon is declared 10x10 and the text overflows it. Fix: measure the label and set the icon size to the real width and height; solid background behind the whole string (section 3.3).
7. **Map text and markers collide.** The target label sits on top of the "next" dot and the dashed line. The "You" label sits on the route line. Nothing checks for overlap except one hand-written case. Fix: the placement algorithm in section 3.3.
8. **Markers hide each other.** The 44 px target ring covers a weapon marker almost completely; the Ash of War marker covers the Key Item marker (about 80% hidden). Four items are on the card, but only two are clearly identifiable on the map. Fix: minimum centre distance and fan-out with leader lines (section 3.2).
9. **Phone: directions are removed entirely** (`#how{display:none}`). The step then says where and what, but not how. Fix: show them, clamped to 2 lines, tap to expand.

### Contrast

10. **Route line is nearly invisible on the map.** Gold `#e0c284` against sampled map colours (`#A49679`, `#9F8B72`, `#8C8678`, `#757C75`, `#677169`) gives 1.7:1 to 2.9:1. WCAG requires 3:1 for graphics needed to understand content [S5]. The 3 px dashed "next" line at 75% opacity is worse. Fix: dark casing under every line (section 3.4).
11. **"You" dot fill is 1.1:1 to 1.9:1 against the map.** It is only found because of its dark border. Fix: section 3.1.
12. **Button and box edges do not meet 3:1.** Border `#39342b` on panel `#1b1a18` is 1.41:1. Skip/Later fill `#262421` on the panel is 1.12:1 (style 2: `#2b2926` on `#191817`, 1.22:1, no border at all). The buttons read as slightly lighter rectangles, not as controls. Fix: `--outline #8A8168` (4.35:1) on every secondary control.
13. **Map labels use a blurred glow** (`text-shadow: 0 0 4px #000` three times) in place of a background. On the textured map the letters look soft; this is part of the "font sharpness" complaint. Fix: no text-shadow anywhere; solid label backgrounds.

Text contrast in the card itself passes (body `#d3ccbc` 10.9:1, muted `#a39c8c` 6.4:1, gold `#b89a5a` 6.5:1). The card's legibility problems are size and layout, not colour.

### Type

14. **Too many faces and treatments.** Cinzel 700 caps (style 1 title, region, DONE), Marcellus (style 3 title and region), Source Sans 3 (everything else), with letter-spacing of .04, .06, .12 and .14em in different places. Fix: two families, one tracking value for caps (section 2.2).
15. **Fractional and sub-scale sizes.** 13 px (GRAB label), 13.5 px (phone tabs), 11 px (attribution), 15 px and 17 px (map labels), against a stated scale of 14/16/18/24/32. 13.5 px renders on half pixels on non-integer DPR screens. Fix: sizes only from 12 / 14 / 16 / 18 / 22 / 28.
16. **`-webkit-font-smoothing: antialiased` on buttons only.** Button text is rendered thinner than the rest of the UI. Fix: remove it; one rendering mode everywhere.
17. **Target label is centred with `translateX(-50%)`.** With an odd width this lands on a half pixel and blurs the text. Fix: position labels at integer pixel offsets computed in JS.
18. **Style 1 title is all caps, 28 px Cinzel 700.** All-caps place names are slower to recognise and "GATEFRONT RUINS" already uses 84% of the line; a longer name ("Church of Dragon Communion") wraps to three lines. Fix: mixed case, max 2 lines.
19. **Directions are cut by character count** (190 characters, then "..."). The text ends mid-instruction ("...where you'll see a Noble Stormveil Soldier...") with no way to read the rest. Fix: clamp by lines, tap to expand; write each step's directions to fit 3 lines (about 140 characters).
20. **Secondary information is small for a glance.** Category labels and the step counter are 14 px, the section label 13 px, on a screen read from 50 to 70 cm. Fix: nothing the player must read mid-game is below 16 px; 14 px is for labels they can ignore (my judgement, see 2.2).

### Alignment and spacing

21. **Style 1 header is centred, everything else is left-aligned.** "STEP 6 OF 204" sits on a centre axis with flanking lines; title, text, list and "Next:" sit on the left edge. Two axes in one 380 px column. Fix: one left edge for all card content; the only right-aligned element is the progress percentage.
22. **Category label wraps and breaks the row** (styles 1 and 2). "Ashes of War" wraps to two lines, which forces "Ash of War: Storm Stomp" to wrap too, and the wrapped label's left edge (x=1175) does not line up with "Weapon" / "Key Item" (right-aligned at x=1247). Style 3 fits by 10 px of luck. Fix: category goes under the item name, left-aligned (section 2.7).
23. **Item names are bare text nodes next to a tile**, so a two-line name is centred against the tile but its first line no longer aligns with single-line rows. Fix: name and category in one text column, row height fixed at 64.
24. **Ten different corner radii**: 0, 2, 4, 8, 10, 12, 14, 24, 26, 36. In style 1 alone: card 4, tiles 8, Missable box 10, DONE 4. Fix: two radii, 4 and 8 (section 2.4).
25. **Spacing is off any grid**: 3, 6, 9, 10, 12, 14, 18, 22, 24, 26 px all appear as paddings or gaps. Map chips are inset 14 px left but 26 px from the bottom. Fix: 4 px base, tokens in section 2.1.
26. **Three control heights in one row family.** Region and search 48, map buttons 50, Skip/Later 52, tabs 56. Fix: 48 for all secondary controls, 64 for the tab bar, 72 for DONE.
27. **Style 1 frame wastes width.** 10 px margin + border + 6 px inner outline + 22 px padding: text starts 33 px from the pane edge, leaving 334 px of the 400 px pane for content, with two gold lines of decoration running the full height.
28. **Style 2 puts boxes inside boxes.** The Grab list is a rounded panel containing tiles that are themselves bordered boxes; "Next:" is a third panel style; Missable a fourth. Four container treatments in 400 px.
29. **"Missable: none" takes a 44 px bordered box to say nothing.** Green text in a box draws the eye on every step. Fix: plain one-line text when none; a red box only when something is missable.

### Hierarchy and wasted space

30. **Item rows show a category symbol, not the item.** All four rows in the screenshots fall back to the line glyph (no picture loaded), and two rows are the same glyph. The glyph is 34 px in a 56 px tile; the picture, when present, would be 52 px. Fix: picture fills a 56 px tile; the fallback glyph is 32 px, filled.
31. **Search occupies 300x48 px of map permanently** for a function used rarely mid-game, and is a `div` styled as a field. Fix: a 48 px icon button that expands.
32. **Map buttons have equal weight.** "-", "+", "Recenter" and "Show all markers" are four identical dark rectangles in a row 370 px wide over the bottom-left of the map. The +/- glyphs are thin 20 px characters in a 50 px box. Fix: section 3.5.
33. **Tab bar is text only**, 16 px muted labels, with the active state shown by a 3 px line and a colour change. No icons, so tabs cannot be found by shape at a glance. Fix: section 2.9.
34. **Phone tab labels are unevenly spaced and "Gauntlet" ends 11 px from the screen edge**, while "Route" starts 21 px in. Fix: five equal cells, label centred in each, 12 px labels under 24 px icons.
35. **Style 1 hides the progress percentage**; styles 2 and 3 show "2%" as bare text. Fix: a 4 px progress bar under the step counter plus the percentage, in all cases.
36. **Phone map is 42% of the height (384 px)** while the card cannot show its own buttons. Fix: map 34% of height, capped at 320 px.

### Icons (`proto/icons.js`)

37. **Line art at 1.7 units on a 32-unit box, drawn at 34 px = 1.8 px strokes.** On a textured map these read as scratches. Open outlines have no mass, so shapes are not recognisable at marker size.
38. **Only 13 of about 25 categories exist**; everything else falls back to the Locations pin.
39. **The glyphs are generic UI icons, not themed.** Weapons reads as a pencil, Key Items as a wrench/key hybrid, Spirit Ashes as a messaging-app ghost, Bosses as a cartoon skull, NPCs as an account avatar.
40. **Every category has the same frame** (dark disc, thin ring), so the only differences are a 1.8 px ring colour and a thin glyph. Weapons, Shields and Armor share one colour. Markers are 34 px, below the 48 px touch target [S2].

---

## 2. Spec

### 2.1 Layout and spacing

Base unit 4 px. Use only these: `--s1: 4`, `--s2: 8`, `--s3: 12`, `--s4: 16`, `--s6: 24`, `--s8: 32`.

Breakpoint follows Android window size classes [S1]: expanded width starts at 840.

| Window | Layout |
|---|---|
| width >= 840 and height >= 480 | Split: map `1fr`, card pane `400px` fixed (31% at 1280; Android's supporting-pane guidance is 70/30 at expanded width [S1]). Tab bar spans both. |
| otherwise | Stacked: map on top, card below, tab bar at the bottom [S1: supporting content below the main content at compact width]. |

Rows on tablet: content `1fr`, tab bar `64px`. At 1280x800 the card pane is 400x736.
Use `100dvh` and `env(safe-area-inset-*)` padding on the tab bar and map chips so the installed PWA clears the status and gesture bars.

Card pane: `background: var(--surface)`, 1 px `--divider` on the left edge, no margin, no frame, no radius. Horizontal padding 24 (tablet), 16 (phone). Content width 352 on tablet.

### 2.2 Type

Two families, both on Google Fonts:

- **Inter** (variable, 400 to 700): all UI text. Chosen over Source Sans 3 because its x-height is noticeably larger at the same font size, so the same px value reads bigger from a distance. Turn on tabular figures for the step counter (`font-variant-numeric: tabular-nums`).
- **Marcellus** (400 only): the place title and the region name. Nothing else. Never bold (no bold exists; the browser would fake it).

Drop Cinzel. No `text-shadow`, no `-webkit-font-smoothing` override, no fractional sizes, no CSS transforms on elements containing text.

| Token | Family / weight | Size / line | Tracking | Case | Used for |
|---|---|---|---|---|---|
| `title` | Marcellus 400 | 28 / 32 (phone 24 / 28) | 0 | Mixed | Place name. Max 2 lines, then ellipsis. |
| `region` | Marcellus 400 | 18 / 24 | .08em | Upper | Region chip on map |
| `action` | Inter 700 | 22 / 28 | .08em | Upper | DONE |
| `item` | Inter 600 | 18 / 24 | 0 | Mixed | Item name in Grab row |
| `body` | Inter 400 | 18 / 26 (phone 16 / 24) | 0 | Sentence | Directions |
| `button` | Inter 600 | 16 / 24 | 0 | Mixed | Skip, Later, map chips, Missable text, Next line |
| `meta` | Inter 600 | 14 / 20 | 0 | Mixed | Category under item name, percentage |
| `overline` | Inter 700 | 14 / 20 | .08em | Upper | "STEP 6 OF 204", "GRAB" |
| `maplabel` | Inter 700 | 14 / 20 | 0 | Mixed | Labels on the map |
| `micro` | Inter 500 | 12 / 16 | 0 | Mixed | Phone tab labels, attribution only |

Rules:
- Only one tracking value for caps: .08em. Caps only for `overline`, `action`, `region`.
- Text the player must read mid-game (title, directions, item names, Missable warning, DONE) is 16 px or larger. This is my judgement for a 50 to 70 cm viewing distance, not a figure from a standard; M3's own body sizes (14 to 16) [S3] assume a hand-held phone at about 30 cm.
- Body line length in the card is 352 px at 18 px, about 40 characters. Do not widen the pane to fit more text; shorten the text.

### 2.3 Colour

Gold on charcoal. Warm near-black neutrals, one accent.

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#16150F` | Tab bar, app background, behind map tiles |
| `--surface` | `#1F1D17` | Card pane |
| `--surface-2` | `#2A2720` | Item picture tile, secondary button fill |
| `--scrim` | `#0E0D0A` | Map chips and labels (at 92% opacity), marker fill, line casing |
| `--divider` | `#3D382D` | Hairlines between regions. Decorative only (1.45:1); never the only edge of a control. |
| `--outline` | `#8A8168` | 1 px border of every secondary control |
| `--text` | `#F2ECDD` | Primary text |
| `--text-2` | `#C9C1AE` | Directions, Next label |
| `--text-3` | `#A69E8B` | Category, section label, inactive tab |
| `--gold` | `#E3C27A` | Accent: DONE fill, active tab, step counter, target, route |
| `--gold-press` | `#CDA854` | DONE pressed |
| `--gold-dim` | `#3A3220` | Active tab indicator, selected row |
| `--on-gold` | `#1A1405` | Text on gold |
| `--danger` | `#F0806A` | Missable warning, boss |
| `--danger-bg` | `#2B1612` | Missable warning box fill |
| `--ok` | `#8FCB98` | "Missable: none" tick only |
| `--you` | `#4DA8E8` | Player dot |

Contrast (WCAG 2.2 relative luminance; minimums are 4.5:1 text, 3:1 large text of 24 px or 18.5 px bold, 3:1 UI components and graphics [S4][S5]):

| Foreground | on `--bg` | on `--surface` | on `--surface-2` | on `--scrim` |
|---|---|---|---|---|
| `--text` | 15.5 | 14.3 | 12.6 | 16.5 |
| `--text-2` | 10.2 | 9.4 | 8.3 | n/a |
| `--text-3` | 6.9 | 6.3 | 5.6 | 7.3 |
| `--gold` | 10.7 | 9.8 | 8.7 | 11.4 |
| `--danger` | n/a | 6.4 | n/a | 7.4 |
| `--ok` | n/a | 9.0 | n/a | 10.3 |
| `--outline` (needs 3) | 4.7 | 4.4 | 3.9 | n/a |

Other pairs: `--on-gold` on `--gold` 10.7; `--on-gold` on `--gold-press` 8.1; `--text` on `--danger-bg` 14.5; `--danger` on `--danger-bg` 6.5; `--gold` on `--gold-dim` 7.4; `--text` on `--gold-dim` 10.8.

On the map (colours sampled from the screenshot: `#A49679`, `#9F8B72`, `#8C8678`, `#757C75`, `#677169`, `#7A6E55`):

| Colour | vs map samples | Consequence |
|---|---|---|
| `--scrim` | 3.8 to 6.7 | Passes 3:1 everywhere sampled. Every map element gets a scrim fill or casing. |
| gold | 1.7 to 2.9 | Fails. Never draw gold directly on the map. |
| `--text` cream | 2.5 to 4.3 | Fails on light land. Not used as an outer edge. |
| `--you` blue | 1.1 to 2.0 | Fails. Needs a scrim ring. |

Rules: gold is for one thing per region (the primary action, the active tab, the target). No gradients on controls. No translucent card and no `backdrop-filter`.

### 2.4 Radii

- `--r-sm: 4px`: item picture tiles, map labels, progress bar ends (2).
- `--r-md: 8px`: every button, chip, input, the Missable box.
- Circles only for round map markers and the tab indicator pill (height / 2).
- Card pane and tab bar: 0.

### 2.5 Touch targets

Android recommends 48x48 with 8 between targets (about 9 mm) [S2]; WCAG's floor is 24x24 [S6]. This app is tapped at arm's length without looking closely, so 48 is the floor and the main action is larger.

| Control | Size | Gap to neighbour |
|---|---|---|
| DONE | full width x 72 (phone 64) | 8 |
| Skip, Later | half width x 48 | 8 between, 8 above |
| Map chips and buttons | 48 high, icon buttons 48x48 | 8 |
| Tab | 1/5 width x 64 | 0 (full cell is the target) |
| Grab row | full width x 64 (phone 56) | 4 |
| Map marker | 40 visible, 48x48 hit area | see 3.2 |

### 2.6 Step card structure (tablet, 400x736)

Three regions. Header and footer never scroll and never shrink (`flex: none`). The middle region is `flex: 1; min-height: 0; overflow-y: auto`.

**Header, fixed. Padding 16 24 12. Height 104 (136 with a two-line title).**

1. Step row, height 20. Left: `STEP 6 OF 204`, `overline`, `--gold`. Right: `2%`, `meta`, `--text-3`, right-aligned. Shared baseline.
2. Gap 8. Progress bar: full width, height 4, radius 2, track `--divider`, fill `--gold`.
3. Gap 12. Title: `title`, `--text`, left-aligned, max 2 lines.

**Body, scrolls. Padding 0 24 8.**

4. Directions: `body`, `--text-2`, left-aligned, clamped to 3 lines (`-webkit-line-clamp: 3`). Tapping the paragraph toggles the clamp. No character-count truncation.
5. Gap 16. Section label: `GRAB` + count (`GRAB 4`), `overline`, `--text-3`. Height 20.
6. Gap 8. Item rows (2.7), 64 high, 4 apart.
7. Gap 16. Missable line when nothing is missable: `Missable: none`, `button` size, `--text-3`, no box, height 24. Omitted when the warning box in the footer is shown.

When the body overflows, show a 24 px fade to `--surface` at its bottom edge and a 1 px `--divider` under the header.

**Footer, fixed. Padding 12 24 16. 1 px `--divider` on top. Height 192.**

8. Missable warning, only when something can be lost: box with `--danger-bg` fill, 1 px `--danger` border, radius 8, padding 12; text `button` size in `--text`, prefix "Missable:" in `--danger` 700. Max 3 lines. Gap 12 below. It lives in the footer so it is always visible next to DONE.
9. DONE: height 72.
10. Gap 8. Skip and Later: two equal columns, gap 8, height 48.
11. Gap 12. Next line, height 24, one line with ellipsis: `Next:` in `--text-3` 400, then the step name in `--text` 600, then `Boss` as a `--danger` 700 tag if applicable.

Height check: 736 - 104 - 192 = 440 for the body. Three lines of directions (78) + 16 + label (20) + 8 + four rows (268) + 16 + Missable line (24) = 430, plus 8 bottom padding = 438. Four items fit without scrolling; a fifth scrolls.

Everything in the card is left-aligned to the 24 px edge. Button labels are centred in their buttons. Nothing else is centred.

### 2.7 Item row

```
| 56 tile | 12 | name (item, 18/24, --text)            |
|         |    | category (meta, 14/20, --text-3)      |
```

- Row: height 64 (tile 56 + 4 above and below), `display: grid; grid-template-columns: 56px 1fr; column-gap: 12px; align-items: center`.
- Tile: 56x56, radius 4, fill `--surface-2`, no border, no gradient. Picture: 56x56, `object-fit: contain`, with 2 px inner padding. If no picture exists, the category glyph at 32 px, filled, in the category colour, centred.
- Number badge: 20x20 circle at the tile's top-left corner, overlapping the edge by 4. Fill `--gold`, digit `micro` 700 in `--on-gold`. The same number appears on the item's map marker (3.1). This is how a glance links a row to a marker.
- Name: one line, ellipsis. If the name does not fit one line, allow two lines and hide the category.
- Category: directly under the name, left-aligned with it, singular ("Weapon", "Ash of War"). Never in a right-hand column.
- Tapping a row pans the map to that marker and pulses it. The whole row is the target.
- Collected state: tile and text at 45% opacity, a tick replaces the number in the badge.

### 2.8 Buttons

| Level | Use | Height | Fill | Border | Label |
|---|---|---|---|---|---|
| Primary | DONE. One per screen. | 72 (phone 64) | `--gold` | none | `action`, `--on-gold`, centred |
| Secondary | Skip, Later, map chips | 48 | `--surface-2` (map: `--scrim` 92%) | 1 px `--outline` | `button`, `--text`, centred |
| Tertiary | "More" on directions, "Hide markers" | 48 hit area | none | none | `button`, `--gold` |

- All radius 8. Horizontal padding 16. Icon buttons 48x48 with a 24 px icon, 2 px stroke.
- Pressed: primary to `--gold-press`; secondary fill to `--divider`. Show the pressed state for at least 100 ms so a tap without looking is confirmed.
- Disabled: 40% opacity.
- Skip and Later are identical in weight. Neither is gold.
- After DONE, show a 4 second "Undo" bar in place of the Next line. A mis-tap is the most likely error on this screen.

### 2.9 Bottom tab bar

Five destinations is the maximum for a navigation bar [S7]. Android suggests a navigation rail for tablets [S3]; the owner has fixed bottom tabs, and a rail would take 80 px from the map, so the bar stays, using the horizontal item form that M3 specifies for windows 600 and wider [S7].

- Height 64 [S7], fill `--bg`, 1 px `--divider` on top. Five equal cells; the full cell is the target.
- Every tab has an icon (24 px, same icon rules as section 4) and a label. Never text only.
- Tablet: icon and label side by side, gap 8, label `button` (16/24, 600), centred as a group in the cell.
- Phone: icon above label, gap 4, label `micro` (12/16), centred.
- Active: icon and label `--gold`, sitting on a pill of `--gold-dim` (tablet: 40 high, padding 0 16; phone: 56x32 behind the icon only [S7]). Inactive: `--text-3`.
- Remove the 3 px top line.
- Tab labels are one word each. No truncation, no wrapping.

### 2.10 Phone (412x915)

Rows, top to bottom: map `clamp(240px, 34dvh, 320px)` (311 at 915), card `1fr`, tab bar 64.

- Card header: padding 12 16 8. Step row 20, gap 8, progress bar 4, gap 8, title 24/28 (max 2 lines). Height 88.
- Card body scrolls: directions 16/24 clamped to 2 lines (shown, not hidden), GRAB label, rows at 56 high with a 48 px tile, Missable line, then the Next line as the last item in the scroll.
- Card footer: padding 8 16 8. Missable warning box if present, DONE 64, gap 8, Skip and Later 48. Height 136.
- Budget: 915 - 311 - 64 - 88 - 136 = 316 for the body. Two lines of directions and about 3.5 rows are visible; the half row signals that the list scrolls.
- Map chips: region chip top-left, search and markers toggle as 48x48 icon buttons top-right, recenter bottom-right. No +/- buttons on phone (pinch).
- Marker and label sizes do not shrink on phone.

---

## 3. Map rules

### 3.1 Markers

Every marker has a `--scrim` fill or a `--scrim` outer casing, because only the scrim reaches 3:1 against the map (2.3). Shape tells the four roles apart; colour only reinforces it [S9].

| Role | Shape | Size | Build |
|---|---|---|---|
| You | Circle | 24 | Fill `--you`, 3 px `--text` ring, 2 px `--scrim` outer casing (total 34). Plus a 48 px halo of `--you` at 20%. No glyph. |
| Target | Teardrop pin, tip on the location | 40 wide x 52 high | Fill `--gold`, 2 px `--scrim` outline, 14 px `--scrim` dot in the head. Anchor is the tip, so the body sits above the place and does not cover items at it. |
| Item in this step | Circle | 40 | Fill `--scrim`, 2 px ring in the category colour, 1 px `--scrim` outer casing. Glyph 24 px, filled, category colour. Number badge 20 px at top-right matching the Grab row (2.7). |
| Next stop | Diamond (square rotated 45 degrees) | 28 across | Fill `--scrim`, 2 px `--gold` stroke, 1 px `--scrim` casing. No glyph. |
| Other markers ("show all") | Per section 4 | 28 | 70% opacity, below everything above, no labels, no badges. |

Stack order, top first: You, target, items, next, route lines, other markers.
Hit area 48x48 centred on every marker.

### 3.2 Marker collisions

1. Compute screen positions after every zoom, pan and resize.
2. If two item markers are closer than 44 px centre to centre, or an item is within 44 px of the target tip or the You dot, treat them as a cluster.
3. Fan the cluster's items out on a circle around the cluster centroid: radius 36 for 2 to 3 items, 52 for 4 to 6, starting at the top and going clockwise in Grab-list order. Draw a 2 px `--scrim` leader line with a 1 px `--text` core from each displaced marker to its true position, ending in a 6 px dot.
4. The target pin and the You dot never move. Items move around them.
5. If a fanned position would fall under a map control or outside the pane (8 px inset), rotate the fan in 45 degree steps until it does not.

### 3.3 Labels

Fewer labels is the main rule. Item markers get no text on the map; their names are in the card and the number badge links them. At most three labels exist by default:

| Priority | Label | Text | May be dropped |
|---|---|---|---|
| 1 | Target | Place name only (no "GO HERE:" prefix; the pin says that) | No |
| 2 | Next stop | `Next: <name>` | Yes |
| 3 | You | `You` | Yes |

Style: `maplabel` (Inter 700 14/20), `--text` on `--scrim` at 92%, padding 4 8, radius 4, 1 px border (`--gold` for the target, `--outline` for the others). Max width 200, one line, ellipsis. No text-shadow. The Leaflet icon size is the measured width and height of the label, so the background always covers the whole string. All positions rounded to whole pixels; no CSS transforms.

Placement, run after 3.2 and after every zoom, pan and resize:

1. Obstacles: every marker box grown by 4 px (including fanned positions and leader lines), every label already placed, every map control box, a strip 8 px wide inside the pane edges. Route lines grown by 4 px are soft obstacles (avoid if any candidate avoids them).
2. Process labels in priority order.
3. For each label, test candidate positions 8 px off the marker's edge in this order: above-right, below-right, above-left, below-left, above-centre, below-centre, right, left. This is the standard cartographic preference order for point labels [S8]. Take the first candidate that intersects no hard obstacle; among those, prefer one that also clears soft obstacles.
4. If none fits, try a callout: the same eight directions at 56 px distance, joined to the marker by a leader line (2 px `--scrim` with 1 px `--text` core) [S8].
5. If none fits and the label may be dropped, drop it.
6. If the target label does not fit, drop labels 2 and 3 and retry. If it still does not fit, show it as a chip docked at the top centre of the map pane, 16 px from the top.

Because a label is only placed where its box intersects nothing, and is removed otherwise, two labels can never overlap each other or a marker. Add an automated check: after placement, assert that no pair of label and marker rectangles intersects, at zoom levels 2 to 5 for every step in the route.

Tapping an item marker shows a callout with its name (same label style, placed by the same algorithm at priority 1.5) and highlights its Grab row. One callout at a time.

### 3.4 Route line

Straight segments are schematic, not paths; style them so they read as a pointer, not a road.

| Segment | Stroke | Casing (drawn first) |
|---|---|---|
| You to target | `--gold`, 4 px, solid, round caps | `--scrim`, 8 px, 90% opacity |
| Target to next | `--gold`, 3 px, dash `2 10` with round caps (dots) | `--scrim`, 7 px, 60% opacity, same dash |

- A filled gold chevron (12 px, scrim casing) at the midpoint of the You to target segment, pointing at the target. Skip it if the segment is shorter than 96 px.
- Lines stop at marker edges (shorten each end by the marker radius + 4) so they never run through a glyph.
- Lines are below all markers and labels.

### 3.5 Controls

All chips: height 48, radius 8, fill `--scrim` at 92%, 1 px `--outline`, 16 px from the pane edges, 8 px apart.

| Position | Control |
|---|---|
| Top-left | Region chip (`region` type, `--gold`, padding 0 16). Not a button unless it opens the region list; if it does, add a chevron. |
| Top-right | Markers toggle (icon + "All" / "Step", 48 high), then Search as a 48x48 icon button. Search expands leftward to a 320 px field on tap. |
| Bottom-right, vertical stack | Recenter (48x48, gold icon; it is the control used most), then +, then - (48x48 each, 24 px icons with 2 px strokes). |
| Bottom-left | Attribution: `micro`, `--text-3` on `--scrim` 80%, padding 2 8. Links in `--gold`. |

- Initial view: fit You, target and this step's items, with padding top 80, right 80, bottom 32, left 32 so nothing lands under a control. Include the next stop only if that does not more than double the fitted span; otherwise show the dotted line running to the pane edge.
- Use `zoomSnap: 0.5` or 1. Quarter steps resample the map image at odd scales and soften its lettering.
- Default view shows only this step's markers. "All" adds the others at 28 px and 70% opacity and never adds labels.

---

## 4. Icon direction

About 25 categories must be told apart at 24 px on a busy parchment map. Line art cannot do that. Use filled silhouettes inside coded frames.

### 4.1 Construction rules

- Grid 24x24, 2 px padding, 20x20 live area. One closed shape or a few; one colour; no gradients, no shading, no outlines-only drawing.
- Filled silhouette. Interior detail only as cut-outs (negative space) at least 2 px wide. No positive feature thinner than 2 px. No gap narrower than 2 px.
- Flat front or side view. No perspective, no three-quarter angle.
- Optical weight: the filled area covers 35 to 55% of the live area so no icon looks heavier than its neighbours.
- Same corner treatment throughout: sharp points on blades and stars, 1 px rounding elsewhere.
- Rendered sizes: 24 px in a 40 px map marker (60% of the frame, the ratio HERE uses for its markers [S10]); 16 px in a 28 px "show all" marker; 32 px in a card tile fallback; 24 px in tabs. Minimum is 16 px: every glyph must still be nameable there.
- Elden Ring's own motifs, not generic app icons: a greatsword in profile, a heater shield, a helm, a bell for spirit ashes, a sealed scroll for spells, the grace sunburst with a downward ray, a stake cross for Miquella.

### 4.2 Frame and colour coding

Frame shape carries the family; hue repeats it; the glyph carries the category [S9]. Six hues, all at least 7:1 on `--scrim`.

| Family | Frame | Hue | Categories and glyph subject |
|---|---|---|---|
| Gear | Circle | Gold `#E3C27A` | Weapons (greatsword), Shields (heater shield), Armor (helm), Talismans (medallion on a cord) |
| Arcane | Circle | Violet `#C9A0E8` | Ashes of War (flame over a blade tip), Spells (scroll with a star), Spirit Ashes (hand bell) |
| Progress | Circle, double ring | Cream `#F2ECDD` | Key Items (ornate key), Maps (folded map fragment), Remembrances (rune arc), Flask Upgrades (flask), Scadutree Fragments (branching twig), Miquella's Crosses (stake cross) |
| Materials | Circle, 28 px even in step view | Green `#8FCB98` | Upgrade Materials (smithing stone shard), Crafting Materials (herb sprig), Consumables (pouch) |
| Places | Diamond | Blue `#7CC0EE` | Sites of Grace (sunburst with ray), Locations (ruined arch), Dungeons (cave mouth), Waygates (ring portal), Spiritsprings (updraft swirl), Summoning Pools (effigy) |
| Characters | Hexagon | Red `#F0806A` for hostile, cream for friendly | Bosses (horned skull), Invaders (hooded head with crossed blade), NPCs (hooded bust, cream) |

Frame build is as in 3.1: `--scrim` fill, 2 px ring in the family hue, 1 px `--scrim` casing. A user who cannot tell the hues apart still has frame shape plus glyph.

### 4.3 Sourcing

Fastest route to a consistent set: start from an existing filled fantasy set (for example game-icons.net, which I recall as CC BY 3.0; confirm the licence and attribution terms before shipping) and redraw only the gaps to match. Generate with an image model only for categories the set lacks, then vectorise, because raster output will not be pixel-aligned or weight-matched on its own.

Prompt template (one image per category; keep everything except the bracketed subject identical between runs):

```
A single flat pictogram of [SUBJECT, e.g. "a medieval greatsword seen from the side, blade pointing up-right"].
Solid pure black silhouette on a pure white background. One object, centred, filling about 80% of a square canvas.
Bold simple shapes, no outline strokes, no thin lines, no shading, no gradients, no texture, no perspective, no text, no border, no frame.
Interior details only as a few wide white cut-outs. Dark-fantasy heraldic style, like a stamped wax seal or a woodcut emblem.
Must stay recognisable when shrunk to 16 pixels. Square 1:1, 1024x1024.
```

Post-process: threshold to 1-bit, trace to SVG (potrace or similar), simplify paths, scale into the 20 px live area of the 24 grid, snap key edges to whole units, set `fill="currentColor"`.

### 4.4 Acceptance checks

1. **Size test**: render all glyphs at 16 and 24 px in a grid. Someone who knows the game names each one without a legend. Any miss is redrawn.
2. **Confusion test**: show the grid again and ask for the closest look-alike pairs. No pair may be confusable within a family (Weapons vs Ashes of War and Key Items vs Remembrances are the likely failures).
3. **Blur test**: apply a 1.5 px Gaussian blur at 24 px. Each silhouette is still distinct from the others.
4. **Background test**: place the 40 px markers on five crops of the real map (light parchment, forest, water, dark cliff, snow). Frame edge reads on all five.
5. **Weight test**: filled-pixel count of each glyph at 24 px is within 35 to 55% of 400. Outliers are thinned or thickened.
6. **Geometry lint**: no feature or gap under 2 units; viewBox 0 0 24 24; one colour; no strokes; each file under 1.5 KB.
7. **Greyscale test**: view the map in greyscale. Families are still told apart by frame shape.
8. **Count**: all categories have their own glyph. No fallback to the Locations pin.

---

## 5. Style recommendation

**Build on style 2 (clean). Drop styles 1 and 3.**

Why style 2: it is the only one where the card is a plain full-height pane with a single left edge, mixed-case title, and a solid, edge-defined primary button. Those are the properties that matter for a one-second glance: fixed positions, one alignment axis, highest contrast on the action.

Why not style 1 (ornate frame): the double frame costs 33 px of margin on each side of a 400 px pane, adds two full-height gold lines that compete with the gold that should mean "action", centres the header against a left-aligned body, and sets the title in bold caps that wrap sooner and read slower. The inset border on DONE shrinks its usable label area.

Why not style 3 (HUD): a translucent card puts map texture behind 16 px text and behind item pictures, so contrast varies with whatever the map shows; `backdrop-filter` is a per-frame GPU cost on a mid-range Android tablet while the map pans; the DONE button fades to nothing at both ends, so it has no edges; and the card still covers the same 400 px of map, so the full-bleed map gains nothing. It also needed special-case offsets for the map header and attribution, and got one of them wrong.

Changes to style 2 to reach this spec:

1. Fix the layout first: fixed header, scrolling body, fixed non-shrinking footer; DONE 72 high (2.6).
2. Replace all pill shapes (radii 24, 26, 36) with radius 8. Pills and a parchment map do not belong together; squared-off 8 px corners keep it sober.
3. Remove the Grab panel, the Next panel and the Missable box (when none). One surface, hairline dividers only.
4. Put the category under the item name; add number badges to rows and markers.
5. Take two things from the other styles: the Marcellus title (from style 3) and the gold region name in Marcellus caps (from styles 1 and 3). That is all the "fantasy" the screen needs; the map and the item pictures supply the rest.
6. Give Skip and Later a visible 1 px `--outline` border.
7. Swap Source Sans 3 for Inter; apply the type table in 2.2.
8. Rebuild the map layer per section 3 and the icon set per section 4.
9. Tab bar: 64 high, icons plus labels, pill indicator.

---

## 6. Sources

- [S1] Android Developers, window size classes and canonical layouts (breakpoints 600 / 840; supporting pane 70/30 at expanded width; supporting content below the main content at compact width). https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes and https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts
- [S2] Android Accessibility Help, touch target size (48x48 dp, 8 dp apart, about 9 mm). https://support.google.com/accessibility/android/answer/7101858
- [S3] Android Developers, Material Design 3 in Compose (M3 type scale values, shape scale 4 / 8 / 12 / 16 / 24, button emphasis levels, navigation bar vs rail). https://developer.android.com/develop/ui/compose/designsystems/material3
- [S4] W3C, Understanding WCAG 2.2 SC 1.4.3 Contrast (Minimum) (4.5:1; 3:1 for large text). https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- [S5] W3C, Understanding SC 1.4.11 Non-text Contrast (3:1 for UI components and graphics). https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- [S6] W3C, Understanding SC 2.5.8 Target Size (Minimum) (24x24). https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- [S7] Material Components for Android, navigation bar documentation (3 to 5 destinations, 24 dp icons, 56x32 active indicator, 64 dp height and horizontal items at 600 dp and wider). https://github.com/material-components/material-components-android/blob/master/docs/components/BottomNavigation.md
- [S8] Ordnance Survey, Guide to cartography: text on maps (point label position ranking, halos or masks over detail, leader lines when space is tight, unambiguous label-to-feature link). https://docs.os.uk/more-than-maps/geographic-data-visualisation/guide-to-cartography/text-on-maps and Mapbox, optimise map label placement (ordered anchor candidates; hide the label if none fits). https://docs.mapbox.com/help/troubleshooting/optimize-map-label-placement/
- [S9] UCGIS GIS&T Body of Knowledge, CV-04-034 Map Icon Design (frame shape for higher-level category, hue for nominal difference, few colours, consistent abstraction level). https://gistbok-ltb.ucgis.org/current/concept/CV-04-034
- [S10] HERE, icon design guidelines (glyph at most 12 px inside a 20 px marker, 1 px outline, 1 px minimum padding). https://docs.here.com/style-editor/docs/icon-design-guidelines

Not sourced: the m3.material.io specification pages could not be read (they render client-side), so M3 values above come from the Android developer and Material Components documentation instead. The 16 px reading-size floor, the marker sizes, the fan-out radii and the map padding values are my own design decisions. Map colours were sampled from six points of one screenshot of Limgrave; re-check line and marker contrast on darker regions (Caelid, underground maps) before finalising.
