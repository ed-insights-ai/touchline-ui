# Touchline UI — Architecture

The site is a **static season journal rebuilt on every data collect**, with an
AI editorial step that writes the stories and a validator that keeps the AI
honest. No server, no database at runtime.

```
launchd (daily)
  └─ ~/.keelson/scripts/touchline-collect-cadence.sh   (a shim; execs the rib's
       bin/touchline-collect-cadence.sh)
        ├─ collect ───────────► data home JSON (source of truth)
        │     ~/keelson/d2-soccer/data/{fixtures,rosters,stats,matches}/
        │       {season}-{gender}-{conference}.json, plus coverage.json
        │     data/reference/{membership,programmes}.json
        │     data/raw_html (the fetch cache), data/errors, data/research,
        │     data/reports
        │     contracts the rib publishes under its contracts/: fixtures-2,
        │       rosters-1, stats-1, matches-1, coverage-1, programmes-2,
        │       membership
        ├─ journal ───────────► journal/journal-{season}-{gender}-{conf}.json
        │     one per changed conference, then journal-{season}-{gender}-national.json
        │     guardrail: the VALIDATOR recomputes every OBSERVED/DERIVED claim
        │     against the data and DROPS what it cannot confirm; dropped
        │     claims land in a .validation.json sidecar with both figures
        └─ just publish ──────► gh-pages (GitHub Pages serves the branch verbatim)
              build (Astro, static) → bun test → link check → push from a
              worktree → assert the deployed host serves this build's stamp
```

## Why static

- Data changes at most a few times a day (collect cadence), not per-request.
- Pages are read-heavy, content-shaped, and must be cheap to publish.
- "Editorial at rest, analytical on intent": rest = prerendered HTML; intent =
  three small client scripts reading the same page (below). Everything else
  is HTML and CSS.

## The data home

Read-only to this repo. `TOUCHLINE_DATA_DIR` names its root (default
`~/keelson/d2-soccer`); `src/lib/data.ts` is the only reader of the season
files and refuses a file whose `schema` string it does not know. The four
season files are read per conference under `touchline.fixtures/2`,
`rosters/1`, `stats/1` and `matches/1`; `coverage.json` (`touchline.coverage/1`)
records what each collect managed, in four states (complete, empty,
unavailable, no-collector). `data/reference/programmes.json`
(`touchline.programmes/2`) supplies nickname, town and map point per
programme; a followed member with no row fails the build, a stranger renders
the designed absence state, and nothing is ever guessed from a slug.

`src/lib/model.ts` descends from the rib's `src/model.ts` and this site owns
the copy: it carries site-side rules (the forfeit award in `outcome`, the
exhibition and non-member guards in `computeTable`) the rib's file does not.
Nothing is imported from the rib. Two tests hold the copy to the rib's
published contract, reading the rib checkout (`TOUCHLINE_CONTRACTS_DIR`, or a
sibling `keelson-rib-touchline/contracts`): `contracts.test.ts` parses every
published sample under the strict schemas here, and `model-drift.test.ts`
compares the field inventory of the four season-file schemas with what the
rib's samples exercise, in both directions, naming any key that drifts.

## Configuration

`src/site.config.ts` describes the whole site, and a conference is
configuration, never a literal in code. Today it lists 19 conferences in
navigation order (the file keys), a display name for each, six regions in
navigation order, `conferenceRegions` mapping every conference to one of them
(`lib/regions.ts` refuses to build otherwise), `home` (the conference the
root opens on), and `homeColumnCap`: up to that many conferences the home
page shows one column each, in kickoff order; past it the same cards flow
into region bands, one per region. Season and gender come from the same file
(`TOUCHLINE_SEASON`, `TOUCHLINE_GENDER` override).

## The journal (the AI seam)

`scripts/journal/cli.ts` is the AI step, run by the cadence and never by the
site build: `brief`, `generate`, `validate`, `run` per conference (`--all`
runs them side by side, four at a time), and the same four with `--national`,
which runs after the conferences because its brief reads their journals.
Output goes to this repo's `journal/` (the cadence commits it to main), never
into the data home; the site reads `TOUCHLINE_JOURNAL_DIR`, then the data
home's `data/journal`, then `./journal`.

A conference journal (`touchline.journal/1`) carries a headline and dek with
a `lede_basis`, `findings[]` each with a `label` (observed, derived, signal,
projected, context), `text` and `basis`, a `pattern` with its chart,
`players_to_watch`, featured matches by fixture ref, and a `wire`: the one
line written for the national page's card. The national journal
(`touchline.national/1`) writes the masthead over the division's ledger and
cards. Two dates are computed, never written: `lede_updated` and
`wire.updated` carry forward when the text comes back word for word and
restamp on the collect date when it moves (`scripts/journal/wire.ts`).

The validator (`validate.ts`, `national-validate.ts`) recomputes each
OBSERVED and DERIVED basis against the data home and drops any claim it
cannot confirm or does not understand; it never softens a claim or rewrites a
number. It also drops a line that restates another (`src/lib/prose.ts`, the
same rule `copy.test.ts` holds the site's own prose to). The build must not
break if a journal is missing, stale or malformed: pages render from data
alone with computed fallbacks, and a journal whose `data_collected_at` is not
the file's collect is marked stale.

## What the pages derive

- **The table.** `computeTable` ranks conference play; `computeOverallTable`
  ranks every countable match before conference play opens. A conference
  that prints its standings in divisions carries the division on each
  programme, and `lib/standings.ts` groups the conference-wide ranking by
  division in the order the divisions first appear; it never recomputes a
  row. Exhibitions (`match_type: exhibition`) count nowhere.
- **The fold** (`lib/division.ts`). A match between two followed conferences
  is in two files with two ids, so every cross-conference list folds
  sightings into one match by identity. The canonical record is the home
  side's conference. A match is neutral when any record carries the
  collector's `neutral` flag OR the records disagree on the home side and
  agree on everything else; it then has no home side. A scored final beside
  a scheduled or postponed twin is a lag, not a dispute: the fold takes the
  final and marks it one-sided. Two finals with different scores are
  disputed: the row is kept, marked wherever a score prints, both scores
  stand with their sources, and nothing counts it until they agree. A forfeit
  is the fuller fact and wins the canonical record. Cancelled, postponed and
  scheduled are one unplayed shape; a final against a cancelled twin is the
  one disagreement that still fails the build.
- **Match states** (`lib/matchstate.ts`). Six readings of one fixture
  (played, score-only, silent-final, silent-past, preview, off), each with its
  own footnote and provenance line; the words withheld, refused and declined
  are barred. Not collected is not the same as not published.
- **The play ledger** (`lib/plays.ts`, `PlayLedger.astro`) parses Sidearm's
  published play sentences deterministically: a goal is a play carrying a
  `score`, document order is the record, and the published string travels
  with every row. `lib/timeline.ts` and `MatchTimeline.astro` draw the same
  plays to scale.
- **The footprint map** (`lib/geo.ts`, `lib/basemap.ts`, `HomeMap.astro`)
  places every programme by its gazetteer point on an Albers basemap of the
  lower 48 and labels regions; a programme without a point is named as
  unplaced. Each conference wears one of six hues by its config position
  (`lib/home.ts`), on the map, the bands and the menu alike.
- **Matchweeks** run Monday to Sunday; a week with a fixture is a matchweek,
  numbered in order and belonging to the month of its first fixture.
- **The home page** (`lib/home.ts`) sums nothing a season page does not show:
  columns or region bands of cards, last night's folded ledger, and a
  masthead from the national journal or its computed floor.

## Interaction

Three scripts exist, and each adds only what HTML cannot say: the player
sheet (`PlayerSheet.astro`, opened by `:target`; the script holds focus), the
masthead menu (`SiteHeader.astro`, a `<details>`; the script adds
aria-expanded, arrow keys and Escape), and the home page's band toggle
(`HomeConferences.astro`). The conference menu panel and the match timeline
are script-free. Turn scripting off and every page still works.

## Deploy

`just publish` rebuilds with `SITE_BASE=/touchline-ui` (a project page serves
under `/<repo>/`, and a base-less build 404s every link), runs the tests,
checks every internal link in `dist/`, then pushes `dist/` to `gh-pages`
from a git worktree so each deploy is a commit on the last, and finally asks
the live host for this build's stamp. The rib's cadence script runs
`just publish` once at the end of a run in which a conference changed. There
is no GitHub Action and no CI on the host: what is pushed is what is served.
`just verify` (types, biome, build, tests, links) is the gate.

## Ground rules

1. **The data home is read-only to this repo.** Nothing here opens a file
   there for writing; the journal writes beside the site, not in the home.
2. **Conference-agnostic.** No conference name appears in code. Adding one is
   an edit to `site.config.ts` and a collect.
3. **Contracts over scraping.** Consume the versioned JSON shapes; the drift
   tests say which key moved when the rib's contract changes.
4. **Honesty states are first-class.** Score-less finals, past-date silences,
   coverage gaps, one-sided and disputed records each have a designed state.
5. **Every number on a page must be recomputable from the data home.** The
   validator holds the journal to it; the tests hold the pages to it.
6. **Text as published.** Names, plays and figures print as the source
   published them; nothing is inferred from a slug or invented for a gap.

## History

This document was a build plan (concept, journal contract, suggested build
order) from the first commit until 2026-09-06, when it was rewritten as the
architecture as built. The git history of this file holds the plan; the
design mocks it referred to live in `reference/mocks/`.
