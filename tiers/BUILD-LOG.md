# Player tiers: build log, implements ALGORITHM.md version 2.2

This build implements **ALGORITHM.md version 2.2**, with the reconciliation rulings R-A to R-F, S3
and S4 applied where 2.2 is silent or was corrected (see [Reconciliation with the Python
build](#reconciliation-with-the-python-build)).

| | |
| --- | --- |
| Built | 2026-11-16, after the reconciliation. `frozen_at` is 2026-11-16 in every file, the date this freeze fixes. |
| Contract | `docs/specs/player-tiers/ALGORITHM.md`, **version 2.2**, for specification draft 0.6 (ed-insights-platform). Sections 1, 4.2, 4.4, 4.6, 10 and 11 were re-read against this build before it was committed. The rulings are written up, with their evidence, in `docs/specs/player-tiers/reference/RECONCILIATION.md` (ed-insights-platform). |
| Data home | `~/keelson/d2-soccer` at **`ea45f891+dirty`**. It has three modified, uncommitted files: `data/coverage.json`, `data/fixtures/2026-women-ccaa.json` and `data/fixtures/2026-women-gliac.json`. The build only reads it, and refuses an `--out` inside it. `git status` there was the same before and after every build. |
| Site | `feature/player-tiers`, branched from `e5bf621c6e` |
| Command | `bun run tiers:build` (= `bun run scripts/tiers/build.ts --out tiers/d2 --frozen-at 2026-11-16`). It takes about 8 s, because each gender is computed twice: once for the files and once with the roster pass off, for acceptance 11.4. |
| Output | `tiers/d2/{2022..2026}-{men,women}.json`, committed. `tiers/.debug/` is gitignored and no file under `src/` reads it (a test checks this). It holds per-player and per-team intermediates for the comparison with the Python build, `report.md` (every table below) and `stats-penalties.csv`. |

The level comes from `ncaaDivision` in `src/site.config.ts`. For anything but `d2` the build writes
nothing (section 0).

## Site functions the build uses

- **One record per physical match (section 1).** The match page's resolution:
  `canonicalFixture(fixture, knownProgrammes(seasons))` from `src/lib/postseason.ts`, then
  `foldToMatches` over `allSightings` from `src/lib/division.ts`, grouped by `matchIdentity` from
  `src/lib/derive.ts`. The match page reaches the same fold through `divisionMatchOf`
  (`src/lib/kickoff-division.ts`). The fold runs once per identity group (`foldEach`), so one
  refused group cannot stop a season. **[Reconciliation]** The fold now only says which sightings
  are one match. Which copy gives the venue, the score, the shots and each side's lines is decided
  per side by rulings R-A to R-D in `resolveSides` (`scripts/tiers/sides.ts`), and a box score's
  rows are oriented by team names before `home_index`.
- Exhibitions and forfeits are recognised with `isExhibition` (`derive.ts`) and `isForfeit`
  (`model.ts`); under R-C a match is dropped when any final copy marks it. `NameBook`
  (`names.ts`) builds the site's `Season`. `isGoalPlay` (`plays.ts`) counts goals for the 11.2
  penalty share.
- **Position groups (section 3, ruling R-F)** are the site's own `positionLine` (`src/lib/format.ts`),
  called, not copied: GK is GK, DEF is D, MID is M, FWD is F, null is no group. It replaces the
  contract's normaliser and tables for the roster label and the box-score labels.
- The files are read with the site's loaders `loadFixtures`, `loadRosters`, `loadStats` and
  `loadMatches` from `src/lib/data.ts`, which this branch does not modify.
- **One match a day** sits on top of that fold (`oneMatchADay` in `scripts/tiers/matches.ts`). The
  copies of a cluster are rewritten to one slug and folded again with `foldToMatches`, so the kept
  copy is still the site's choice.
- **The name fold (4.1)** is the collector's `fold_name`, ported into `src/lib/tiers.ts` as
  `foldName` (with `foldLetters`, `givenFirst`, `foldSurname` and `shirtNumber`). It is used for
  every `key` and inside `tierFor`. The site's own `foldName` in `src/lib/player.ts` is not used.
- **Not used any more:** the site's `goalScorer`, `playerIndex`, `playerIdOf` and `tenureOf`. The
  contract now spells out the kicker rule, the bio id and the class ladder, and the build follows
  its wording.

## Section 11.2: sanity against the reference build

| Quantity | Expected men | Measured men | Expected women | Measured women |
| --- | --- | --- | --- | --- |
| Programme-seasons with a workload group, all five seasons | 990 | 990 | 1,249 | 1,249 |
| Regular defenders a season | about 444 | 445.6 | about 611 | 612.0 |
| Regular goalkeepers a season | about 181 | 181.0 | about 231 | 231.0 |
| Defenders and goalkeepers with two or more seasons counted, a season, 2023 to 2026 | about 207 | 208.5 | about 349 | 348.8 |
| Of those, holding the tier (2023 to 2026) | about 42 | 42.5 | about 71 | 70.5 |
| Penalty goals as a share of all goals in the play-by-play | 8.2% | 8.1% (2,280 of 28,213) | 5.6% | 5.6% (1,907 of 33,854) |

Every row agrees with the re-based table to within 1%. Goalkeepers match exactly, and defenders,
two-season players and tier holders sit within a player or two a season. Two checks came first,
because the other build named them as decisive:

- **The share denominator is the one 8 defines.** `m` counts the records in which the
  programme's box score prints minutes for at least one of its own players (`withMinutes` in
  `scripts/tiers/compute.ts`). Dividing by all records (n) instead gives figures far under the
  table.
- **One match a day runs before anything is summed.** `physicalMatches` merges each cluster before
  it returns a single record. The model rows, team totals, sheets and minutes are all built from
  that list.

**The gap the first 2.2 build left (436.2 / 607.4 defenders, 177.8 / 228.8 goalkeepers) was the
box-score copy.** That build read both sides' lines from the kept copy. In 306 men's and 284
women's side-records the kept copy prints no minutes for a side while that side's own site's copy
does. Ruling R-A reads each side from its own site's copy when it prints minutes for that side, and
the rows above are the result.

The penalty share is 8.08% for men (2,280 of 28,213), against 8.2%. That difference is not
explained. Every play of type `penalty` that is an attempt and says PENALTY KICK GOAL or FOR A GOAL
is counted, over the kept copies of the records the rest of the build uses. The Python build counts
the same 2,280.

## Acceptance 11.4: players incomplete for identity

| File | Without the roster pass: identity / of them 600+ minutes | With it (the artifact): identity / of them 600+ minutes | Lines the roster lookup tied to an entry | Lookups refused (line already tied elsewhere) | Merges blocked (different page ids or roster entries) |
| --- | --- | --- | --- | --- | --- |
| 2022-men | 121 / 32 | 11 / 3 | 35800 | 0 | 0 |
| 2023-men | 135 / 37 | 8 / 1 | 39200 | 0 | 0 |
| 2024-men | 122 / 40 | 3 / 1 | 40238 | 0 | 0 |
| 2025-men | 114 / 40 | 6 / 1 | 41637 | 0 | 0 |
| 2026-men | 9 / 1 | 1 / 0 | 3976 | 0 | 1 |
| 2022-women | 22 / 5 | 11 / 3 | 4041 | 0 | 0 |
| 2023-women | 15 / 3 | 9 / 2 | 4111 | 0 | 0 |
| 2024-women | 14 / 1 | 4 / 0 | 3532 | 0 | 0 |
| 2025-women | 10 / 1 | 4 / 1 | 3779 | 0 | 0 |
| 2026-women | 10 / 2 | 0 / 0 | 3522 | 0 | 0 |

"Without the roster pass" is this build with pass 3 of 4.2 switched off. The bio-id ties of 4.2
(page, twin and roster refs, and page ids) still hold in that run. Version 1 lost 141 / 126 / 116 /
120 men and 41 / 31 / 25 / 14 women. The roster pass recovers most of those:

- **Men:** 11 / 8 / 3 / 6 remain in 2022 to 2025, and 3 / 1 / 1 / 1 of them have 600 or more
  minutes.
- **Women:** 11 / 9 / 4 / 4 / 0 remain.
- Against the first 2.2 build (23 / 23 / 18 / 17 men), the drop comes from R-A, which reads each
  side's lines from one site so a player's name is spelled one way, and from the pass-3 fix, which
  joins every group tied to one roster entry.
- The one merge blocked, 2026 men, is two groups holding different page ids that one roster lookup
  reached; the pass refuses it, as 4.2 says.

The lookup column counts lines, not players: every line with no ref or a `key` ref is looked up.

## Counts per file

| File | Entries | shooting_scoring: tier / eligible / needs_minutes / incomplete | team_defence: tier / eligible / needs_second_season / needs_minutes / incomplete | no group (incomplete) | Incomplete by reason | Teams light / typical / heavy / none |
| --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 5498 | 167 / 665 / 2279 / 7 | 0 / 0 / 626 / 1485 / 13 | 256 | few_matches 9, identity 11, no_position 256 | 66 / 66 / 66 / 1 |
| 2023-men | 5470 | 201 / 798 / 2205 / 7 | 49 / 191 / 378 / 1412 / 16 | 213 | few_matches 15, identity 8, no_position 213 | 65 / 65 / 66 / 1 |
| 2024-men | 5543 | 203 / 806 / 2210 / 1 | 44 / 174 / 435 / 1470 / 11 | 189 | few_matches 9, identity 3, no_position 189 | 67 / 66 / 67 / 1 |
| 2025-men | 5653 | 197 / 783 / 2331 / 2 | 39 / 154 / 422 / 1540 / 4 | 181 | identity 6, no_position 181 | 66 / 66 / 66 / 0 |
| 2026-men | 5840 | 191 / 761 / 2415 / 1 | 38 / 145 / 438 / 1689 / 0 | 162 | identity 1, no_position 162 | 66 / 66 / 66 / 0 |
| 2022-women | 6586 | 233 / 932 / 2656 / 5 | 0 / 0 / 843 / 1664 / 20 | 233 | few_matches 14, identity 11, no_position 233 | 83 / 83 / 83 / 1 |
| 2023-women | 6671 | 273 / 1086 / 2466 / 25 | 78 / 302 / 451 / 1743 / 40 | 207 | few_matches 20, identity 9, no_minutes 36, no_position 207 | 82 / 82 / 83 / 2 |
| 2024-women | 6777 | 277 / 1104 / 2596 / 2 | 75 / 298 / 487 / 1776 / 2 | 160 | identity 4, no_position 160 | 84 / 84 / 84 / 0 |
| 2025-women | 6827 | 276 / 1098 / 2627 / 2 | 65 / 260 / 538 / 1795 / 18 | 148 | few_matches 16, identity 4, no_position 148 | 84 / 83 / 84 / 2 |
| 2026-women | 6849 | 275 / 1094 / 2677 / 26 | 64 / 253 / 501 / 1823 / 23 | 113 | few_matches 11, no_minutes 38, no_position 113 | 83 / 83 / 84 / 2 |

## Tier holders per file

| File | Tier 1 F | Tier 1 M | Tier 2 F | Tier 2 M | Team defence: defenders | Team defence: goalkeepers |
| --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 13 | 29 | 39 | 86 | 0 | 0 |
| 2023-men | 17 | 34 | 51 | 99 | 33 | 16 |
| 2024-men | 18 | 33 | 54 | 98 | 33 | 11 |
| 2025-men | 19 | 31 | 54 | 93 | 25 | 14 |
| 2026-men | 16 | 32 | 47 | 96 | 25 | 13 |
| 2022-women | 23 | 36 | 66 | 108 | 0 | 0 |
| 2023-women | 28 | 41 | 81 | 123 | 57 | 21 |
| 2024-women | 28 | 42 | 84 | 123 | 55 | 20 |
| 2025-women | 27 | 43 | 79 | 127 | 42 | 23 |
| 2026-women | 27 | 43 | 79 | 126 | 43 | 21 |

No 2022 player can hold the team-defence tier: 2021 is out of scope (sections 0 and 8).

## One record per match, and what the build set aside

| Season | Sightings | Physical (site fold) | Exhibitions | Forfeits | Not final | No box score in any copy | Records | Disputed (kept, canonical score) | Box score from another copy | Box score with no home_index | Refused by the fold (unplayed) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 2413 | 1989 | 7 | 0 | 131 | 23 | 1821 | 0 | 8 | 0 | 0 |
| 2023-men | 2449 | 2014 | 6 | 0 | 161 | 22 | 1814 | 0 | 3 | 0 | 0 |
| 2024-men | 2513 | 2057 | 2 | 1 | 172 | 27 | 1847 | 0 | 11 | 0 | 0 |
| 2025-men | 2481 | 2003 | 4 | 0 | 144 | 14 | 1830 | 0 | 7 | 0 | 0 |
| 2026-men | 2489 | 2014 | 5 | 0 | 172 | 10 | 1824 | 1 | 5 | 0 | 0 |
| 2022-women | 3080 | 2593 | 11 | 0 | 191 | 23 | 2345 | 0 | 4 | 0 | 0 |
| 2023-women | 3090 | 2591 | 15 | 2 | 177 | 30 | 2347 | 0 | 3 | 0 | 0 |
| 2024-women | 3156 | 2608 | 6 | 0 | 204 | 11 | 2374 | 0 | 4 | 0 | 2024-09-12 flagler v florida-tech |
| 2025-women | 3166 | 2605 | 6 | 0 | 184 | 10 | 2387 | 0 | 3 | 0 | 0 |
| 2026-women | 3132 | 2596 | 10 | 4 | 214 | 10 | 2357 | 0 | 4 | 0 | 0 |

- **"Physical"** counts the site fold's groups.
- **Not records:** matches with no final copy, then finals that any final copy marks as an
  exhibition or a forfeit (R-C), then finals with no box score in any copy ([v2]). A match is
  counted under the first that applies, so an exhibition that never went final is counted as not
  final. The first 2.2 build tested exhibitions first; the totals are the same.
- **Box score with no home_index** is now 0: rows are oriented by team names first (the two
  sides' slugs, names and abbreviations), `home_index` only when the names do not decide. A box
  score neither orients is not read.
- **Refused:** 2024-09-12 Flagler v Florida Tech (women). The fold refuses its copies, and neither
  copy is final. A refusal that involved a final would stop the build.
- **Disputed:** one record, 2026 men. Its copies print different finals, and it keeps the
  canonical score, as the site does.

## One match a day (section 1, version 2.2)

| Season | Matches merged | Records they were | Records removed | Other side's slug from the kept copy (no single own copy) | Collected programme-seasons that had a match counted twice | Collected programme-seasons credited with a match they never played (a borrowed slug) | Clusters the rule could not rewrite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 7 | 14 | 7 | 0 | 7 | 0 | 0 |
| 2023-men | 11 | 22 | 11 | 0 | 9 | 0 | 0 |
| 2024-men | 8 | 16 | 8 | 0 | 7 | 1 (dominican) | 0 |
| 2025-men | 11 | 22 | 11 | 0 | 10 | 1 (dominican) | 0 |
| 2026-men | 3 | 6 | 3 | 0 | 3 | 0 | 0 |
| 2022-women | 23 | 46 | 23 | 0 | 16 | 0 | 0 |
| 2023-women | 20 | 40 | 20 | 0 | 15 | 1 (maryville) | 0 |
| 2024-women | 13 | 26 | 13 | 0 | 11 | 1 (maryville) | 0 |
| 2025-women | 18 | 36 | 18 | 0 | 15 | 1 (maryville) | 0 |
| 2026-women | 1 | 2 | 1 | 0 | 1 | 0 | 0 |
| all | 115 | 230 | 115 | 0 | 94 | 5 | 0 |

Two records are copies when they share the gender, the date and a programme slug, and give the same
score for both sides. Copies cluster, and each cluster becomes one record.

- **The other side's slug** came from that side's own copy in every one of the 115 merges. No
  cluster needed the fallback to the kept copy's slug.
- **No chains:** no cluster lacked a slug shared by all its records.
- **What the merges fixed.** 94 collected programme-seasons had a match counted twice. Five more
  had been credited with a match they never played, because another site borrowed their slug for
  someone else: `dominican` (men, 2024 and 2025) and `maryville` (women, 2023 to 2025).
- **Queens.** One programme-day still holds two records: `queens` on 2022-08-28 (women), West
  Florida 0-0 Queens and Queens 1-2 Dominican. The scores differ, so the records are not copies.
  The slug names two programmes.

<details><summary>Every merge</summary>

| File | Date | Shared programme | Other side | From | Slugs rewritten | Records |
| --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 2022-11-13 | tiffin | illinois-springfield | its own copy | ill-springfield | 2 |
| 2022-men | 2022-11-12 | adelphi | charleston | its own copy | of-charleston | 2 |
| 2022-men | 2022-11-17 | franklin-pierce | davis-elkins | its own copy | davis-and-elkins | 2 |
| 2022-men | 2022-08-27 | cal-state-dominguez-hills | concordia-irvine | its own copy | concordia | 2 |
| 2022-men | 2022-09-03 | cal-state-la | concordia-irvine | its own copy | concordia | 2 |
| 2022-men | 2022-09-10 | cal-poly-pomona | concordia-irvine | its own copy | concordia | 2 |
| 2022-men | 2022-09-15 | western-washington | concordia-irvine | its own copy | concordia | 2 |
| 2023-men | 2023-08-31 | regis | cal-state-la | its own copy | california-state-los-angeles | 2 |
| 2023-men | 2023-09-01 | south-dakota-mines | montana-state-billings | its own copy | msu-billings | 2 |
| 2023-men | 2023-09-06 | south-dakota-mines | montana-state-billings | its own copy | msu-billings | 2 |
| 2023-men | 2023-09-08 | regis | cal-state-san-bernardino | its own copy | california-state-san-bernardino | 2 |
| 2023-men | 2023-09-16 | fort-lewis | montana-state-billings | its own copy | msu-billings | 2 |
| 2023-men | 2023-09-17 | westminster | cal-state-monterey-bay | its own copy | california-state-monterey-bay | 2 |
| 2023-men | 2023-11-01 | bridgeport | dominican | its own copy | dominican-senior-night | 2 |
| 2023-men | 2023-10-21 | mars-hill | usc-aiken | its own copy | s-c-aiken | 2 |
| 2023-men | 2023-10-09 | belmont-abbey | erskine | its own copy | erksine | 2 |
| 2023-men | 2023-09-14 | cal-state-san-bernardino | concordia-irvine | its own copy | concordia | 2 |
| 2023-men | 2023-09-07 | western-washington | concordia-irvine | its own copy | concordia | 2 |
| 2024-men | 2024-09-12 | msu-denver | dominican-of-california | its own copy | dominican | 2 |
| 2024-men | 2024-09-12 | westminster | cal-state-monterey-bay | its own copy | california-state-monterey-bay | 2 |
| 2024-men | 2024-09-19 | colorado-mesa | montana-state-billings | its own copy | msu-billings | 2 |
| 2024-men | 2024-09-20 | colorado-school-of-mines | cal-state-la | its own copy | cal-state-los-angeles | 2 |
| 2024-men | 2024-09-22 | msu-denver | cal-state-la | its own copy | cal-state-los-angeles | 2 |
| 2024-men | 2024-09-14 | adelphi | e-stroudsburg | its own copy | east-stroudsburg | 2 |
| 2024-men | 2024-09-14 | southern-connecticut | west-chester | its own copy | west-chester-of-pennsylvania | 2 |
| 2024-men | 2024-11-02 | bridgeport | wilmington | its own copy | wilmington-senior-day | 2 |
| 2025-men | 2025-09-13 | northeastern-state | midwestern-state | its own copy | msu-texas | 2 |
| 2025-men | 2025-09-13 | csu-pueblo | dominican-of-california | its own copy | dominican | 2 |
| 2025-men | 2025-09-19 | colorado-school-of-mines | cal-state-la | its own copy | cal-state-los-angeles | 2 |
| 2025-men | 2025-09-21 | msu-denver | cal-state-la | its own copy | california-state-los-angeles | 2 |
| 2025-men | 2025-09-13 | southern-connecticut | west-chester | its own copy | west-chester-of-pennsylvania | 2 |
| 2025-men | 2025-09-14 | adelphi | e-stroudsburg | its own copy | east-stroudsburg | 2 |
| 2025-men | 2025-11-23 | adelphi | charleston | its own copy | of-charleston | 2 |
| 2025-men | 2025-11-30 | southern-new-hampshire | charleston | its own copy | of-charleston | 2 |
| 2025-men | 2025-11-12 | bridgeport | wilmington | its own copy | wilmington-ub-wins-pks | 2 |
| 2025-men | 2025-11-21 | roberts-wesleyan | wilmington | its own copy | wilimington | 2 |
| 2025-men | 2025-11-05 | ferrum | barton | its own copy | ferrum-5-barton | 2 |
| 2026-men | 2026-09-12 | st-cloud-state | illinois-springfield | its own copy | ui-springfield | 2 |
| 2026-men | 2026-09-05 | colorado-school-of-mines | concordia-irvine | its own copy | concordia | 2 |
| 2026-men | 2026-08-27 | cal-state-la | concordia-irvine | its own copy | concordia | 2 |
| 2022-women | 2022-09-24 | harding | oklahoma-baptist | its own copy | oklahoma-bapt | 2 |
| 2022-women | 2022-10-13 | harding | oklahoma-baptist | its own copy | oklahoma-bapt | 2 |
| 2022-women | 2022-09-04 | felician | texas-a-m-international | its own copy | texas-a-and-m-intl | 2 |
| 2022-women | 2022-09-10 | csu-pueblo | west-texas-a-m | its own copy | west-texas | 2 |
| 2022-women | 2022-09-07 | georgia-college | west-georgia | its own copy | west-ga | 2 |
| 2022-women | 2022-08-27 | tiffin | illinois-springfield | its own copy | ill-springfield | 2 |
| 2022-women | 2022-09-03 | findlay | illinois-springfield | its own copy | ill-springfield | 2 |
| 2022-women | 2022-09-12 | hawaii-hilo | regis | its own copy | regis-rangers | 2 |
| 2022-women | 2022-09-18 | csu-pueblo | western-colorado | its own copy | western | 2 |
| 2022-women | 2022-10-08 | d-youville | iup | its own copy | indiana | 2 |
| 2022-women | 2022-08-31 | iup | california-pa | its own copy | cal | 2 |
| 2022-women | 2022-10-05 | iup | california-pa | its own copy | cal | 2 |
| 2022-women | 2022-09-14 | georgia-college | usc-beaufort | its own copy | s-c-beaufort | 2 |
| 2022-women | 2022-08-25 | cal-poly-pomona | concordia-irvine | its own copy | concordia | 2 |
| 2022-women | 2022-09-08 | cal-state-la | concordia-irvine | its own copy | concordia | 2 |
| 2022-women | 2022-09-10 | cal-state-dominguez-hills | concordia-irvine | its own copy | concordia | 2 |
| 2022-women | 2022-09-14 | san-francisco-state | concordia-irvine | its own copy | concordia | 2 |
| 2022-women | 2022-11-10 | cal-state-la | concordia-irvine | its own copy | concordia | 2 |
| 2022-women | 2022-08-30 | western-washington | concordia-irvine | its own copy | concordia | 2 |
| 2022-women | 2022-09-01 | simon-fraser | concordia-irvine | its own copy | concordia | 2 |
| 2022-women | 2022-11-17 | western-washington | concordia-irvine | its own copy | concordia | 2 |
| 2022-women | 2022-10-02 | northern-state | umary | its own copy | umary-pink-game | 2 |
| 2022-women | 2022-10-09 | northern-state | southwest-minnesota-state | its own copy | southwest-minnesota-state-gypsy-days | 2 |
| 2023-women | 2023-09-14 | new-mexico-highlands | northwestern-oklahoma-state | its own copy | nothwestern-oklahoma-state | 2 |
| 2023-women | 2023-09-16 | csu-pueblo | northwestern-oklahoma-state | its own copy | nw-oklahoma-state | 2 |
| 2023-women | 2023-08-31 | csu-pueblo | west-texas-a-m | its own copy | west-texas | 2 |
| 2023-women | 2023-09-08 | felician | texas-a-m-international | its own copy | texas-a-and-m-intl | 2 |
| 2023-women | 2023-09-02 | findlay | illinois-springfield | its own copy | ill-springfield | 2 |
| 2023-women | 2023-09-03 | hawaii-hilo | uccs | its own copy | uccs-mountain-lions | 2 |
| 2023-women | 2023-10-06 | csu-pueblo | western-colorado | its own copy | western | 2 |
| 2023-women | 2023-10-08 | new-mexico-highlands | regis | its own copy | regis-univerisity | 2 |
| 2023-women | 2023-10-15 | csu-pueblo | black-hills-state | its own copy | black-hills | 2 |
| 2023-women | 2023-09-08 | southern-connecticut | post | its own copy | post-univeristy | 2 |
| 2023-women | 2023-09-09 | saint-michael-s | iup | its own copy | indiana | 2 |
| 2023-women | 2023-10-21 | southern-connecticut | american-international | its own copy | american-internantional | 2 |
| 2023-women | 2023-10-07 | d-youville | iup | its own copy | indiana | 2 |
| 2023-women | 2023-09-08 | grand-valley-state | umary | its own copy | maryville | 2 |
| 2023-women | 2023-10-28 | lees-mcrae | emmanuel | its own copy | emmanuel-ga | 2 |
| 2023-women | 2023-08-31 | cal-state-la | concordia-irvine | its own copy | concordia | 2 |
| 2023-women | 2023-08-31 | fresno-pacific | cal-state-san-bernardino | its own copy | san-bernardino | 2 |
| 2023-women | 2023-09-15 | san-francisco-state | concordia-irvine | its own copy | concordia | 2 |
| 2023-women | 2023-09-04 | western-washington | concordia-irvine | its own copy | concordia | 2 |
| 2023-women | 2023-09-10 | central-missouri | umary | its own copy | maryville | 2 |
| 2024-women | 2024-10-12 | harding | oklahoma-baptist | its own copy | okla-baptist | 2 |
| 2024-women | 2024-10-26 | harding | oklahoma-baptist | its own copy | okla-baptist | 2 |
| 2024-women | 2024-11-15 | harding | oklahoma-baptist | its own copy | okla-baptist | 2 |
| 2024-women | 2024-10-29 | texas-womans | sul-ross-state | its own copy | sul-ross | 2 |
| 2024-women | 2024-09-18 | cal-state-dominguez-hills | uccs | its own copy | colorado | 2 |
| 2024-women | 2024-09-08 | bridgeport | southern-connecticut | its own copy | southern-conn-st-queens | 2 |
| 2024-women | 2024-09-07 | frostburg-state | iup | its own copy | indiana | 2 |
| 2024-women | 2024-10-12 | tiffin | iup | its own copy | indiana | 2 |
| 2024-women | 2024-11-22 | iup | west-virginia-state | its own copy | wv-state | 2 |
| 2024-women | 2024-09-07 | northern-michigan | st-cloud-state | its own copy | saint-cloud | 2 |
| 2024-women | 2024-09-19 | san-francisco-state | concordia-irvine | its own copy | concordia | 2 |
| 2024-women | 2024-09-15 | emporia-state | umary | its own copy | maryville | 2 |
| 2024-women | 2024-09-15 | nebraska-kearney | msu-moorhead | its own copy | minnesota-st-moorhead | 2 |
| 2025-women | 2025-09-18 | southwestern-oklahoma-state | pittsburg-state | its own copy | pitt-state | 2 |
| 2025-women | 2025-10-22 | harding | oklahoma-baptist | its own copy | okla-baptist | 2 |
| 2025-women | 2025-09-20 | texas-womans | sul-ross-state | its own copy | sul-ross | 2 |
| 2025-women | 2025-09-14 | hawaii-hilo | westminster | its own copy | westminster-griffins | 2 |
| 2025-women | 2025-11-02 | csu-pueblo | new-mexico-highlands | its own copy | nm-highlands | 2 |
| 2025-women | 2025-09-06 | findlay | iup | its own copy | indiana-pennsylvania | 2 |
| 2025-women | 2025-09-26 | northern-michigan | grand-valley-state | its own copy | grand-valley | 2 |
| 2025-women | 2025-10-24 | northern-michigan | grand-valley-state | its own copy | grand-valley | 2 |
| 2025-women | 2025-11-14 | northern-michigan | grand-valley-state | its own copy | grand-valley | 2 |
| 2025-women | 2025-09-07 | coker | usc-beaufort | its own copy | s-c-beaufort | 2 |
| 2025-women | 2025-10-28 | mars-hill | usc-beaufort | its own copy | s-c-beaufort | 2 |
| 2025-women | 2025-11-05 | ferrum | chowan | its own copy | ferrum-6-chowan | 2 |
| 2025-women | 2025-09-22 | san-francisco-state | concordia-irvine | its own copy | concordia | 2 |
| 2025-women | 2025-10-23 | hawaii-pacific | westmont | its own copy | westmost | 2 |
| 2025-women | 2025-10-04 | simon-fraser | montana-state-billings | its own copy | montana-saint-billings | 2 |
| 2025-women | 2025-10-30 | simon-fraser | montana-state-billings | its own copy | montana-saint-billings | 2 |
| 2025-women | 2025-09-12 | emporia-state | umary | its own copy | u-mary | 2 |
| 2025-women | 2025-09-14 | washburn | umary | its own copy | maryville | 2 |
| 2026-women | 2026-09-12 | simon-fraser | concordia-irvine | its own copy | concordia | 2 |

</details>

## Model

- men: goals mu 1.6442, home 1.0985, 1291 teams; shots mu 12.4238, home 1.0726, 1291 teams
- women: goals mu 1.5094, home 1.1082, 1537 teams; shots mu 12.5797, home 1.0787, 1537 teams

## Measures behind the remaining ambiguities

| Season | Workload boundaries | Penalty attempts / unattributed / not attempts | Lines without minutes | Records with a doubled line | Box-group ties | Roster label with no group | No roster entry | Split pairs | Contradicted links | Ambiguous links | No-minutes programmes | Teams with n = 0 | Programme-days with two records |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 10.508 / 13.227 | 647 / 4 / 9 | 4943 | 10 | 0 | 127 | 474 | 7 | 0 | 0 | 0 | 0 | 0 |
| 2023-men | 11.056 / 13.263 | 615 / 4 / 1 | 4898 | 3 | 2 | 88 | 352 | 4 | 2 | 0 | 0 | 0 | 0 |
| 2024-men | 10.860 / 12.715 | 570 / 5 / 1 | 4857 | 1 | 0 | 78 | 276 | 3 | 5 | 0 | 0 | 0 | 0 |
| 2025-men | 10.926 / 13.129 | 561 / 4 / 2 | 4665 | 4 | 0 | 44 | 277 | 5 | 1 | 0 | 0 | 0 | 0 |
| 2026-men | 11.137 / 13.489 | 641 / 7 / 3 | 5335 | 14 | 0 | 35 | 237 | 1 | 11 | 0 | 0 | 0 | 0 |
| 2022-women | 10.253 / 13.024 | 545 / 7 / 4 | 6363 | 2 | 2 | 57 | 460 | 7 | 0 | 0 | 0 | 0 | queens 2022-08-28 |
| 2023-women | 10.250 / 13.381 | 575 / 2 / 3 | 6398 | 1 | 1 | 90 | 347 | 5 | 3 | 0 | bloomsburg | 0 | 0 |
| 2024-women | 10.229 / 13.699 | 509 / 4 / 0 | 5741 | 1 | 1 | 60 | 271 | 2 | 4 | 0 | 0 | 0 | 0 |
| 2025-women | 10.268 / 13.681 | 519 / 3 / 0 | 5473 | 0 | 0 | 20 | 280 | 2 | 3 | 0 | 0 | 0 | 0 |
| 2026-women | 10.278 / 14.059 | 500 / 0 / 2 | 5342 | 6 | 3 | 26 | 172 | 0 | 0 | 0 | bloomsburg | 0 | 0 |

| Season | no_position / with no label at all | Player-seasons the stats file's penalties changed | … of them, every excess penalty is one the play-by-play credits on a record 4.6 skipped (no minutes) |
| --- | --- | --- | --- |
| 2022-men | 256 / 254 | 21 | 0 |
| 2023-men | 213 / 213 | 15 | 0 |
| 2024-men | 189 / 189 | 20 | 0 |
| 2025-men | 181 / 180 | 6 | 0 |
| 2026-men | 162 / 161 | 11 | 0 |
| 2022-women | 233 / 232 | 6 | 0 |
| 2023-women | 207 / 207 | 2 | 0 |
| 2024-women | 160 / 158 | 3 | 0 |
| 2025-women | 148 / 146 | 4 | 0 |
| 2026-women | 113 / 108 | 2 | 0 |

Labels carried by no_position players, all files: `"CMF"` 2, `"Health Science"` 2; and 10 labels printed once, not listed (some are a club or a school).

Roster class years the 4.4 ladder cannot place (they name no year, and never contradict a link), all files: `"Redshirt"` 13.

- "Contradicted links" counts same-key links that 4.4's home town or class year breaks.
- "Box-group ties" counts players with no roster group whose box labels tie. The tie goes to the
  group that appears first in date order.
- The no-minutes programmes are women's programme-seasons whose box scores print minutes for
  none of their players. Every player there is `incomplete`, `no_minutes`.

1,862 of 61,714 entries are `no_position`. Almost all of them carry no label of any kind:
no roster line, or a roster line with no position, and no box-score label. Under R-F 46 entries
left `no_position` (below). Under R-A the class 4.6 counts in the last column above is empty by
construction: a penalty on a record with no minutes now counts as found.

## Changes from the first 2.2 build, file by file

The first 2.2 build is `1e1b100111`. Entries are matched as below for v1 (page id, then fold and
number, then fold).

| File | 2.2 entries | Now | Matched | Changed kind, status or tier | 2.2 entries with no match | New entries with no match |
| --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 5539 | 5498 | 5483 | 57 | 56 | 15 |
| 2022-women | 6608 | 6586 | 6578 | 104 | 30 | 8 |
| 2023-men | 5536 | 5470 | 5459 | 74 | 77 | 11 |
| 2023-women | 6697 | 6671 | 6660 | 46 | 37 | 11 |
| 2024-men | 5585 | 5543 | 5529 | 98 | 56 | 14 |
| 2024-women | 6807 | 6777 | 6770 | 89 | 37 | 7 |
| 2025-men | 5690 | 5653 | 5628 | 90 | 62 | 25 |
| 2025-women | 6848 | 6827 | 6816 | 87 | 32 | 11 |
| 2026-men | 5898 | 5840 | 5827 | 87 | 71 | 13 |
| 2026-women | 6881 | 6849 | 6838 | 48 | 43 | 11 |
| all | 62089 | 61714 | 61588 | 780 | 501 | 126 |

| Entries | 2.2 → now |
| --- | --- |
| 172 | shooting_scoring:needs_minutes -> shooting_scoring:eligible |
| 93 | team_defence:needs_minutes -> team_defence:needs_second_season |
| 70 | shooting_scoring:incomplete(no_minutes) -> shooting_scoring:needs_minutes |
| 41 | team_defence:incomplete(no_minutes) -> team_defence:needs_minutes |
| 40 | none:incomplete(no_position) -> shooting_scoring:needs_minutes |
| 40 | shooting_scoring:tier/T2 -> shooting_scoring:eligible |
| 35 | shooting_scoring:eligible -> shooting_scoring:tier/T2 |
| 30 | shooting_scoring:tier/T1 -> shooting_scoring:tier/T2 |
| 26 | shooting_scoring:needs_minutes -> shooting_scoring:tier/T2 |
| 25 | shooting_scoring:needs_minutes -> none:incomplete(no_position) |
| 22 | shooting_scoring:needs_minutes -> shooting_scoring:tier/T1 |
| 20 | shooting_scoring:tier/T2 -> shooting_scoring:tier/T1 |

- 680 of the changes come from the reconciliation (`1782ac2aa9`) and 60 from R-F (`448baaec01`),
  counted between consecutive builds by programme, key, number and name. The rest are entries whose
  name or number changed, which only the matching cascade pairs.
- **Minutes.** 111 entries leave `incomplete (no_minutes)`. Their programme's box scores printed no
  minutes in the copy the first build read, and do in the side's own site's copy (R-A).
- **Shooting tiers.** The opponent model, the shot totals and the penalty second source all moved
  (R-B, R-D, R-E), and the cut lines moved with them: 172 shooting players went from
  `needs_minutes` to `eligible`; 40 left tier 2 for `eligible` and 35 came the other way; 30 went
  from tier 1 to tier 2 and 20 from tier 2 to tier 1.
- **The 501 unmatched 2.2 entries** are mostly a second spelling of a player who now has one
  entry, because R-A reads a side's lines from one site.
- Tier holders go from 2,697 (T1 1,016, T2 1,681) to 2,743 after the reconciliation and 2,745
  after R-F (T1 1,032, T2 1,713).

## Changes from version 1, file by file

v1 is the committed `9f9f08c02c`. This table was measured on the first 2.2 build, before the
reconciliation. Entries are matched within a programme:

1. by page id;
2. else by `foldName` of the v1 name and the number with leading zeros dropped;
3. else by `foldName` alone.

Each entry is matched at most once.

| File | v1 entries | v2.2 entries | Matched | Changed status, tier or kind | … status | … tier | … kind | v1 entries with no v2.2 match | v2.2 entries with no v1 match |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 5615 | 5539 | 5531 | 157 (2.8%) | 153 | 13 | 21 | 84 | 8 |
| 2022-women | 6626 | 6608 | 6608 | 128 (1.9%) | 118 | 5 | 48 | 18 | 0 |
| 2023-men | 5600 | 5536 | 5526 | 190 (3.4%) | 183 | 30 | 36 | 74 | 10 |
| 2023-women | 6735 | 6697 | 6697 | 181 (2.7%) | 174 | 24 | 82 | 38 | 0 |
| 2024-men | 5672 | 5585 | 5575 | 197 (3.5%) | 191 | 28 | 47 | 97 | 10 |
| 2024-women | 6845 | 6807 | 6805 | 187 (2.7%) | 186 | 23 | 81 | 40 | 2 |
| 2025-men | 5780 | 5690 | 5680 | 222 (3.9%) | 215 | 29 | 78 | 100 | 10 |
| 2025-women | 6878 | 6848 | 6848 | 146 (2.1%) | 141 | 16 | 65 | 30 | 0 |
| 2026-men | 5904 | 5898 | 5897 | 153 (2.6%) | 149 | 12 | 84 | 7 | 1 |
| 2026-women | 6886 | 6881 | 6880 | 143 (2.1%) | 137 | 18 | 74 | 6 | 1 |
| all | 62541 | 62089 | 62047 | 1704 (2.7%) | 1647 | 198 | 616 | 494 | 42 |

The largest movements:

| Entries | v1 → v2.2 |
| --- | --- |
| 335 | team_defence:needs_minutes -> team_defence:needs_second_season |
| 308 | none:incomplete(no_position) -> shooting_scoring:needs_minutes |
| 205 | none:incomplete(no_position) -> team_defence:needs_minutes |
| 106 | shooting_scoring:incomplete(identity) -> shooting_scoring:needs_minutes |
| 82 | team_defence:incomplete(identity) -> team_defence:needs_minutes |
| 68 | team_defence:needs_minutes -> team_defence:eligible |
| 59 | shooting_scoring:needs_minutes -> shooting_scoring:eligible |
| 58 | team_defence:needs_second_season -> team_defence:eligible |
| 46 | shooting_scoring:incomplete(identity) -> shooting_scoring:eligible |
| 45 | team_defence:incomplete(identity) -> team_defence:needs_second_season |
| 43 | shooting_scoring:eligible -> shooting_scoring:needs_minutes |
| 39 | shooting_scoring:tier2 -> shooting_scoring:eligible |

- **2022 defenders.** Under v1 the share divided minutes by all records. Version 2 divides by the
  records that print minutes. Hundreds of 2022 defenders and keepers become regulars, which in 2022
  can only mean `needs_second_season`.
- **Positions.** Players move out of `no_position` because their roster line is now found. The roster
  pass searches every entry, and a twin reference ties ([v2.2]).
- **Identity.** Players move out of `identity` because the roster pass joins the spellings.
- **The 494 unmatched v1 entries:**
  - 256 were `incomplete` for identity in v1. Each has a v2.2 entry with the same number and
    surname: the other spelling, now joined to it.
  - 109 more also have a v2.2 entry with the same number and surname, under another spelling.
  - 111 were listed under `maryville` (73) and `dominican` (38). They are UMary's and Dominican
    (Calif.)'s players, filed in v1 under the slug that a phantom match borrowed. They now sit
    under their own programme.
  - The other 18 are not explained.

## Remaining ambiguities, and what the build did

Each item says what is open, what was done, and how much it touches, measured where it can be.
Items settled by a reconciliation ruling say so; the Python build follows the same reading.

- **R1. Which copy's box score.** Settled by R-A and R-B. A side's lines, and the penalty plays
  credited to them, come from its own site's copy when that copy prints minutes for the side; else
  from the other copy if it prints minutes; else from the first copy that prints lines. Team shots
  come from the home side's own-site copy that prints both sides' shots as integers, else another
  such copy; the shots model and the section 6 totals take a record only when both sides' shots are
  integers. Goals are the fixture's final score.
- **R2. `m` per side.** "Its box score prints minutes for at least one player" is read as the
  programme's own side. The either-side reading gives identical counts.
- **R3. Bio-id ties.** A group is tied through any page, twin or roster ref id, or any page
  `player_id`, equal to a roster entry's bio id. If one line's ref id and page id tied to two
  different entries, the ref would win. That never happens: 0 lines.
- **R4. Roster entries without a bio id.** Such an entry is identified by its place on the list.
  Two id-less rows of one folded name are therefore two entries, and the name test answers neither;
  the number-and-surname test may. Two rows with one bio id are one entry, as in the collector's
  index. Rows with no name are skipped. No 2022 to 2026 roster repeats a bio id, and 3,914 rows
  have none.
- **R5. Order within a pass.** A line joins the first holder of its key that accepts it. When a
  merge is refused, the earlier tie stands. Merges blocked and lookups refused were 0 in every file,
  so this order never mattered.
- **R6. "An empty fold never contradicts" (4.4)** is read as the whole town's fold. A town whose
  first word folds to nothing but whose whole fold does not is still compared. That happens once in
  67,738 roster rows.
- **R7. Class years.** The string is read word by word from the left; the first year it names is
  its step, and a redshirt word is ignored wherever it stands. The contract says "prefix", but
  "Freshman (Redshirt)" is read as freshman. Two-word forms ("first year", "graduate student") are
  tried before one-word forms. "Redshirt" alone, 13 lines, names no year and never contradicts.
  The Python build now reads the same vocabulary; the two agree on all 30 class-year strings in
  the rosters and on 16 hand-made ones.
- **R8. The kicker's first-letter test.** Settled by ruling S3: the try's letter is its first
  word's after the given-first swap, and a line's letter is its folded given name's first letter.
  A one-word line has no given name and fails the test. No play in the data resolves differently
  under the two readings. Lines that fold alike are one player printed twice: they resolve together
  and are credited once.
- **R9. Not-attempt plays.** `*` is tested at the start of the play text, and AWARDED as printed,
  in capitals. Counted over the 2022 to 2026 files, copies included, 16 penalty plays begin with
  `*`. Another 40 end with one, after "goal number N for season.": those are kicks, and testing
  only the start keeps them. All 18 plays that say "awarded" print it in capitals.
- **R10. Sort tie-breaks.** A null `player_id` goes first, as the contract says for a null number;
  the contract does not say this for `player_id`. No two entries in any file share a key and a
  number, so neither the name nor the `player_id` tie-break is ever reached. The Python build sorts
  the same way.
- **R11. The stats file.** Settled by ruling S4: the row with the player's page id when exactly
  one has it; otherwise, two rows as well as none, the one row with the player's folded name.
  No stats file repeats a page id, so the two readings give the same joins.
- **R12. Box-score labels for the fallback** in section 3 include lines that print no minutes, and
  both lines of a doubled player.
- **R13. Box-score orientation.** A box score's rows are matched to the two sides by team names
  (each side's slug, name and abbreviation, across the season's fixtures files), and by
  `home_index` only when the names do not decide. `home_index` was wrong in 4 copies and missing in
  3. A box score that neither orients is not read; the fixture score still enters the goals
  model.
- **R14. A chain cluster**, whose records share no single slug, would stand unmerged and be listed.
  So would a cluster the site's fold refuses once its copies are rewritten. Neither occurs at this
  freeze.
- **R15. Teams and players.** Both hold every collected programme-season with at least one record.
  A programme with records but no box-score line would get an empty list. None occurs, and no
  collected programme-season has zero records.
- **R16. Position labels.** Settled by ruling R-F: `positionLine` decides a label's group. The
  Python build ports it and proves the port on every distinct label in the 2022 to 2026 rosters and
  box scores (1,039 labels, `reference/position_check.py`).

## Where version 2.2 looks wrong

- **O1. The second penalty source took a penalty off twice.** Fixed by ruling R-E. 4.6 compared
  the stats file with "the penalty goals found above", which left out a penalty credited on a
  record where the player's lines print no minutes. That penalty was never in G, so scaling adjG
  for it took it off twice; 345 of the 449 player-seasons the second source changed were wholly
  this case. The row is now compared with every penalty the play-by-play credits that season. That
  changes 263 players' adjusted shots and threat (133 also their adjusted goals) and 18 players'
  status or tier. 90 player-seasons are still scaled (appendix).
- **O2. Section 1 named no copy for the box score.** Fixed by R-A, R-B and R-D (R1 above). The
  11.2 table now matches.
- **O3. The shortest kicker tries match by surname alone.** Measured, and left as written. Across
  the 2022 to 2026 files, 3 of 5,646 credited penalty plays resolve on the bare surname after the
  two-word try's letter failed: "Martijn Smith" credited to Junior Smith (Lynn 2025, two plays) and
  "Isabella Medina" to Bella Medina (Dallas Baptist 2025). Each is the same player under another
  given name: the stats file agrees with the credit (2 of 2 and 1 of 1) and no other roster entry
  has that surname and letter. "FHSU Z. Laws" was a test case, not a play in the data.
- **O4. Labels positionLine places nobody** (R-F, measured). DB (101 box-score lines, with "- DB"),
  WB (3 roster rows, 9 lines), DM (2 lines) and "CB Solar ECNL Comp" had a group under 2.2's
  tables and have none under `positionLine`. "Forward-Midfielder" goes from F to M: two full words
  joined by a hyphen are read as one phrase, midfield first. Three entries change because of
  them: two Coker 2023 (women) players whose roster says "WB" lose D and fall back to their box
  labels (one F, one M), and Sarah Albert (Oklahoma Christian 2022) goes from F to M. Each is a
  position a reader would place otherwise; the fix belongs in `positionLine`, for the site and the
  tiers together.
- **O5. One copy's labels** (R-A, measured). Section 3's box-score fallback reads the labels on the
  side's lines, and R-A takes those lines from one copy. 54 player-seasons are `no_position` that
  would have a group if the other copy's lines were read (30 by its labels, 24 by a roster tie its
  spelling or page id makes); 14 go the other way.
- **O6. Page ids that are not bio ids.** 22 `no_position` player-seasons have no roster line,
  though exactly one roster row has their folded name and a readable label. The box score's page
  id (Emporia State 2023: 6037) is not the roster's bio id (5444), so 4.2 never ties them.

The objections to version 1 (C1 to C6) were all answered by versions 2 to 2.2: one match a day, the
position normaliser, `m`, the 2022 note, rounding, and `basis.seasons`.

## Reconciliation with the Python build

The independent Python build (`docs/specs/player-tiers/reference/` in ed-insights-platform) and
this one disagreed on 0.9% to 2.7% of players and 11% to 28% of teams per file. Both builds now
apply the same rulings, and they agree on every entry and every team figure in all ten files, with
intermediates equal to within 1.2e-12. The full write-up, with three raw examples per cause, is
`RECONCILIATION.md` beside the Python build.

| Commit | Ruling | What changed here |
| --- | --- | --- |
| `9b978a9acf` | R-B, R-C, R-D; orientation | Venue, score and shots per side from the rulings; R-C on any final copy; box scores oriented by names |
| `0f72a82ada` | R-A | Each side's lines and penalty credits from its own site's copy |
| `5864834bc2` | 4.2 pass 3 | Every group tied to one roster entry joins (the contract's "any group") |
| `99572e355e` | R-E | The stats file compared with every play-by-play penalty |
| `14884dcc87` | S3 | The kicker letter of a line is its given name's |
| `caddf575a5` | S4 | The stats join falls back to the folded name when a page id finds two rows |
| `1782ac2aa9` | | Artifacts rebuilt |
| `f02985ef3c` | R-F | Position groups from the site's `positionLine` |
| `448baaec01` | | Artifacts rebuilt |

## Rebuild

```bash
cd <this worktree>
bun install
bun run tiers:build   # = bun run scripts/tiers/build.ts --out tiers/d2 --frozen-at 2026-11-16
# TOUCHLINE_DATA_DIR overrides the data home (default ~/keelson/d2-soccer)
```

## Appendix: every player the second penalty source changed (4.6)

The counts are as the two sources print them, for each player-season whose stats file shows more
penalty goals or attempts than the play-by-play found, every penalty it credits included (R-E).
Names are as the source prints them. The last column marked the O1 case; under R-E it is "no"
throughout, by construction. The scaling factors are in `tiers/.debug/stats-penalties.csv`, which
is not committed.

| File | Programme | Player | Penalty goals: play-by-play / stats file | Penalty attempts: play-by-play / stats file | The excess sits on records with no minutes |
| --- | --- | --- | --- | --- | --- |
| 2022-men | adams-state | Aidyn Ogle | 0 / 1 | 0 / 1 | no |
| 2022-men | clayton-state | Lewis Green | 0 / 0 | 0 / 1 | no |
| 2022-men | e-stroudsburg | Ignasi Cucurella Tuset | 0 / 1 | 0 / 1 | no |
| 2022-men | emmanuel | Tomas Pollacchi | 1 / 2 | 1 / 2 | no |
| 2022-men | florida-tech | Julen Lafuente | 0 / 1 | 0 / 1 | no |
| 2022-men | fort-hays-state | Blake Arndt | 1 / 3 | 1 / 3 | no |
| 2022-men | georgia-southwestern | Jr., Daniel Gardner | 0 / 1 | 0 / 1 | no |
| 2022-men | goldey-beacom | Patrick Short | 0 / 0 | 0 / 1 | no |
| 2022-men | harding | Matthew Sanchez | 0 / 1 | 0 / 1 | no |
| 2022-men | lubbock-christian | Pablo Galietero Diez | 1 / 2 | 2 / 3 | no |
| 2022-men | newman | Felix Tellez Ramirez | 0 / 1 | 0 / 1 | no |
| 2022-men | newman | Matthew Roberts | 0 / 1 | 0 / 1 | no |
| 2022-men | northeastern-state | Flynn Semmerling | 1 / 3 | 1 / 3 | no |
| 2022-men | northeastern-state | Giani Mascarel | 0 / 1 | 0 / 1 | no |
| 2022-men | northeastern-state | Ryan McCully | 0 / 1 | 0 / 1 | no |
| 2022-men | northwood | Lucas Hart | 1 / 2 | 1 / 2 | no |
| 2022-men | ouachita-baptist | Bobby Boone | 0 / 2 | 0 / 4 | no |
| 2022-men | rogers-state | Josh Milla | 0 / 1 | 0 / 1 | no |
| 2022-men | rogers-state | Luke Morgan | 0 / 1 | 0 / 1 | no |
| 2022-men | rogers-state | Marcos Vasallo | 0 / 0 | 0 / 1 | no |
| 2022-men | spring-hill | Johannes Hanken Tjostheim | 1 / 2 | 1 / 2 | no |
| 2023-men | anderson | Julian Caro | 0 / 2 | 0 / 2 | no |
| 2023-men | dominican | Noa Ahlfors | 0 / 0 | 0 / 1 | no |
| 2023-men | felician | Alvaro Martin Castedo | 0 / 1 | 0 / 2 | no |
| 2023-men | fort-hays-state | Blake Arndt | 0 / 3 | 0 / 3 | no |
| 2023-men | harding | Jonah Pastiroff | 0 / 1 | 0 / 1 | no |
| 2023-men | harding | Stefano Silva | 0 / 1 | 0 / 1 | no |
| 2023-men | newman | Carlos Bellosta Manchon | 0 / 3 | 0 / 3 | no |
| 2023-men | newman | Felix Tellez Ramirez | 0 / 1 | 0 / 1 | no |
| 2023-men | queens | Adolfo Martinez Paquet | 1 / 3 | 1 / 3 | no |
| 2023-men | rogers-state | Luke Morgan | 0 / 1 | 0 / 1 | no |
| 2023-men | saint-marys | Jose Rivera | 0 / 0 | 0 / 1 | no |
| 2023-men | southern-nazarene | Bruno Ferreira | 0 / 1 | 1 / 2 | no |
| 2023-men | southern-nazarene | Cesar Solis | 0 / 1 | 0 / 1 | no |
| 2023-men | southern-nazarene | Rinta Takagi | 0 / 1 | 0 / 1 | no |
| 2023-men | west-florida | Jaime Guillén | 0 / 0 | 0 / 1 | no |
| 2024-men | catawba | Sebastia Cerda-Tous | 0 / 1 | 0 / 1 | no |
| 2024-men | chowan | Junior Smith | 2 / 3 | 2 / 3 | no |
| 2024-men | e-stroudsburg | Ignasi Cucurella Tuset | 0 / 2 | 0 / 3 | no |
| 2024-men | fort-hays-state | Chris Rios-Cruz | 0 / 1 | 0 / 1 | no |
| 2024-men | goldey-beacom | Eduardo Gonzalez | 0 / 0 | 0 / 1 | no |
| 2024-men | harding | Matthew Sanchez | 0 / 1 | 0 / 1 | no |
| 2024-men | millersville | Roy Parkyn | 0 / 1 | 0 / 1 | no |
| 2024-men | newman | Alberto Romano | 1 / 5 | 1 / 5 | no |
| 2024-men | newman | Gustavo Dias Juliani | 0 / 1 | 0 / 1 | no |
| 2024-men | northeastern-state | Ivan Lopez | 0 / 2 | 0 / 2 | no |
| 2024-men | northeastern-state | Luis Felipe Karam | 0 / 1 | 0 / 1 | no |
| 2024-men | ouachita-baptist | Alexis Murillo | 0 / 1 | 0 / 1 | no |
| 2024-men | ouachita-baptist | João Gonçalves | 0 / 1 | 0 / 1 | no |
| 2024-men | rogers-state | Erik Hjertsson | 0 / 2 | 0 / 2 | no |
| 2024-men | rogers-state | Marcos Vasallo | 1 / 4 | 1 / 4 | no |
| 2024-men | rogers-state | Trindon Turner | 0 / 1 | 0 / 1 | no |
| 2024-men | southern-nazarene | Axel Agurcia | 1 / 2 | 1 / 2 | no |
| 2024-men | southern-nazarene | Cesar Solis | 0 / 1 | 0 / 1 | no |
| 2024-men | southern-nazarene | Nemanja Djurisic | 0 / 0 | 0 / 1 | no |
| 2024-men | west-florida | Jaime Guillén | 0 / 0 | 0 / 1 | no |
| 2025-men | cal-state-la | Alex Mendez | 2 / 2 | 2 / 3 | no |
| 2025-men | cedarville | Yonis Velasquez-Quezada | 0 / 2 | 0 / 2 | no |
| 2025-men | hawaii-pacific | Kelly Takara | 2 / 2 | 2 / 3 | no |
| 2025-men | maryville | Jacob Darwesh Lund Iversen | 0 / 1 | 0 / 1 | no |
| 2025-men | saint-leo | Jorge Perez Rosales | 0 / 1 | 0 / 1 | no |
| 2025-men | st-cloud-state | Mahmood Maldonado | 0 / 1 | 0 / 1 | no |
| 2026-men | anderson | Adrian Castillo | 0 / 0 | 0 / 1 | no |
| 2026-men | aum | Benjamin Hoffmann | 0 / 0 | 0 / 1 | no |
| 2026-men | erskine | Peyton Williams | 1 / 2 | 1 / 3 | no |
| 2026-men | felician | Ernest Llaras | 0 / 0 | 0 / 1 | no |
| 2026-men | franklin-pierce | Patrick Brisa | 0 / 0 | 0 / 1 | no |
| 2026-men | goldey-beacom | Sam Ball | 0 / 1 | 0 / 1 | no |
| 2026-men | lee | Matias Milla Munoz | 1 / 2 | 1 / 2 | no |
| 2026-men | north-greenville | Jesse Zborovsky | 0 / 1 | 0 / 1 | no |
| 2026-men | point-loma | Simon Sagal | 1 / 2 | 1 / 2 | no |
| 2026-men | tiffin | Andre Robison | 0 / 1 | 0 / 1 | no |
| 2026-men | wheeling | Jon-Michael Gordon | 0 / 2 | 0 / 2 | no |
| 2022-women | anderson | Carly Keuffer | 0 / 1 | 0 / 1 | no |
| 2022-women | anderson | Claudia WATSON | 0 / 0 | 0 / 1 | no |
| 2022-women | fairmont-state | Alejandra Puerto | 0 / 0 | 0 / 1 | no |
| 2022-women | florida-tech | May Queiroz | 0 / 1 | 0 / 2 | no |
| 2022-women | goldey-beacom | Alyssa Ruggeri | 0 / 0 | 0 / 1 | no |
| 2022-women | molloy | Alessandra Borsellino | 0 / 1 | 0 / 1 | no |
| 2023-women | charleston | Carina Widauer | 0 / 0 | 0 / 1 | no |
| 2023-women | washburn | Aubrey Tanksley | 0 / 0 | 0 / 1 | no |
| 2024-women | bemidji-state | Maria Stocke | 0 / 1 | 0 / 1 | no |
| 2024-women | jessup | Kaylee Gillespie | 0 / 0 | 0 / 1 | no |
| 2024-women | mckendree | Reagan Mauch | 0 / 1 | 0 / 2 | no |
| 2025-women | emory-henry | Anjelika DeJesus | 0 / 1 | 0 / 1 | no |
| 2025-women | emory-henry | Charlotte Stavis | 0 / 1 | 0 / 1 | no |
| 2025-women | iup | Jordina Rovira | 0 / 1 | 0 / 1 | no |
| 2025-women | usc-beaufort | Izzy Amphlett | 0 / 0 | 0 / 1 | no |
| 2026-women | central-washington | Kylee Schreck | 0 / 1 | 0 / 2 | no |
| 2026-women | emory-henry | Siena Booth | 1 / 2 | 1 / 2 | no |

## Phase 2: contract 2.3 (rulings N1, N2, N3 and N5)

This build now also implements the 2.3 rulings in `docs/specs/player-tiers/ALGORITHM-2.3-rulings.md`
(ed-insights-platform). N4 changes wording only, and the build prints none of that wording. The tables earlier in
this log describe the 2.2 build. The 2.3 figures are below.

The full write-up is the "Phase 2" section of `RECONCILIATION.md`. It covers the per-ruling measures, named players,
honours and the invented readings IR-11 to IR-19. The joins and links samples are in `joins-sample.md`, beside it.

| Commit | Ruling | What changed here |
| --- | --- | --- |
| `7194bf5e40` | N1 | `minutes.ts` (new). The minutes of record are box, stats, box_partial or none: r records, m printing minutes, and the stats row's minutes (players list, then keepers list) |
| `cc645aeb11` | N2 | `players.ts`, which adds five things: the N2e untied set for pass 3; team rows dropped; the N2a fifth pass; N2d's printed name; closeness tests (i), (ii), (iii), (iv). N2b widens the split-spelling flag. N2c links by close name, and a home town no longer contradicts. Nicknames come from `loadProgrammes()` |
| `d3b79d4298` | N3 | `position.ts` `rosterGroup`: a roster label naming two or more groups is read by the box scores |
| `d05d18e605` | N5 | `regressions.test.ts`: R-A (4,887 arrangements of copies) and R-E. `--require-clean` and `assertClean` in `build.ts` |
| `d062c65af1` | | Artifacts rebuilt, `--frozen-at 2026-11-16` |

**Agreement with the Python build:** 100% on players and teams in all ten files, and identical in every field. Each
ruling was also compared alone, at its commit, against the Python build with the later rulings switched off; each
was identical. No team figure changes under 2.3.

### Counts per file (2.3)

| File | Entries | shooting_scoring: tier / eligible / needs_minutes / incomplete | team_defence: tier / eligible / needs_second_season / needs_minutes / incomplete | no group (incomplete) | Incomplete by reason |
| --- | --- | --- | --- | --- | --- |
| 2022-men | 5374 | 174 / 690 / 1842 / 389 | 0 / 0 / 632 / 1246 / 219 | 182 | few_matches 2, identity 1, no_minutes 651, no_position 136 |
| 2023-men | 5344 | 206 / 820 / 1798 / 353 | 50 / 200 / 363 / 1205 / 202 | 147 | few_matches 3, identity 7, no_minutes 588, no_position 104 |
| 2024-men | 5445 | 208 / 831 / 1840 / 328 | 44 / 172 / 441 / 1266 / 184 | 131 | few_matches 2, no_minutes 541, no_position 100 |
| 2025-men | 5537 | 205 / 812 / 1941 / 329 | 42 / 165 / 419 / 1333 / 179 | 112 | identity 2, no_minutes 524, no_position 94 |
| 2026-men | 5725 | 201 / 802 / 2024 / 331 | 40 / 151 / 447 / 1435 / 207 | 87 | no_minutes 548, no_position 77 |
| 2022-women | 6507 | 241 / 962 / 2205 / 401 | 0 / 0 / 862 / 1450 / 201 | 185 | few_matches 2, identity 2, no_minutes 640, no_position 143 |
| 2023-women | 6583 | 281 / 1118 / 2078 / 368 | 78 / 311 / 441 / 1565 / 195 | 148 | few_matches 11, identity 4, no_minutes 582, no_position 114 |
| 2024-women | 6703 | 285 / 1134 / 2216 / 350 | 79 / 304 / 485 / 1583 / 162 | 105 | no_minutes 528, no_position 89 |
| 2025-women | 6760 | 286 / 1140 / 2250 / 336 | 67 / 268 / 527 / 1624 / 167 | 95 | few_matches 8, identity 2, no_minutes 513, no_position 75 |
| 2026-women | 6782 | 282 / 1124 / 2336 / 321 | 64 / 256 / 525 / 1644 / 166 | 64 | few_matches 11, no_minutes 483, no_position 57 |

- **Entries:** 61,714 → 60,760. N2a joins 948 split spellings into their roster entry, and 3 team rows are dropped.
- **`no_minutes`:** 5,598 entries, up from 74. Under N1, an entry is `no_minutes` when its programme's box
  scores print minutes in under 90% of its records **and** its conference's stats file gives none for it. Most of
  these were `needs_minutes` under 2.2.
- **`identity`:** 18 entries. N2b flags 32 pairs (64 entries), and all 64 are `incomplete`. 43 of them show
  `no_minutes` and 2 `no_position`, because 4.7 ranks both above `identity`.

### Tier holders per file (2.3)

| File | Tier 1 F | Tier 1 M | Tier 2 F | Tier 2 M | Team defence: defenders | Team defence: goalkeepers | All (2.2 → 2.3) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 14 | 30 | 42 | 88 | 0 | 0 | 167 → 174 |
| 2023-men | 18 | 34 | 52 | 102 | 35 | 15 | 250 → 256 |
| 2024-men | 19 | 34 | 54 | 101 | 32 | 12 | 247 → 252 |
| 2025-men | 19 | 33 | 57 | 96 | 27 | 15 | 236 → 247 |
| 2026-men | 17 | 34 | 51 | 99 | 28 | 12 | 229 → 241 |
| 2022-women | 23 | 38 | 69 | 111 | 0 | 0 | 233 → 241 |
| 2023-women | 28 | 43 | 83 | 127 | 57 | 21 | 351 → 359 |
| 2024-women | 29 | 43 | 86 | 127 | 60 | 19 | 352 → 364 |
| 2025-women | 28 | 44 | 84 | 130 | 43 | 24 | 341 → 353 |
| 2026-women | 27 | 44 | 81 | 130 | 40 | 24 | 339 → 346 |

All files together: 2,745 → **2,833**. Tier 1 goes 1,032 → 1,063, and Tier 2 goes 1,713 → 1,770.

Section 11.2 under 2.3, men / women. Regular defenders 446.2 / 610.8; regular goalkeepers **187.0 / 242.6**;
two-season defenders and goalkeepers 216.0 / 356.8, of whom 44.0 / 72.0 hold the tier. The goalkeeper row now sits
3–5% above the table, outside its 1% band. That is N1: a keeper's season minutes come from the keepers list (IR-11),
which makes more keepers regulars.

### The appendix under 2.3

The appendix lists every player the second penalty source changed under 2.2: 90 player-seasons. Under 2.3 there are
83.

- **Seven leave, because N2a joined a second spelling whose lines carry the penalty the play-by-play credits.** The
  stats file and the play-by-play now agree for each:
  - 2022 Alessandra Borsellino (Molloy), with "Alessand Borsellino";
  - 2023 Noa Ahlfors (Dominican), with "Noa Hjalmar Ahlfors";
  - 2024 Jaime Guillén (West Florida), with "Jaime GuillÃ©n";
  - 2024 Kaylee Gillespie (Jessup);
  - 2025 Jacob Darwesh Lund Iversen (Maryville), with "Jacob Lund-Iversen";
  - 2025 Jorge Perez Rosales (Saint Leo), with "Jorge Perez";
  - 2025 Izzy Amphlett (USC Beaufort).
- **2026 Jon-Michael Gordon (Wheeling):** the play-by-play now finds 1 of his 2.
- **Four are renamed by N2d** to the roster's name as printed:
  - Lewis  Green;
  - Daniel Gardner, Jr.;
  - Pablo  Galietero Diez;
  - Matias Milla  Munoz.

`tiers/.debug/stats-penalties.csv` holds the full 2.3 list.

### Points for the orchestrator

These are measured in `RECONCILIATION.md`.

- **N2c lets wrong rows in.** Of its 89 close-name links:
  - 36 join two people, and 1 is unclear.
  - 33 of the 36 came by home town alone. They are siblings with the same surname, first initial and home town.
  - Smallest change: drop the home-town branch, and count the roster line's shirt number among a player's numbers.
    That keeps 49 links, 3 of them wrong.
- **N1 takes three honoured tier holders to `incomplete`:** Theo Faillon, Meghan Deneen and Elle Smith (2025).
  - Their conferences publish no season minutes, and under 90% of their records print box minutes.
  - A `box_partial` threshold of 0.5 instead of 0.9 returns all three, and 46 tier holders in all.
- **N2d prints roster names as printed:** 2,437 names carry a doubled space. The page collapses it.

### Gates (worktree, after `d062c65af1`)

| Gate | Result |
| --- | --- |
| `bunx tsc --noEmit -p .` | clean |
| `bunx biome check .` | 6 warnings, all in files this branch may not touch: `scripts/journal/national-prompt.ts` (2), `scripts/journal/national.ts`, `scripts/links.ts`, `src/lib/table.test.ts` (2). `scripts/tiers` is clean |
| `bun test` | 1,016 pass, 11 skip, 0 fail |
| `TOUCHLINE_CONTRACTS_DIR=… just verify` | exit 0 |

What `just verify` ran:

- biome, with the same 6 warnings;
- two `astro build` runs, of 2,728 and 3,429 pages;
- the men's gate: 1,037 pass, 5 skip, 0 fail;
- the women's gate: 1,027 pass, 15 skip, 0 fail;
- links: 6,157 pages and 571,797 references, 0 broken.


## Phase 3: contract 2.3 as revised (N2c, N1, N2d; IR-18)

The orchestrator approved IR-11 to IR-19 on 16 November 2026, changed IR-18, revised N2c and N1, and added a
sentence to N2d. This build implements those changes. The figures under "Phase 2" above describe the build before
them; the Phase 3 figures are below.

The full write-up is the "Phase 3" section of `RECONCILIATION.md` (ed-insights-platform,
`docs/specs/player-tiers/reference/`). It covers the per-ruling measures, the named players, the findings and the
new readings IR-20 to IR-25. It ends with **"The rulings in force"**: the final wording of R-A to R-F, IR-1 to
IR-25 and N1 to N5, in one place. Every N2c link and every join IR-18 adds is listed, and was read, in
`joins-sample.md`, beside it.

| Commit | Ruling | What changed here |
| --- | --- | --- |
| `f13a470d2f` | IR-18 | `players.ts`: `rosterNumbers`. A player's numbers include the roster line's, in N2a, N2b, N2c and the 4.4 key collision |
| `c5781da57c` | N2c | `players.ts`: `closeLink` requires a shared number, closeness by (i), (ii) or test (v) (new, `givenFolded` in `penalties.ts`), no same-key link, and the class-year rule. The home-town branch is gone. `compute.ts` makes every key link of a season before any close link |
| `569b585faa` | N1 | `minutes.ts`: the box_partial bar is 0.5, and `couldReachBar` adds the U test. `compute.ts` applies it after the links, season by season; the debug files gain `u_test` |
| `cb32fe0c25` | N2d | `players.ts` `printedName`: white space collapses in the printed name |
| `c58dca4ed1` | | Artifacts rebuilt, `--frozen-at 2026-11-16` |

**Agreement with the Python build:** 100% on players and teams in all ten files, and identical in every field.
Each change was also compared alone, at its commit, against the Python build with the later changes switched off;
each was identical. No team figure changes.

### Counts per file (Phase 3)

| File | Entries | shooting_scoring: tier / eligible / needs_minutes / incomplete | team_defence: tier / eligible / needs_second_season / needs_minutes / incomplete | no group (incomplete) | Incomplete by reason |
| --- | --- | --- | --- | --- | --- |
| 2022-men | 5372 | 178 / 706 / 1958 / 251 | 0 / 0 / 649 / 1341 / 107 | 182 | few_matches 2, identity 2, no_minutes 358, no_position 178 |
| 2023-men | 5342 | 210 / 835 / 1881 / 250 | 51 / 202 / 380 / 1279 / 107 | 147 | few_matches 3, identity 8, no_minutes 346, no_position 147 |
| 2024-men | 5444 | 212 / 840 / 1913 / 242 | 44 / 176 / 451 / 1321 / 114 | 131 | few_matches 2, identity 3, no_minutes 355, no_position 127 |
| 2025-men | 5534 | 206 / 821 / 2019 / 239 | 42 / 167 / 427 / 1406 / 96 | 111 | identity 3, no_minutes 338, no_position 105 |
| 2026-men | 5722 | 203 / 807 / 2098 / 250 | 39 / 156 / 450 / 1496 / 136 | 87 | identity 1, no_minutes 390, no_position 82 |
| 2022-women | 6502 | 245 / 976 / 2275 / 310 | 0 / 0 / 875 / 1508 / 128 | 185 | few_matches 2, identity 10, no_minutes 430, no_position 181 |
| 2023-women | 6582 | 284 / 1132 / 2149 / 280 | 81 / 313 / 445 / 1615 / 136 | 147 | few_matches 11, identity 10, no_minutes 399, no_position 143 |
| 2024-women | 6699 | 286 / 1142 / 2275 / 279 | 79 / 307 / 494 / 1618 / 115 | 104 | identity 2, no_minutes 394, no_position 102 |
| 2025-women | 6756 | 289 / 1152 / 2298 / 272 | 68 / 268 / 537 / 1660 / 119 | 93 | few_matches 8, identity 2, no_minutes 390, no_position 84 |
| 2026-women | 6780 | 283 / 1129 / 2377 / 274 | 65 / 256 / 526 / 1670 / 136 | 64 | few_matches 11, no_minutes 402, no_position 61 |

- **Entries:** 60,760 → 60,733. IR-18 lets N2a join 27 more split spellings into their roster entry.
- **`no_minutes`:** 5,598 → 3,802. Rule (b), under half the records printing minutes and no stats-file minutes, gives
  3,009. The U test gives 793: these are players short of the bar on box minutes whom the missing box scores could
  carry over it.
- **`identity`:** 18 → 41, and **`no_position`:** 989 → 1,210. Fewer entries are `no_minutes`, which 4.7 ranks
  above both.

### Tier holders per file (Phase 3)

| File | Tier 1 F | Tier 1 M | Tier 2 F | Tier 2 M | Team defence: defenders | Team defence: goalkeepers | All (Phase 2 → Phase 3) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 15 | 31 | 42 | 90 | 0 | 0 | 174 → 178 |
| 2023-men | 18 | 35 | 54 | 103 | 36 | 15 | 256 → 261 |
| 2024-men | 19 | 35 | 56 | 102 | 33 | 11 | 252 → 256 |
| 2025-men | 19 | 33 | 57 | 97 | 27 | 15 | 247 → 248 |
| 2026-men | 18 | 34 | 51 | 100 | 27 | 12 | 241 → 242 |
| 2022-women | 24 | 38 | 69 | 114 | 0 | 0 | 241 → 245 |
| 2023-women | 28 | 43 | 84 | 129 | 59 | 22 | 359 → 365 |
| 2024-women | 29 | 43 | 86 | 128 | 60 | 19 | 364 → 365 |
| 2025-women | 29 | 44 | 85 | 131 | 44 | 24 | 353 → 357 |
| 2026-women | 27 | 44 | 81 | 131 | 40 | 25 | 346 → 348 |

All files together: 2,833 → **2,865**. Tier 1 goes 1,063 → 1,075, and Tier 2 goes 1,770 → 1,790. 1,610 entries
change status, tier or kind against Phase 2: 17 lose a tier and 49 gain one.

Section 11.2, men / women:

| Row | Phase 2 | Phase 3 |
| --- | --- | --- |
| Regular defenders | 446.2 / 610.8 | 457.8 / 619.0 |
| Regular goalkeepers | 187.0 / 242.6 | 189.0 / 243.8 |
| Two-season defenders and goalkeepers | 216.0 / 356.8 | 219.2 / 359.2 |
| of whom hold the tier | 44.0 / 72.0 | 44.0 / 73.2 |

### The appendix under Phase 3

83 → 82 player-seasons. 2025 Jordina Rovira (IUP) leaves: IR-18 lets N2a join "Jordina Rovira Sole", whose lines
carry the penalty the play-by-play credits, so the play-by-play and the stats file now agree. The debug list prints
names before N2d's white-space collapse (IR-25), so the four names with doubled spaces read as before.

### Points for the orchestrator

These are measured in `RECONCILIATION.md`, "What the revised rulings still let in or throw away".

- **The U test's knock-on throws valid rows away.**
  - A season the U test makes `incomplete` no longer counts as the earlier season, although its box minutes, 600 or
    more, are certain.
  - This is why Elle Smith (IUP 2025) stays `incomplete`: the 2024 season has 602 box minutes and is U-test
    `incomplete` itself.
  - Smallest change: "a season the U test made `incomplete` still counts as the earlier season when its box minutes
    reach 600". Measured, it changes 88 entries and takes tier holders from 2,865 to 2,875. All 13 U-test cases among
    the 49 tier holders that Phase 2's N1 sent to `incomplete` return to a tier, which makes 46 of 49 in all.
- **N2c makes 36 links, and none of them is two people.** All 36 wrong links from Phase 2 are gone. It loses 9 right
  ones: 6 because the shirt number changed, 3 because a nickname is close only by (iv). One tier is affected: Alex
  Blanche (Christian Brothers 2025), Tier 1 → Tier 2. Relaxing either condition trades right links for wrong ones:
  - dropping the shared number: 5 right recovered for 1 wrong;
  - accepting (iv) again: 3 right for 2 wrong.
- **Tests (i) and (v) admit one sibling pair, Shiko and Shimon Ichimiya** (California (PA) men). Only the shared
  number refuses it: the class-year rule allows a fall of one step.
- **Honoured players:** Theo Faillon and Meghan Deneen return to Tier 2. Elle Smith stays `incomplete` (above).
- **Rule (b) keeps one of the 49 out:** Peter Plougmand (Mars Hill 2024), with minutes printed in 9 of 19 records.

### Gates (worktree, after `c58dca4ed1`)

| Gate | Result |
| --- | --- |
| `bunx tsc --noEmit -p .` | clean |
| `bunx biome check .` | 6 warnings, all in files this branch may not touch: `scripts/journal/national-prompt.ts` (2), `scripts/journal/national.ts`, `scripts/links.ts`, `src/lib/table.test.ts` (2). `scripts/tiers` is clean |
| `bun test` | 1,030 pass, 11 skip, 0 fail |
| `TOUCHLINE_CONTRACTS_DIR=… just verify` | exit 0 |

What `just verify` ran:

- biome, with the same 6 warnings;
- two `astro build` runs, of 2,728 and 3,429 pages;
- the men's gate: 1,051 pass, 5 skip, 0 fail;
- the women's gate: 1,041 pass, 15 skip, 0 fail;
- links: 6,157 pages and 571,797 references, 0 broken.


## Phase 4: the U test's earlier season (N1 (a), adopted)

The orchestrator approved IR-20 to IR-25 and adopted one sentence into N1 (a): *"A season the U test made
`incomplete` still counts as the earlier season when its box minutes reach 600."* N2c and rule (b) stay as written.
`RECONCILIATION.md` (ed-insights-platform, `docs/specs/player-tiers/reference/`) has the Phase 4 section and, at its
end, **"The rulings in force"**: the single final list of R-A to R-F, IR-1 to IR-25 and N1 to N5. `FINAL-COUNTS.md`,
beside it, holds the counts taken from these artifacts.

| Commit | Ruling | What changed here |
| --- | --- | --- |
| `0ed2e915f7` | N1 (a) | `shooting.ts` `earlierSeasonCounts`: the season before counts when it is not incomplete, or when only the U test made it so, from 600 box minutes. `compute.ts` `previousCounts` uses it in the U test and in section 5. Hand-worked tests in `shooting.test.ts` and `compute.test.ts` (2026 carries a U-test 2025: 630 + 1,080 = 1,710 minutes, 19 matches) |
| `78d86d24b1` | | Artifacts rebuilt, `--frozen-at 2026-11-16` |

**Agreement with the Python build:** 100% on players and teams in all ten files, and identical in every field.

**Effect:**

- 88 entries change; 7 lose a tier and 17 gain one.
- Tier holders go from 2,865 to **2,875**. Tier 1, with team defence, is 1,078 and Tier 2 is 1,797.
- `incomplete no_minutes` goes from 3,802 to 3,760; the U test now accounts for 751 of them.
- The 2022 files and team defence do not change.
- All 13 U-test cases among the 49 tier holders that Phase 2's N1 sent to `incomplete` hold a tier again. Elle
  Smith (IUP 2025) is Tier 2.
- Of the 49: 46 hold a tier, 2 are eligible, and 1 stays out under rule (b) (Peter Plougmand 2024).

### Tier holders per file (final)

| File | Tier 1 F | Tier 1 M | Tier 2 F | Tier 2 M | Team defence: defenders | Team defence: goalkeepers | All (Phase 3 → Phase 4) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 15 | 31 | 42 | 90 | 0 | 0 | 178 → 178 |
| 2023-men | 18 | 35 | 54 | 104 | 36 | 15 | 261 → 262 |
| 2024-men | 19 | 35 | 56 | 103 | 33 | 11 | 256 → 257 |
| 2025-men | 20 | 33 | 57 | 98 | 27 | 15 | 248 → 250 |
| 2026-men | 18 | 34 | 51 | 101 | 27 | 12 | 242 → 243 |
| 2022-women | 24 | 38 | 69 | 114 | 0 | 0 | 245 → 245 |
| 2023-women | 28 | 44 | 84 | 129 | 59 | 22 | 365 → 366 |
| 2024-women | 29 | 43 | 87 | 129 | 60 | 19 | 365 → 367 |
| 2025-women | 29 | 44 | 85 | 132 | 44 | 24 | 357 → 358 |
| 2026-women | 28 | 44 | 81 | 131 | 40 | 25 | 348 → 349 |

### Gates (worktree, after `78d86d24b1`)

| Gate | Result |
| --- | --- |
| `bunx tsc --noEmit -p .` | clean |
| `bunx biome check .` | the same 6 warnings, in files this branch may not touch; `scripts/tiers` is clean |
| `bun test` | 1,031 pass, 11 skip, 0 fail |
| `TOUCHLINE_CONTRACTS_DIR=… just verify` | exit 0 |

What `just verify` ran:

- biome, with the same 6 warnings;
- two `astro build` runs, of 2,728 and 3,429 pages;
- the men's gate: 1,052 pass, 5 skip, 0 fail;
- the women's gate: 1,042 pass, 15 skip, 0 fail;
- links: 6,157 pages and 571,797 references, 0 broken.

## After the Division I merge: the position reader, and a guard on it

`main` gained the Division I build (#68) while this branch was open, and the branch was rebased onto
it. #68 taught the site's position reader, `positionLine`, six codes ("goaltender", LCB, RWB, LWB, WF,
ATT), five misspellings and the form "c/rb". Ruling R-F makes that reader the tier build's reader, so
a change to it can change a tier.

**Nothing moved.** No Division II roster or box-score label of 2022 to 2026 uses any of the new
readings, and `bun run tiers:build` on the rebased branch reproduces all ten files byte for byte.

**The guard.** The build now writes `tiers/position-readings.json`: every label it asked the reader
about, 1,016 of them, with the answer it got. `scripts/tiers/position-readings.test.ts` fails when
`positionLine` reads any of them differently, and when the file's `frozen_at` is not the tier files'.
A sheet's position chip is read live and its tier is frozen, so without the guard a later change to
the reader could leave the two at odds for a player and nothing would say so. The failure message
names the labels and the two ways out: keep the old reading, or rebuild at the next freeze.

| Gate, after the guard | Result |
| --- | --- |
| `bun run tiers:build` | the ten files unchanged; `position-readings.json` written |
| `bunx tsc --noEmit -p .` | clean |
| `bunx biome check scripts/tiers` | clean |
| The guard with one reading altered by hand | fails, naming the label; passes when restored |

## Phase 6: contract 2.4 (rulings M1 to M7, and M10)

The orchestrator ruled on the final adversarial review (`ALGORITHM-2.4-rulings.md`, G1 to G12). This phase builds
M1 to M7 and M10, one ruling at a time, in this build and the Python build. M8 (wording) and M9 (not adopted) are
not build changes.
- Both builds read a frozen snapshot of the data home through `TOUCHLINE_DATA_DIR`: commit `ea45f891` with the same
  three modified files. Before the first ruling, `bun run tiers:build` reproduced the committed artifacts from it
  byte for byte.
- `RECONCILIATION.md` (ed-insights-platform, `docs/specs/player-tiers/reference/`) has the Phase 6 section, and
  "The rulings in force" is rewritten with M1 to M7 folded in.
- `FINAL-COUNTS.md`, beside it, holds the counts from these artifacts and the end state of every player named in
  G1 to G10.

| Commit | Ruling | What changed here |
| --- | --- | --- |
| `8adff84f82` | M1 | `minutes.ts`: in stats mode `T` is the larger of the players and keepers rows (the players row on a tie); minutes of record are the larger of `T` and the printed box minutes. The M1 regression tests are in `regressions.test.ts` |
| `c3294eeb1d` | M2 | `minutes.ts`, `compute.ts`: `U = box minutes + 90 × u`, where `u` counts only unprinted records in which the player has a line or the side has none. The M2 regression tests are in `regressions.test.ts` |
| `eff880b838` | M3 | `players.ts`, `minutes.ts`: a line in a record that prints no minutes for the side is an appearance, one per record; stats `matches` is the larger of that count and the row's gp |
| `3cec183381` | M4 | `players.ts`: the printed number is the roster line's field, trimmed, when IR-22 reads a number in it |
| `02de2003d6` | M5 | `players.ts`: test (vi) in N2a only, with a shared number (`testVi`, `nameWordList`). The M5 regression tests are in `regressions.test.ts` |
| `eaf3a5f6ab` | M6 | `players.ts`, `compute.ts`: `contradictsSameKey`, so a same-key link holds on a shared number despite the class year. N2c is unchanged |
| `d3a0e7f6e6` | M7 | `position.ts`: `BOX_LABELS_TO_OVERRULE = 3`, so the box scores overrule a two-position roster label only on three or more labels |
| `9cbc695d42` | M10 | `TIERS_SPEC` is `player-tiers/0.7` |
| `8dd9eae8eb` | | Artifacts rebuilt, `--frozen-at 2026-11-16`. `position-readings.json` is unchanged |

**Agreement with the Python build:** 100% on players and teams in all ten files after every stage, and identical in
every field, debug files included.

**Effect, stage by stage:**

| Ruling | Entries whose status, tier or kind changes | Tiers lost / gained | Holders |
| --- | ---: | --- | --- |
| M1 | 40; minutes of record rise for 402 entries | 5 / 10 | 2,875 → 2,880 |
| M2 | 121, all `incomplete no_minutes` → `needs_minutes`; U-test entries 751 → 627 | 0 / 0 | 2,880 |
| M3, M4 | 0, asserted; `matches` rises for 5,763 entries and the number changes for 13,693 | 0 / 0 | 2,880 |
| M5 | 5, and 10 joins (every one read: one person each); entries 60,733 → 60,723 | 1 / 1, 3 move | 2,881 |
| M6 | 2; exactly 3 same-key links restored (Fontenot, Moore, Greco) | 1 / 1 | 2,881 |
| M7 | 158; 229 entries return to the roster's whole label; kind flips 82 → 42 | 16 / 13, 9 move | 2,878 |

**Over the phase:**
- Tier holders 2,875 → **2,878**: Tier 1 with team defence 1,078 → 1,080, and Tier 2 1,797 → 1,798.
- Of the 60,713 entries in both builds, 320 change: 20 lose a tier, 22 gain one, and 12 move.

**Named end states:**
- Vasilis Christodoulou (Seton Hill 2025) is `eligible` on 1,216 minutes.
- May Queiroz (Florida Tech women 2022) is one entry, Tier 1.
- Gustavo Moses Bessa (Carson-Newman 2022) is `needs_minutes`, U 371.
- Josiah Fontenot (West Florida 2024) is Tier 2.
- Elle Smith (IUP 2025) is midfield Tier 1.
- Keegan Ferreira (Hawaii–Hilo) still changes kind between 2022 and 2023: M7 does not reach his case.

**The T5 label swap** (`REF_BOX_FIRST=1` in the Python build) has 2,918 holders. Against the final build, 123 lose a
tier and 163 gain one.

### Tier holders per file (final)

| File | Tier 1 F | Tier 1 M | Tier 2 F | Tier 2 M | Team defence: defenders | Team defence: goalkeepers | All (Phase 4 → Phase 6) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 15 | 31 | 42 | 91 | 0 | 0 | 178 → 179 |
| 2023-men | 18 | 35 | 54 | 105 | 35 | 16 | 262 → 263 |
| 2024-men | 19 | 35 | 56 | 103 | 33 | 12 | 257 → 258 |
| 2025-men | 20 | 33 | 57 | 97 | 27 | 15 | 250 → 249 |
| 2026-men | 18 | 34 | 52 | 101 | 29 | 12 | 243 → 246 |
| 2022-women | 24 | 38 | 69 | 114 | 0 | 0 | 245 → 245 |
| 2023-women | 29 | 43 | 84 | 128 | 59 | 22 | 366 → 365 |
| 2024-women | 29 | 43 | 87 | 129 | 60 | 19 | 367 → 367 |
| 2025-women | 28 | 44 | 84 | 132 | 44 | 24 | 358 → 356 |
| 2026-women | 28 | 44 | 81 | 132 | 41 | 24 | 349 → 350 |

### Readings invented in Phase 6 (for approval)

`RECONCILIATION.md` words them as IR-26 to IR-32. Both builds apply each one identically.

- **M1:** when `T` ties, the players-list row is the row of record, and its gp is used.
- **M3:**
  - a record adds at most one appearance;
  - stats mode without an integer gp takes the appearance count;
  - "the build asserts it" is an assertion in the stage comparison of both builds, not a run-time check.
- **M5:**
  - words that fold to nothing are dropped before the first word is taken;
  - a word is a white-space word, so a hyphenated double surname is one word. The other reading would add 9 joins.
- **M7:** the three are counted over every line the entry holds, so a doubled line counts twice. At most 2 entries
  could read differently.

### Gates (worktree, after `8dd9eae8eb`)

| Gate | Result |
| --- | --- |
| `bunx tsc --noEmit -p .` | clean |
| `bunx biome check .` | the same 6 warnings, in files this branch may not touch; `scripts/tiers` is clean |
| `bun test` | 1,071 pass, 11 skip, 0 fail |
| `TOUCHLINE_CONTRACTS_DIR=… just verify` | exit 0 |

What `just verify` ran:

- biome, with the same 6 warnings;
- three `astro build` runs: Division II men 2,728 pages, Division II women 3,429, and Division I 3,323;
- the men's gate: 1,092 pass, 5 skip, 0 fail;
- the women's gate: 1,082 pass, 15 skip, 0 fail;
- the Division I men's gate: 1,020 pass, 35 skip, 0 fail;
- links: 9,480 pages and 852,435 references, 0 broken.

## Stage 8: IR-31 replaced, a test (vi) word ends at a hyphen

The orchestrator approved IR-26 to IR-30 and IR-32 as built, and replaced IR-31: **in test (vi), a word ends at
white space or at a hyphen.** Test (ii) and every other reading of a word are unchanged, and every other condition
of N2a stands. Both builds read the same frozen snapshot as in Phase 6.

| Commit | What changed here |
| --- | --- |
| `6948a34193` | `players.ts`: `nameWordList` splits on white space and on U+002D, U+2010 and U+2011, so a hyphenated double surname is two words in test (vi). `nameWords` (test (ii)) is unchanged. The regression test "[IR-31] a hyphenated double surname joins under (vi)" is in `regressions.test.ts` |
| `5d83723c44` | Artifacts rebuilt, `--frozen-at 2026-11-16`: one entry fewer in six files, and three fewer in 2023 men. `position-readings.json` is unchanged |

**Agreement with the Python build:** 100% on players and teams in all ten files, and identical in every field, debug
files included. The Python build keeps the old reading behind `REF_VI_SPACE=1`, which reproduces Phase 6 exactly.

**Effect:**
- 9 joins added, each read as one person; entries 60,723 → 60,714. `joins-sample.md` lists them with their evidence.
- 2 statuses change, both Charlise Hernandez-Tersigni's (Ursuline): 2023 `needs_minutes` → `eligible`, and 2024
  `needs_second_season` → `eligible`. Three of the 9 entries absorbed were `incomplete no_position`.
- No other entry changes status, tier or kind. Tiers lost 0, gained 0. Holders stay 2,878, and the per-file table
  in Phase 6 stands.
- N2b's flagged pairs (33) and N2c's links (36) are unchanged. The sibling pairs (Wegesend, Pollacchi, Reis,
  Ichimiya, Camargo, Burke, Vandamia, Padilla) stay apart.

**Named end states:**
- Charlise Hernandez-Tersigni (Ursuline women): 2022 `needs_second_season` on 1,245 minutes, 2023 `eligible` on
  1,083, 2024 `eligible` on 1,312, and 2025 `eligible` on 1,515.
- Carlos Murguia (Erskine 2023): `eligible` on 961.
- Madison Richardson (Chowan women 2026): a goalkeeper, `needs_minutes` on 423.

### Gates (worktree, after `5d83723c44`)

| Gate | Result |
| --- | --- |
| `bunx tsc --noEmit -p .` | clean |
| `bunx biome check .` | the same 6 warnings, in files this branch may not touch; `scripts/tiers` is clean |
| `bun test` | 1,076 pass, 7 skip, 0 fail |
| `TOUCHLINE_CONTRACTS_DIR=… just verify` | exit 0 |

`bun test` has one test more than in Phase 6, the IR-31 test. Four fewer skip: those four test the built pages, and
in Phase 6 they skipped because `dist/` predated a test file.

What `just verify` ran:

- biome, with the same 6 warnings;
- three `astro build` runs: Division II men 2,728 pages, Division II women 3,429, and Division I 3,323;
- the men's gate: 1,093 pass, 5 skip, 0 fail;
- the women's gate: 1,083 pass, 15 skip, 0 fail;
- the Division I men's gate: 1,021 pass, 35 skip, 0 fail;
- links: 9,480 pages and 852,435 references, 0 broken.

## The freeze of 16 November 2026, from a clean data commit

Every file before this one printed `data_commit: ea45f891+dirty`: three files of the data home were
uncommitted when the tiers were first set. The daily collection of 16 November committed them, and
the files were rebuilt with `--require-clean` from data commit `a6c5e738`, which holds every match
played to 15 November.

- **2022 to 2025:** no entry changes; only the commit id in each file.
- **2026 men:** 24 entries change status; holders 246 → 247 (5 lose a tier, 6 gain one).
- **2026 women:** 34 entries change status; holders 350 → 353 (12 lose, 15 gain).
- **All ten files:** 60,715 entries and 2,882 tier holders.
- **The Python reference build**, rebuilt from the same commit, is identical to these files field for
  field (`compare-final.txt`: PASS in every file).
- `tiers/position-readings.json` is unchanged.

This is the freeze the site publishes and the 2026 honours lists are compared with. It is not
rebuilt until the next season's freeze.

## Division I men: the freeze of 20 November 2026

| | |
| --- | --- |
| Built | 2026-11-20. `frozen_at` is 2026-11-20 in every file. |
| Data home | `~/keelson/d1-soccer` at **`fd497c9`**, clean: 2022 to 2026, 23 conferences in 2022 (rib #145), after the alias round (rib #146) and the re-collect of A10, Horizon, Summit and Ivy 2022. |
| Command | `bun run tiers:build:d1` (= `TOUCHLINE_NCAA_DIVISION=d1 bun run scripts/tiers/build.ts --out tiers/d1 --frozen-at 2026-11-20`). Men only: the build computes the genders the data home holds files for and the level has constants for. |
| Output | `tiers/d1/{2022..2026}-men.json` and `tiers/position-readings.d1.json`, committed; `tiers/.debug-d1/` gitignored. Division II's files and readings are untouched. |
| Constants | Fitted on this home by the procedure that fitted Division II's (ed-insights-platform `evidence/v01.py`), frozen before measuring, in `src/lib/tier-constants.ts`: wG 0.207, wS 0.0837; one season 0.80 / 0.20; two seasons 0.60 / 0.30 / 0.10. The same script on Division II's own debug files gives 0.79 / 0.21 and 0.58 / 0.34 / 0.08, its published blend to the rounding. |

**What is shown.** T1 on this home (FIRMNESS.md method, 100 splits, the Python reference build
adapted to Division I with the constants above): midfielders R 0.86 (0.85 to 0.87), 100 of 100
splits at 0.80; forwards 0.78 (0.77 to 0.80), 3 of 100; team defence 0.47 (0.39 to 0.53), 0 of
100. `src/tiers.config.ts` shows midfielders' shooting and scoring on Division I and nothing
else; the files carry every entry, and the sheet draws only what the level shows (`levelShows`).

**Against the Python reference build.** Every midfielder's status and tier agrees in all five
files (2026: 39 Tier 1, 114 Tier 2). 2022, 2023 and 2026 agree on every entry. At Virginia,
this build counts more minutes for 24 players in 2024 and 2 in 2025, and has one 2024 forward
the reference does not (Anthony Faupel); the extra forward moves four other forwards across a
2024 cut (Penn, Dayton, Canisius, North Carolina). No status or tier of a midfielder differs, and
forwards are not shown on Division I. Filed as bead tui-93x.

### Tier holders per file

| File | Tier 1 M | Tier 2 M | (Tier 1 F, not shown) | (Tier 2 F, not shown) |
| --- | --- | --- | --- | --- |
| 2022-men | 37 | 111 | 17 | 49 |
| 2023-men | 43 | 128 | 21 | 60 |
| 2024-men | 43 | 126 | 22 | 63 |
| 2025-men | 41 | 120 | 20 | 60 |
| 2026-men | 39 | 114 | 20 | 58 |

## The team defence badge, and the defence tier retired: 20 November 2026

The adversarial review of this day (ed-insights-platform `player-tiers/evidence/defence-review`)
measured the team defence tier against T1 and found it a team's record handed to its regular
defenders and goalkeepers, with nothing individual in it that repeats: the record standardised
inside workload thirds has R 0.51 / 0.54 / 0.40 for teams (D2 men, D2 women, D1 men), and the
career label 0.60 / 0.64 / 0.35. The same record across the whole division, one season, has R
0.76 / 0.82 / 0.66 against the single-label bar of 0.61, and passes on every level. The owner
chose to show it on the team: the **team defence badge**.

| | |
| --- | --- |
| Rule | Spec 0.8: the top `ceil(0.20 × N)` (ties in) by record = −ln(max(GA, 0.5) / EGA), over the season's programmes with a workload group (n ≥ 12). No standardising, no seasons averaged. `scripts/tiers/output.ts` `badgeHolders`. |
| Schema | `touchline-ui.tiers/2`: each team carries `badge`; the reader refuses a badge without a workload group. |
| Rebuild | Every file rebuilt at its own frozen data commit (D2 from a clone at a6c5e738, D1 at fd497c9). Against the committed files, the only changes are `schema`, `spec` and each team's `badge`: every entry, figure and tier is byte for byte as frozen. The shooting tiers do not move. |
| Shown | Team pages on D1 and D2 (the crest line, with earlier seasons); a regular defender's or goalkeeper's sheet keeps the three team figures under TEAM DEFENCE, with the badge when the team holds it. No player holds a defence tier on any level; the files keep the defence entries, which mark a regular for those figures. |

**What the badge is.** About three-quarters of the record is shot volume: it credits the whole
team's defending, keeping opponents from shooting first. In 2026 the holders are 30 light / 9
typical / 1 heavy workload (D2 men), 40 / 10 / 0 (D2 women) and 31 / 9 / 3 (D1 men). The method
page says so. It has not been tested season forward; a team's record correlates 0.52 to 0.71
with its record the season before.

### Badges per file

| File | Teams with a group | Badges |
| --- | --- | --- |
| d2/2022..2026-men | about 198 | 40 each |
| d2/2022..2026-women | about 250 | 50, 50, 51, 51, 50 |
| d1/2022..2026-men | about 212 | 42, 43, 43, 43, 43 |

## Forwards: one tier on every level, 20 November 2026

The owner's decision, the same day: a forward holds one shooting and scoring tier, the top 20%,
on Division I and Division II alike, and midfielders keep Tier 1 and Tier 2 on both. Division I
forwards measured R 0.78 (above), short of T1's 0.80 for a label with two levels and over its
0.61 for a label with one; one rule on every level puts Division II's forwards on one tier too.

No file is rebuilt. A file's Tier 1 and Tier 2 for a group are the top 5% and the rest of the top
20% (`scripts/tiers/shooting.ts`, both cuts with ties), so a forward holding either is in the
top 20% with ties, and the sheet reads the one tier from them (`SHOOTING_LEVELS` in
`src/tiers.config.ts`). No forward's place in or out of a tier moves; only the label does.
Division I's sheets now show forwards, and its measured row for forwards carries the one-level
bar.

How often the one tier repeats across random halves (FIRMNESS.md A3 and this home's run, the
top 20% on one half in it on the other, Tier 1 and Tier 2 holders pooled): D2 men 51%, D2 women
64%, D1 men 50%, against 20% by chance. The method page prints them as about 5 and 6 in 10.
