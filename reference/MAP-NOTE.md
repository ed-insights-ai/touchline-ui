# The Footprint — a map for Touchline

Investigation and pixel reference for the geographic view of the collected
season. `reference/mocks/map.html` is the binding pixel reference for the map
itself; the band that shipped from it is `src/components/FootprintBand.astro`,
and the coordinates both need are in the data home's
`data/reference/programmes.json` (`touchline.programmes/2`), beside
`membership.json`.

The question that started it: *can we show where the NCAA DII conferences are,
as a shape, with a dot per school?* The answer is yes for the dots, and **no for
the shapes** — for a reason that turned out to be the most interesting thing on
the page.

## The finding: a conference is a membership, not a territory

The obvious design is a tinted region per conference — a hull, a buffered union,
or a state-level choropleth. It is wrong here, and provably so.

Convex hulls over the 2026 men's member towns:

| pair | result |
|---|---|
| GAC / LSC | **overlap** |
| GAC / GSC | disjoint |
| LSC / GSC | disjoint |

Southern Nazarene (GAC, Bethany, Okla.) and Oklahoma Christian (LSC, Edmond,
Okla.) are **17 miles apart** — the second-closest pair of programmes on the
whole map — and they play in different leagues. Each sits inside the other
conference's hull. Shade either territory and the page states something false
about real ground.

So the map draws **no regions at all**. The basemap is uniform, the dots carry
every fact, and the absence of territories is published as a figure
(`0 TERRITORIES DRAWN`) rather than left as a silent styling choice. A
state-level choropleth fails the same way and for the same reason: Oklahoma
contains both leagues.

The mock makes the collision legible with a ×9 detail inset. At national scale
those two dots are 5.6px apart and render as one blob — asserting "17 miles
apart" while drawing a single dot would be the page contradicting itself.

## What is plotted, and what is not

29 programmes across GAC (7), LSC (11) and GSC (11), in 7 states. Counts are
read from each fixtures file's own `programmes[]` and reconcile to 29 of 29
coordinate rows with no orphans in either direction.

Three-state truth is kept:

- **Collected and placed** — 29 dots.
- **Collected but not placeable** — 124 out-of-conference opponents met in
  the 208 non-exhibition fixtures played outside these three conferences, plus
  12 exhibitions. The result is published; the opponent's home is not. Named as
  a figure, never invented.
- **No collector** — the 16 other D2 conferences that sponsor men's soccer.
  Drawn as nothing. Not an empty region, not a grey wash, not a guess.

That last figure carries a **CONTEXT** chip. That 19 conferences sponsor the
sport is not something this site's collect produces, so it is never counted
against the data. Everything else is OBSERVED (towns) or DERIVED (distances).

Every count that crosses the exhibition boundary names it, so this page's 379
reconciles against the season pages' countable 96 / 151 / 120:
`159 inside + 208 outside + 12 exhibitions = 379`.

## Why the empty nation is the content

All 29 dots fall in a band from x 348–702 of a 975-wide national frame. The
emptiness is not wasted space — it is the honest picture of a site that watches
three conferences out of nineteen. Cropping to the south-central states would
make the coverage look complete. The national frame is what makes
`16 CONFERENCES NOT COLLECTED` legible as a fact rather than a footnote.

It also quantifies the thing the reader is told about D2 — the regional model.
Widest internal gap: GAC 488 mi, LSC 574 mi, GSC 388 mi. Median trip between two
placeable programmes: GAC 226 mi, LSC 301 mi, GSC 208 mi.

## How it is drawn — no library, no tiles, no script

Verified end to end; every number below was measured, not estimated.

**Basemap.** `us-atlas@3/states-albers-10m.json` (US Census TIGER boundaries,
ISC-licensed package over public-domain source). It ships **already projected**
into a 975×610 Albers USA frame, so no projection runs at build time for the
outlines — the topology decodes straight to SVG path strings.

Simplified with Douglas–Peucker, all 51 states:

| tolerance | path data | verdict |
|---|---|---|
| 0.3 | 78 KB | more detail than the frame resolves |
| **0.6** | **46 KB** | **used in the mock** — crisp Great Lakes and Chesapeake |
| 1.0 | 20 KB | clean at this size; the production budget if 46 KB is too rich |
| 1.6 | 13 KB | still legible; coastlines start to read as approximations |

**Dots.** Towns are projected at build time by the Albers conic equal area in
`src/lib/geo.ts` — written out rather than imported, so the site takes no map
dependency at all. It reproduces `geoAlbersUsa().scale(1300).translate([487.5,
305])`, checked three ways: against d3-geo itself to **8.9e-13px** over a
372-point grid and over every collected programme; against the atlas, to
**0.454px across all 51 state bounding boxes**; and, in the test suite, by
requiring every programme to land inside the outline of the state its own
Gazetteer row names. Screen positions are never stored, so the dots and the
outlines cannot drift apart.

**Frame.** Lower 48. Alaska and Hawaii insets are dropped, and the caption says
so rather than letting their absence pass as coverage.

## The data contract this needs

**Since tl-891 (2026-09-02):** town and point live together in one file, the
data home's `data/reference/programmes.json` (`touchline.programmes/2`), built
in the rib against the same Gazetteer by `uv run build-programmes` and mirrored
beside `membership.json` by every collect. The site's two local files,
`programmes.json` and `programme-coordinates.json`, are gone. What follows is
the investigation as it was.

`programmes.json` already carries the town (`"Montgomery, Ala."`). It does not
carry coordinates, and nothing in the repo or the data home does — fixtures
carry a `venue` string but no location.

`programme-coordinates.json` (`touchline.coordinates/1`) is the sibling that
fills the gap, shaped like `programmes.json` and for the same reason: a
stable fact no collected page publishes, resolved once and versioned, never
geocoded at build time and never inferred from a slug.

Resolved against the **U.S. Census Bureau 2023 Gazetteer** (public domain) by
parsing `city` as `"Town, AP-state"`, mapping the AP abbreviation to its USPS
code, and matching the Gazetteer place name with its legal descriptor stripped.
Every row records the GEOID it resolved to, so any row can be re-checked.

28 of 29 matched automatically. Nashville did not — the Gazetteer lists it as
the consolidated *"Nashville-Davidson metropolitan government (balance)"* — so
that row carries a `note` saying why, rather than being quietly corrected.

The point is the **town centroid, not the campus**. That is deliberate: the town
is the fact `programmes.json` actually holds, and claiming campus precision from
a town string would be a fabrication. The caption says this out loud.

A slug with no coordinate row renders the designed absence: named and left
unplotted, never dropped and never guessed.

## Palette

GAC `#2f7d68`, LSC `#b4562a`, GSC `#3f70a9`. Touchline purple is untouched —
the nearest conference hue is ΔE 58 from `#6d4fe0`.

Colour-vision separation, minimum pairwise ΔE:

| palette | normal | protan | deutan | tritan |
|---|---|---|---|---|
| **proposed conferences** | 50.4 | **32.2** | **42.8** | 2.9 |
| system W/D/L | 63.2 | 15.4 | 21.4 | 48.1 |
| system position lines | 52.4 | 46.2 | 44.2 | 6.4 |

Better than shipping precedent on protan and deuteranopia, which together are
the ~8% that matters. Tritan collapses teal against blue; that is the same
tradeoff the position-line palette already makes (6.4), and forcing
tritan-safety drives the trio to blue/olive/magenta, which is out of register
for this system. Colour is never load-bearing regardless: each cluster is
direct-labelled, and per *"text in ink tokens never series color"* the map
labels are a colour swatch beside the code set in ink.

All three clear 4.5:1 on paper.

## Where it shipped

The band lives on the national home page (`src/components/FootprintBand.astro`),
at the 20 KB basemap tolerance. It carries the map, the conference key and one
caption — the territories finding, the detail inset and the evidence-chip
explanations stayed here, in the reference, because they are how the design was
arrived at rather than something a reader of a scorebook needs. The band prints
no fixture counts: the page's own footer already carries those, exhibitions
named and set outside the record.

The claim validator graduated too, as `src/lib/geo.test.ts`.

## What is not built

- **The other 16 conferences.** Placing them needs a verified membership list
  with towns. That is a collect-side contract, not something to hand-enter into
  a UI repo — and inventing it is exactly what this page refuses to do.
- **Responsive behaviour.** Like the other mocks, this is fixed at 1440. A real
  component needs a phone treatment; the honest one is probably the same map
  with the rail stacked beneath, since the dot cluster survives scaling but the
  legend does not.
- **Interaction.** Dots carry a `<title>` only. Hover-to-name, click-to-team,
  and filtering by conference are all phase-2 and all doable without script
  except the last.
- **Travel as drawn lines.** Fixtures give real home/away pairs, so trip arcs
  are computable and sourced — but 220 of them across three conferences is
  clutter at this scale, and the median/longest figures carry the point better.
