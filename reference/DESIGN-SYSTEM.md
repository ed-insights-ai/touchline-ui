# Touchline — Design System (Season Scorebook)

User-approved direction, settled 2026-08-30. Living canvas (versions + sketches):
https://claude.ai/code/artifact/0dc63d1d-29ea-4afa-b059-556b3bb03794
Pixel reference: the five pages in `reference/mocks/` — treat them as the spec.

## Thesis

> **Touchline documents a season as it unfolds.**
> Editorial in how it explains the season, statistical in how it proves what it
> says, and interactive when the reader wants to investigate.
> **Editorial at rest. Analytical on intent.**

The product must feel purposeful at *every* sample size — the empty pre-conference
table, a player with 0-0-0, a match the site never scored — not only in a rich
mid-season state. Absence is content, never an error page (see `match-silent.html`).

## The six rules

1. **Serif means story.** Headlines, team names as subject, major score numerals,
   editorial stat figures. Face: **Newsreader** (Google Fonts; italic for the
   wordmark and captions; weight 500 display).
2. **Sans means information.** Tables, nav, labels, fixtures, metadata, controls.
   Face: **Public Sans** (400/500/600). `font-variant-numeric: tabular-nums` on
   every figure.
3. **Rules make structure, not cards.** Section = tiny uppercase label
   (11px, letter-spacing 0.2em, weight 600) over a 2px ink rule. Hairlines
   (#dbd8ce light / rgba(255,255,255,.1) dark) separate rows.
4. **Purple means Touchline.** #6d4fe0 (light) / #9b8eff (dark). Only for:
   identity mark, selection, current week, key upcoming fixture, evidence
   markers, interactive emphasis, home-side match events. Never decoration.
   Team pages do NOT inherit school colors.
5. **Cards represent objects, not sections.** Only a match/fixture gets a card
   (#fffdf9, 1px #dbd8ce border, 8px radius). "Players to watch" is a ruled
   section, not a card.
6. **Dark means the event.** Light pages explain time (season, team, player).
   Dark pages capture an event (Match Centre). Dark canvas #0e0f13.

## Tokens

| Token | Light | Dark |
|---|---|---|
| paper / canvas | `#f6f4ee` | `#0e0f13` |
| ink | `#1a1c22` | `#f1f1ec` |
| secondary | `#5f646e` | `#c9cac3` |
| faint | `#8b9096` | `#8e9096` |
| hairline | `#dbd8ce` | `rgba(255,255,255,.1)` |
| rule (section head) | 2px `#1a1c22` | label-only, no rule |
| accent | `#6d4fe0` | `#9b8eff` |
| accent wash | `rgba(109,79,224,.09)` | `rgba(155,142,255,.4)` border |
| win | `#147e4c` | same |
| draw | `#956500` | same (also caution cards) |
| loss / alert | `#be123c` (`#e0526b` on dark) | |
| result washes | `--win/draw/loss-wash`, the hue at 5% (season strip cells) |
| card surface | `#fffdf9` | — |
| light future | `#bebbb0` | — |
| position colors | GK `#7b61d7` · DEF `#3f70a9` · MID `#3b8a72` · FWD `#b8820f` (dots/chips only) |

Wordmark: 10px purple square (2px radius) + italic serif "Touchline".
W/D/L: 20px squares, 4px radius, white letter, win/draw/loss fills.
Hit targets in interactive UI: ≥44px. Charts: thin marks, 3-4px top radius,
selective labels (max + zero only), text in ink tokens never series color.

## Evidence grammar (the signature — do not fork it)

| Badge | Dots | Meaning |
|---|---|---|
| `OBSERVED` | ●●● | directly published / collected fact |
| `DERIVED` | ●●○ | computed exactly from published values |
| `SIGNAL` | ●●○ | meaningful pattern, cause unverified |
| `PROJECTED` | ●○○ | forward-looking estimate |
| `CONTEXT` | none | biography/background, not a finding (outlined chip) |

Chip styles: OBSERVED purple wash; DERIVED slate `#eef3f8`/`#2f5d8a`;
SIGNAL amber `#f5edd8`/`#7a6212`; PROJECTED gray `#ecebe6`/`#5f646e`;
CONTEXT 1px `#d8d5cd` outline, no fill.

## Interaction model (phase 2, design intent)

Table row hover → highlight; row click → Team. Fixture click → Match Centre.
Player click → Player *sheet over the current page* (never a destination;
deep-linkable state). Week dot click → season rewind (future). Evidence chip
click → provenance detail. "2 gaps" click → coverage detail.

## Voice

House register follows the rib: "programme", "Match Centre", evidence-first
copy, no hype. Every stat page carries a provenance line in italic serif, e.g.
*"From the programme's published box score."* Numbers must always be literally
true of the collected data — dates counted in days, not rounded to weeks.
