# Touchline — the public site

A static season journal for D2 college soccer, rebuilt on every data collect.
Editorial at rest, analytical on intent.

The visual system is settled and binding: `reference/DESIGN-SYSTEM.md` (Season
Scorebook) with five pixel references in `reference/mocks/`. The shape of the
build is `reference/ARCHITECTURE.md`.

## Running it

```sh
bun install
bun run dev        # http://localhost:4321
bun run build      # → dist/   (413 pages for 2026 men, three conferences)
bun run preview
bun run check      # biome
bunx tsc --noEmit  # types
```

## The data home is read-only

Every figure on every page is recomputed at build time from the collected JSON.
Nothing here writes into the data home.

```
TOUCHLINE_DATA_DIR   the data home ROOT — the directory containing data/
                     default: ~/keelson/d2-soccer
```

The files read, and the contracts they must satisfy:

| File | Schema |
|---|---|
| `data/fixtures/{season}-{gender}-{conf}.json` | `touchline.fixtures/2` |
| `data/rosters/{season}-{gender}-{conf}.json` | `touchline.rosters/1` |
| `data/stats/{season}-{gender}-{conf}.json` | `touchline.stats/1` |
| `data/matches/{season}-{gender}-{conf}.json` | `touchline.matches/1` |
| `data/coverage.json` | `touchline.coverage/1` |
| `data/reference/programmes.json` | `touchline.programmes/2` |

`src/lib/model.ts` is vendored **verbatim** from the rib's `src/model.ts` — the
rib is the authority for these shapes. Re-copy it when the rib's model changes;
never edit it here. The only contract between the two repos is the JSON.

The rib also publishes one sample document per schema under its `contracts/`
directory. `src/lib/contracts.test.ts` parses each under this site's strict
schema, so a writer-side shape change fails in the rib's CI and a reader-side
tightening fails in `bun test` here, never on the published build. The fixtures
are read from the rib checkout, not copied:

```
TOUCHLINE_CONTRACTS_DIR   the rib's contracts/ directory
                          default: ../keelson-rib-touchline/contracts
```

When that directory is absent the suite skips, naming the path it looked at.

A file whose `schema` string is not the one this site reads fails the build with
that string named. Fixtures and the programmes reference are required; the
other layers are optional and their absence renders as a designed empty state,
with a warning naming the path.

## Conferences are configuration

`src/site.config.ts` holds the season, gender, and the conference file keys in
navigation order. No conference name appears anywhere in the code. Switching the
site to GSC or LSC alone is an edit to that file; all three render today.

Conference labels, programme names and abbreviations come from the data files'
own `programmes[]`. Opponents outside the collected conferences are named from
box scores where one exists, then from `nameOverrides`, then from the slug.

Each conference also names a region (`conferenceRegions`), and `site.regions`
lists the regions in navigation order. Regions are configuration too; they group
the footprint map's key and label the map itself (each region's label sits at
the centroid of its dots plus a per-region `label` nudge from the same table),
and the home page groups its cards the same way once the conferences outnumber
`homeColumnCap` (six today): one column each up to the cap, region bands past
it, each band a disclosure on a phone. The masthead's conference menu lists the
conferences the same way: region-major, each region a run of rows under its own
head, whole regions per column, three columns balanced by row count
(`src/lib/menu.ts`). The map draws every dot in one ink and tints nothing:
hovering a key row or a dot group selects that conference in purple, and the
key carries identity at rest. `src/lib/fixtures/density.ts` holds synthetic
12- and 19-conference sets so those can be tested before the conferences
exist; it is for tests only.

## Programme identity

The site reads `data/reference/programmes.json` from the data home
(`touchline.programmes/2`), beside `membership.json`. The rib builds it from
`pipeline/config/schools.toml` and the 2023 Census Gazetteer with
`uv run build-programmes`, and every collect mirrors it into the data home. One
row per slug: name, nickname, abbreviation, the town in AP state style
(`"Searcy, Ark."`), the town's point (its Gazetteer centroid, never the campus),
and provenance per fact. `src/lib/programmes.ts` vendors the rib's schema
verbatim, as `model.ts` does for the collected files.

```
TOUCHLINE_PROGRAMMES_FILE   the programmes reference
                            default: {data home}/data/reference/programmes.json
```

There is no copy in this repo and no fallback. A member of a followed
conference-season with no row fails the build, naming the slug and the
conference-season (`2026-men-rmac`). Opponents outside the followed conferences
have no row and render the designed absence state (`RU · AWAY` on the Match
Centre; the Team page's meta line simply starts at the record), so a match can
legitimately show an identity line on one side only. Nothing is ever guessed
from a slug.

## The journal (the AI seam)

One file per season/gender/conference, schema `touchline.journal/1`, looked up in
order:

1. `$TOUCHLINE_JOURNAL_DIR/journal-{season}-{gender}-{conf}.json`
2. `{data home}/data/journal/journal-…json`
3. `./journal/journal-…json`  ← where `journal/journal-2026-men-gac.json` lives
   today, seeded from `reference/journal.sample.json`

**AI is never a runtime dependency.** A journal that is missing, stale, or
malformed leaves the pages standing. Without one, the Season page composes its
headline, dek, pattern chart, findings and watchlist from the data alone — see
`fallbackPattern` / `fallbackFindings` in `src/lib/journal.ts` and
`conferenceLeaders` in `src/lib/derive.ts`. `/lsc/` and `/gsc/` show that state
right now; `/gac/` shows the written one.

### Writing one

```sh
bun run journal brief    --conference gac          # the facts pack, to stdout
bun run journal generate --conference gac --dry-run  # writes prompt + brief, calls nothing
bun run journal generate --conference gac [--model <id>] [--command <cmd>]
bun run journal validate --conference gac [--write] [--strict]
bun run journal run      --all [--concurrency 4]   # generate, then validate, four at a time
```

The generator is model-agnostic: it pipes a prompt to `claude -p` by default, and
`--command` points it at any program that reads a prompt on stdin and writes a
reply on stdout. `--from <file>` replays a saved reply instead of calling anything.

Under `--all` the conferences run side by side, at most `--concurrency` at a time
(default 4), and each validates the moment its own reply is in. One conference's
model failure is reported under its key and costs nobody else their run; the exit
code says whether any failed. The run ends with a timing block, one line per
conference, and the same figures land in the validation sidecar as `timing`
(`generate_ms` is null when no model was called). The division's journal
(`--national`) is a separate invocation that must come after them, because its
brief reads their output — `just journal` runs the two in that order.

The writer never sees the data home. It sees a **brief** (`scripts/journal/brief.ts`)
built by the same functions the pages use, so every figure it can reach is a figure
the validator can recompute. It also sees the previous journal, and is told to reuse
wording where the underlying facts have not changed.

### The validator

`bun run journal validate` recomputes every claim's `basis` against the data home
and **drops** what it cannot confirm. It never softens a claim and never edits a
number to match. Each run writes a sidecar, `journal-{key}.validation.json`, naming
every claim, the checker that judged it, the figure claimed, and the figure the data
actually holds.

| Verdict | Meaning | observed / derived | signal / projected |
|---|---|---|---|
| `verified` | every figure recomputed | keep | keep |
| `contradicted` | a figure disagrees with the data | **drop** | **drop** |
| `unverifiable` | no checker recognises the basis | **drop** | keep |

Signal and projected pass on schema, as the contract says — except that a figure the
data flatly contradicts is dropped whatever its label: no chip licenses a wrong
number.

Two things the pass reports without punishing:

- **Normalizations.** A `fixture_ref` that addresses exactly one real fixture but
  carries the writer's annotations (`… v southern-nazarene 1-2 12:30`) is a correct
  answer in the wrong format. It is rewritten to canonical form — `YYYY-MM-DD
  home-slug v away-slug` — and the rewrite is logged. Strictness is unchanged where
  it matters: a ref matching no fixture, or matching two, still drops.
- **Unchecked figures.** A numeric basis key no checker reads is named in the
  sidecar. It is not a failure — a basis may carry working notes — but an unread
  figure must never be mistaken for a confirmed one.

Checkers today: `player_stat`, `player_line`, `team_goals`, `team_goal_share`,
`team_record`, `outside_record`, `distinct_scorers`, `unresolved`,
`box_score_gaps`, `fixture_counts`, `conference_opens`, `goals_for_chart`,
`fixture_ref`. The basis shapes each one recognises are spelled out in the
generator prompt (`scripts/journal/prompt.ts`) — a claim written outside that
vocabulary is unauditable, and is dropped.

Every applicable checker examines the keys it recognises, so one basis is often
judged by several: a "player X has N of the team's M goals" claim is read by
`player_stat` on the player side and `team_goal_share` on the team side, and is
verified only if both hold.

A programme's "published goals" has two honest readings — totalled from the
fixtures' scorelines, and summed from the stats table's attributed scorers — and
they genuinely differ for seven programmes in the 2026 men's data (Saint Mary's
fixtures hold 5 while its stats page attributes none). A claim is held against
both, and the sidecar notes which one it rested on when they disagree. Picking
one reading would have manufactured contradictions.

Against the model-authored journal in `journal/`: **13 of 13 claims verify**, with
two fixture refs normalized.

The negative test that matters: tamper with the conference record, a chart bar, a
keeper's saves, a watchlist line, and a fixture reference, and all five are caught
with both the claimed figure and the real one named. Build the site against the
stripped journal and every hole falls back to the computed truth.

Generator output is committed and never produced at build time. A validated journal
that lost claims still renders: the site falls back to the computed figure for each
missing piece.

## Honesty states

Absence is content, never an error page. Three-state truth is kept throughout:
not collected ≠ not published ≠ no collector.

Match Centre renders six states from the same data:

| State | When |
|---|---|
| `played` | a box score was collected |
| `score-only` | result published, box score unreachable (reason shown) |
| `silent-final` | marked final, no score ever entered |
| `silent-past` | date passed, still listed as scheduled |
| `preview` | not played yet |
| `off` | postponed or cancelled |

## The play-by-play

Match Centre renders the whole published `plays[]` array as a ledger. It is a
**parse, not a rewrite** — no model runs anywhere near it, and every row keeps
the programme's own sentence in a `title` attribute.

Three rules the data insists on, each learned from a play that breaks the
obvious reading:

1. **A goal is a play carrying a `score` array** — never a play whose `type` is
   `"goal"` or `"penalty"`. Two of the four `penalty` plays in the 2026 data are
   *misses* (`"PENALTY KICK MISS, saved by …"`). Treating the type as the
   discriminator would put two goals on the site that were never scored.
2. **Document order is the record.** 28 plays across the three conferences have
   no clock — 25 of them in one GSC match. Those rows show an em-dash and say
   *no clock published*. Nothing is sorted by clock and no time is inferred.
3. **Names are cut at the sentence's own connectives** — `Assist by`, ` for `,
   `, saved by` — never at the first comma, because a published name *contains*
   a comma. Cutting there turns `"Doe, Lawrence Assist by Hernandez, Victor"`
   into a scorer called "Lawrence Assist by Hernandez".

The box score is the name authority: matching on a diacritic- and
punctuation-free token set lets `"Bolk, Philip"` render as **Philip Bölk**, the
spelling the rest of the page uses. A name the teamsheet does not carry is
flipped on its comma and otherwise left alone — including `"unknown player"`,
which is what the source actually said.

Other published forms the parser handles, all verified against 4,222 rendered
rows in all three conferences:

| Published | Rendered |
|---|---|
| `Foul on Delta State.` | `Foul on Delta State` — the side, not a player; the name stays |
| `GOAL by AUM TEAM.` | `GOAL — no player credited` |
| `Shot by Delta State Samuel Fitschen, High.` | abbr is `DELTA ST`, so stripping the team needs a word boundary or the scorer becomes "ate Samuel Fitschen" |
| `Shot by … , Save (by goalie) Maxwell Kruit.` | one collector's spelling of `, saved by` |
| `Shot by … , bottom left, Team save.` | `… — team save` |
| `Header Shot by …` | `Header — …` |
| `FOR RU: , #34 Neri, Samuele, …` | `Second-half lineup — 11 named` (a 400-character eleven, not a sentence) |

**Absence.** A match whose source published no play-by-play renders no section —
there is nothing withheld here to name, and the box score is still the page. A
match missing its `End of period [90:00]` play gets a HALF-TIME divider and no
FULL TIME divider; the running score reconciles with `teams[].score` in 39 of
39 matches, so a missing divider means a missing play, never a missing sum.

**Filters** are five radio inputs and their labels. No JavaScript: the ledger
filters identically with scripting off.

## Where the pixel references and the data disagree

The mocks were composed by hand from this collect. Where a mock figure is not
recomputable, the **data wins** and the difference is listed here.

| Mock | Data | Note |
|---|---|---|
| "WEEK 3 OF 16", Aug 3 · Sep 4 · Oct 5 · Nov 3 · Dec 1 | WEEK 4 OF 15, Aug 4 · Sep 4 · Oct 4 · Nov 2 · Dec 1 | See **Matchweeks** below. |
| "… 31 more first-period plays …" elisions | every play rendered | The elisions are the mock's own; the page shows the whole ledger. |
| Rosa 7′ | 6′ | As published. |
| Cautions 29′, 54′, 58′, 87′ | 29′, 49′, 54′, 58′ (+4 more) | Chronological, nothing skipped. All eight appear on the timeline. |
| "Around the conference" shows 3 of 4 results | all results from the latest day, capped with "+ n more" | |
| "Regis", "Maryville" | "Regis (CO)", "Maryville (MO)" | The names the box scores served. |
| Squad lists in roster order | ordered by shots (saves for keepers), then roster order | The mock's own order is inconsistent between lines. |

## Matchweeks

A matchweek is a **Sunday–Saturday week carrying at least one fixture**, labelled
by the month of its first fixture; the current week is the one containing the
collect date. GAC 2026 men comes out `WEEK 4 OF 15 · AUG 13 – DEC 3`.

The rib's board buckets weeks from the season's first fixture date — a different
rule in the same spirit. The two surfaces will therefore number weeks differently;
that is known and intended, not a bug, but do not quote one number at the other.

## Publishing

```sh
just            # collect → journal → build → publish
just verify     # types, lint, build — the gate before publishing
just build && just preview
```

Two more checks sit deliberately **outside** `just verify`, because both need
Chrome and a served artefact and both ask what the site *does* rather than what
the tree says: `just visual` pixel-diffs against a saved baseline and asserts no
page scrolls sideways at six widths, and `just keyboard` presses real keys at
the player sheet to hold the dialog's focus trap. Run them after a change that
should not have moved anything, and after a change to the sheet.

`just collect` delegates to the launchd cadence script that already owns the collect
command (`TOUCHLINE_COLLECT_CMD` overrides it); it is the only step that costs
network and time. `just publish` pushes `dist/` to a `gh-pages` branch via a git
worktree and refuses, with an instruction, if the repo has no `origin`.

**Live at https://ed-insights-ai.github.io/touchline-ui/** — GitHub Pages serving
the `gh-pages` branch directly. No CI, no secrets, no build on their side; what is
pushed is exactly what is served, which suits a site whose build input lives on one
machine. Each publish is a commit on that branch, so it reads as a record of what
was live when.

A project page serves from `/<repo>/`, so builds for it set `SITE_BASE`:

```sh
SITE_BASE=/touchline-ui SITE_URL=https://ed-insights-ai.github.io just build
just publish
```

The loop is **not yet automated**: the launchd cadence job still only runs the
collect, so the site holds at whatever collect last went through `just`.

Every internal link goes through that base. `dist/` is host-agnostic, so Cloudflare
Pages or Netlify would serve the same branch unchanged.

## What is not built yet

- The player sheet (`reference/mocks/player.html`) — a phase-2 island.
- Interaction model beyond links: week-dot rewind, evidence-chip provenance
  detail, coverage-gap detail. The hooks are in place (titles, hover states).
