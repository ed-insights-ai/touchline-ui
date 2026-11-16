# Player tiers: build log, implements ALGORITHM.md version 2.2

This build implements **ALGORITHM.md version 2.2**.

| | |
| --- | --- |
| Built | 2026-11-15. `frozen_at` is 2026-11-16 in every file, the date this freeze fixes. |
| Contract | `docs/specs/player-tiers/ALGORITHM.md`, **version 2.2**, for specification draft 0.6 (ed-insights-platform). Sections 1, 4.2, 4.4, 4.6, 10 and 11 were re-read against this build before it was committed. |
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
  (`src/lib/kickoff-division.ts`). Its kept copy is the posted record of the home side's
  conference. The fold runs once per identity group (`foldEach`), so one refused group cannot stop
  a season.
- Exhibitions are dropped with `isExhibition` (`derive.ts`) and forfeits with `isForfeit`
  (`model.ts`). `NameBook` (`names.ts`) builds the site's `Season`. `isGoalPlay` (`plays.ts`)
  counts goals for the 11.2 penalty share.
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
| Regular defenders a season | about 444 | 436.2 | about 611 | 607.4 |
| Regular goalkeepers a season | about 181 | 177.8 | about 231 | 228.8 |
| Defenders and goalkeepers with two or more seasons counted, a season, 2023 to 2026 | about 207 | 204.0 | about 349 | 346.3 |
| Of those, holding the tier (2023 to 2026) | about 42 | 41.5 | about 71 | 70.3 |
| Penalty goals as a share of all goals in the play-by-play | 8.2% | 8.1% (2,280 of 28,213) | 5.6% | 5.6% (1,907 of 33,854) |

Every row agrees with the re-based table to within 2%. The workload counts and the women's penalty
share match exactly, and every other row sits a little under its figure. Two checks came first,
because the other build named them as decisive:

- **The share denominator is the one 8 defines.** `m` counts the records in which the
  programme's box score prints minutes for at least one of its own players (`withMinutes` in
  `scripts/tiers/compute.ts`). Reading "at least one player" as either side of the box score gives
  the same counts to the decimal: 436.2 and 177.8 for men. Dividing by all records (n) instead
  gives 400.6 and 169.8, far under the table.
- **One match a day runs before anything is summed.** `physicalMatches` merges each cluster before
  it returns a single record. The model rows, team totals, sheets and minutes are all built from
  that list.

**The rest of the gap is very likely which copy's box score supplies a side's lines.** The contract
names the kept copy for the score (section 1) but names no copy for the box score. This build reads
the kept copy's box score, and another copy's only when the kept copy has none (52 records in all).

In 306 men's and 284 women's side-records, the kept copy prints no minutes for that side while the
other copy does. I patched the build in a scratch copy so that such a side reads the copy that
prints minutes. That gives 442.8 / 611.0 regular defenders, 180.4 / 230.8 goalkeepers, 207.3 /
348.3 with two or more seasons and 42.8 / 70.5 holding the tier. Those are the re-based figures
almost exactly. The committed files keep the kept-copy reading (see R1 and O2).

The penalty share is 8.08% for men (2,280 of 28,213), against 8.2%. That difference is not
explained. Every play of type `penalty` that is an attempt and says PENALTY KICK GOAL or FOR A GOAL
is counted, over the same records the rest of the build uses.

## Acceptance 11.4: players incomplete for identity

| File | Without the roster pass: identity / of them 600+ minutes | With it (the artifact): identity / of them 600+ minutes | Lines the roster lookup tied to an entry | Lookups refused (line already tied elsewhere) | Merges blocked (different page ids or roster entries) |
| --- | --- | --- | --- | --- | --- |
| 2022-men | 166 / 47 | 23 / 6 | 35752 | 0 | 0 |
| 2023-men | 162 / 38 | 23 / 3 | 39091 | 0 | 0 |
| 2024-men | 146 / 45 | 18 / 4 | 40339 | 0 | 0 |
| 2025-men | 150 / 48 | 17 / 2 | 41454 | 0 | 0 |
| 2026-men | 9 / 1 | 1 / 0 | 3995 | 0 | 0 |
| 2022-women | 41 / 11 | 14 / 3 | 7264 | 0 | 0 |
| 2023-women | 33 / 9 | 9 / 2 | 7988 | 0 | 0 |
| 2024-women | 25 / 4 | 2 / 0 | 8076 | 0 | 0 |
| 2025-women | 14 / 3 | 4 / 1 | 8554 | 0 | 0 |
| 2026-women | 10 / 2 | 0 / 0 | 3523 | 0 | 0 |

"Without the roster pass" is this build with pass 3 of 4.2 switched off. The bio-id ties of 4.2
(page, twin and roster refs, and page ids) still hold in that run. Version 1 lost 141 / 126 / 116 /
120 men and 41 / 31 / 25 / 14 women. The roster pass recovers most of those:

- **Men:** 23 / 23 / 18 / 17 remain in 2022 to 2025, and 6 / 3 / 4 / 2 of them have 600 or more
  minutes.
- **Women:** 14 / 9 / 2 / 4 / 0 remain.

The lookup column counts lines, not players: every line with no ref or a `key` ref is looked up.

## Counts per file

| File | Entries | shooting_scoring: tier / eligible / needs_minutes / incomplete | team_defence: tier / eligible / needs_second_season / needs_minutes / incomplete | no group (incomplete) | Incomplete by reason | Teams light / typical / heavy / none |
| --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 5539 | 163 / 651 / 2300 / 15 | 0 / 0 / 623 / 1489 / 17 | 281 | few_matches 9, identity 23, no_position 281 | 66 / 66 / 66 / 1 |
| 2023-men | 5536 | 196 / 780 / 2235 / 17 | 48 / 190 / 364 / 1437 / 21 | 248 | few_matches 15, identity 23, no_position 248 | 65 / 65 / 66 / 1 |
| 2024-men | 5585 | 197 / 781 / 2234 / 11 | 44 / 170 / 423 / 1491 / 16 | 218 | few_matches 9, identity 18, no_position 218 | 67 / 66 / 67 / 1 |
| 2025-men | 5690 | 193 / 764 / 2345 / 8 | 38 / 148 / 416 / 1551 / 9 | 218 | identity 17, no_position 218 | 66 / 66 / 66 / 0 |
| 2026-men | 5898 | 184 / 731 / 2476 / 1 | 36 / 142 / 428 / 1708 / 0 | 192 | identity 1, no_position 192 | 66 / 66 / 66 / 0 |
| 2022-women | 6608 | 232 / 920 / 2632 / 45 | 0 / 0 / 835 / 1655 / 47 | 242 | few_matches 14, identity 14, no_minutes 65, no_position 241 | 83 / 83 / 83 / 1 |
| 2023-women | 6697 | 270 / 1077 / 2484 / 25 | 77 / 300 / 451 / 1755 / 40 | 218 | few_matches 20, identity 9, no_minutes 36, no_position 218 | 82 / 82 / 83 / 2 |
| 2024-women | 6807 | 273 / 1088 / 2605 / 19 | 75 / 297 / 480 / 1788 / 6 | 176 | identity 2, no_minutes 23, no_position 176 | 84 / 84 / 84 / 0 |
| 2025-women | 6848 | 271 / 1081 / 2634 / 17 | 65 / 259 / 529 / 1794 / 27 | 171 | few_matches 16, identity 4, no_minutes 26, no_position 169 | 84 / 83 / 84 / 2 |
| 2026-women | 6881 | 271 / 1082 / 2697 / 26 | 64 / 248 / 501 / 1832 / 23 | 137 | few_matches 11, no_minutes 38, no_position 137 | 83 / 83 / 84 / 2 |

## Tier holders per file

| File | Tier 1 F | Tier 1 M | Tier 2 F | Tier 2 M | Team defence: defenders | Team defence: goalkeepers |
| --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 13 | 28 | 39 | 83 | 0 | 0 |
| 2023-men | 17 | 33 | 49 | 97 | 32 | 16 |
| 2024-men | 18 | 32 | 51 | 96 | 34 | 10 |
| 2025-men | 18 | 31 | 54 | 90 | 25 | 13 |
| 2026-men | 16 | 31 | 45 | 92 | 24 | 12 |
| 2022-women | 23 | 36 | 66 | 107 | 0 | 0 |
| 2023-women | 27 | 41 | 80 | 122 | 56 | 21 |
| 2024-women | 28 | 41 | 82 | 122 | 55 | 20 |
| 2025-women | 26 | 42 | 78 | 125 | 42 | 23 |
| 2026-women | 26 | 42 | 78 | 125 | 43 | 21 |

No 2022 player can hold the team-defence tier: 2021 is out of scope (sections 0 and 8).

## One record per match, and what the build set aside

| Season | Sightings | Physical (site fold) | Exhibitions | Forfeits | Not final | No box score in any copy | Records | Disputed (kept, canonical score) | Box score from another copy | Box score with no home_index | Refused by the fold (unplayed) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 2413 | 1989 | 54 | 0 | 84 | 23 | 1821 | 0 | 8 | 0 | 0 |
| 2023-men | 2449 | 2014 | 52 | 0 | 115 | 22 | 1814 | 0 | 3 | 0 | 0 |
| 2024-men | 2513 | 2057 | 58 | 1 | 116 | 27 | 1847 | 0 | 11 | 1 | 0 |
| 2025-men | 2481 | 2003 | 46 | 0 | 102 | 14 | 1830 | 0 | 7 | 1 | 0 |
| 2026-men | 2489 | 2014 | 65 | 0 | 112 | 10 | 1824 | 1 | 5 | 1 | 0 |
| 2022-women | 3080 | 2593 | 68 | 0 | 134 | 23 | 2345 | 0 | 4 | 0 | 0 |
| 2023-women | 3090 | 2591 | 71 | 2 | 121 | 30 | 2347 | 0 | 3 | 0 | 0 |
| 2024-women | 3156 | 2608 | 68 | 0 | 142 | 11 | 2374 | 0 | 4 | 0 | 2024-09-12 flagler v florida-tech |
| 2025-women | 3166 | 2605 | 67 | 0 | 123 | 10 | 2387 | 0 | 3 | 0 | 0 |
| 2026-women | 3132 | 2596 | 78 | 4 | 146 | 10 | 2357 | 0 | 4 | 0 | 0 |

- **"Physical"** counts the site fold's groups.
- **Not records:** exhibitions, forfeits, matches that are not final, and finals with no box score
  in any copy ([v2]).
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

- men: goals mu 1.6443, home 1.0985, 1291 teams; shots mu 12.4242, home 1.0725, 1291 teams
- women: goals mu 1.5093, home 1.1085, 1537 teams; shots mu 12.5795, home 1.0787, 1537 teams

## Measures behind the remaining ambiguities

| Season | Workload boundaries | Penalty attempts / unattributed / not attempts | Lines without minutes | Records with a doubled line | Box-group ties | Roster label with no group | No roster entry | Split pairs | Contradicted links | Ambiguous links | No-minutes programmes | Teams with n = 0 | Programme-days with two records |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 10.508 / 13.227 | 647 / 4 / 9 | 5971 | 9 | 2 | 145 | 513 | 13 | 0 | 0 | 0 | 0 | 0 |
| 2023-men | 11.056 / 13.250 | 615 / 4 / 1 | 5732 | 3 | 2 | 106 | 411 | 12 | 2 | 0 | 0 | 0 | 0 |
| 2024-men | 10.860 / 12.715 | 570 / 5 / 1 | 6221 | 1 | 1 | 91 | 311 | 11 | 5 | 0 | 0 | 0 | 0 |
| 2025-men | 10.926 / 13.129 | 561 / 4 / 2 | 5683 | 2 | 0 | 66 | 310 | 11 | 1 | 0 | 0 | 0 | 0 |
| 2026-men | 11.137 / 13.489 | 641 / 7 / 3 | 6657 | 15 | 0 | 50 | 297 | 1 | 11 | 0 | 0 | 0 | 0 |
| 2022-women | 10.253 / 13.021 | 545 / 7 / 4 | 7221 | 2 | 2 | 62 | 477 | 10 | 0 | 0 | bloomsburg, e-stroudsburg | 0 | queens 2022-08-28 |
| 2023-women | 10.250 / 13.381 | 575 / 2 / 3 | 7524 | 2 | 1 | 91 | 367 | 5 | 3 | 0 | bloomsburg | 0 | 0 |
| 2024-women | 10.229 / 13.699 | 509 / 4 / 0 | 6784 | 1 | 1 | 65 | 291 | 1 | 4 | 0 | adelphi | 0 | 0 |
| 2025-women | 10.268 / 13.681 | 519 / 3 / 0 | 6817 | 0 | 0 | 28 | 303 | 2 | 3 | 0 | kutztown | 0 | 0 |
| 2026-women | 10.278 / 14.059 | 500 / 0 / 2 | 6442 | 6 | 3 | 33 | 204 | 0 | 0 | 0 | bloomsburg | 0 | 0 |

| Season | no_position / with no label at all | Player-seasons the stats file's penalties changed | … of them, every excess penalty is one the play-by-play credits on a record 4.6 skipped (no minutes) |
| --- | --- | --- | --- |
| 2022-men | 281 / 272 | 65 | 39 |
| 2023-men | 248 / 246 | 56 | 41 |
| 2024-men | 218 / 213 | 73 | 46 |
| 2025-men | 218 / 202 | 44 | 37 |
| 2026-men | 192 / 184 | 62 | 51 |
| 2022-women | 241 / 238 | 38 | 32 |
| 2023-women | 218 / 216 | 29 | 27 |
| 2024-women | 176 / 172 | 29 | 25 |
| 2025-women | 169 / 163 | 30 | 26 |
| 2026-women | 137 / 129 | 23 | 21 |

Labels carried by no_position players, all files: `"Center Defensive Midfielder"` 4, `"Defensive Midfield"` 3, `"Forward, Back"` 3, `"LM/RM"` 3, `"C"` 2, `"CMF"` 2, `"Health Science"` 2, `"Left Wing"` 2, `"Right-Back/Center-Midfield"` 2; and 42 labels printed once, not listed (some are a club or a school).

Roster class years the 4.4 ladder cannot place (they name no year, and never contradict a link), all files: `"Redshirt"` 13.

- "Contradicted links" counts same-key links that 4.4's home town or class year breaks.
- "Box-group ties" counts players with no roster group whose box labels tie. The tie goes to the
  group that appears first in date order.
- The no-minutes programmes are women's programme-seasons whose box scores print minutes for
  none of their players. Every player there is `incomplete`, `no_minutes`.

2,098 of 62,089 entries are `no_position`. Almost all of them carry no label of any kind:
no roster line, or a roster line with no position, and no box-score label.

## Changes from version 1, file by file

v1 is the committed `9f9f08c02c`. Entries are matched within a programme:

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

- **R1. Which copy's box score.** A programme's lines and shots are read from the kept copy's box
  score. Another copy's is used only when the kept copy has none (52 records). "The programme's box
  scores" (4.2) could also mean the copy its own site published, or a copy that prints minutes. This
  choice moves the 11.2 rows by about 2% (see above), and is likely the largest source of
  disagreement under 11.1.
- **R2. `m` per side.** "Its box score prints minutes for at least one player" is read as the
  programme's own side. The either-side reading gives identical counts.
- **R3. Bio-id ties.** A group is tied through any page, twin or roster ref id, or any page
  `player_id`, equal to a roster entry's bio id. If one line's ref id and page id tied to two
  different entries, the ref would win. That never happens: 0 lines.
- **R4. Roster entries without a bio id.** Such an entry is identified by its place on the list.
  Two id-less rows of one folded name are therefore two entries, and the name test answers neither;
  the number-and-surname test may. Two rows with one bio id are one entry, as in the collector's
  index. Rows with no name are skipped.
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
- **R8. The kicker's first-letter test** compares the try's first letter with each line's first
  letter, worked out the same way: the first word after the given-first swap. The contract states
  only the try's side. Lines that fold alike are one player printed twice: they resolve together
  and are credited once.
- **R9. Not-attempt plays.** `*` is tested at the start of the play text, and AWARDED as printed,
  in capitals. Counted over the 2022 to 2026 files, copies included, 16 penalty plays begin with
  `*`. Another 40 end with one, after "goal number N for season.": those are kicks, and testing
  only the start keeps them. All 18 plays that say "awarded" print it in capitals.
- **R10. Sort tie-breaks.** A null `player_id` goes first, as the contract says for a null number;
  the contract does not say this for `player_id`. No two entries in any file share a key and a
  number, so neither the name nor the `player_id` tie-break is ever reached.
- **R11. The stats file.** A player joins a stats row only when exactly one row has the player's
  page id; failing that, exactly one row must have the player's folded name. Two candidates mean no
  join, and no scaling.
- **R12. Box-score labels for the fallback** in section 3 include lines that print no minutes, and
  both lines of a doubled player.
- **R13. Box scores with no usable `home_index`** cannot be oriented: 3 records. The fixture score
  still enters the goals model, but no shots and no lines are read from them.
- **R14. A chain cluster**, whose records share no single slug, would stand unmerged and be listed.
  So would a cluster the site's fold refuses once its copies are rewritten. Neither occurs at this
  freeze.
- **R15. Teams and players.** Both hold every collected programme-season with at least one record.
  A programme with records but no box-score line would get an empty list. None occurs, and no
  collected programme-season has zero records.

## Where version 2.2 looks wrong

Each item below is implemented as written.

- **O1. The second penalty source takes a penalty off twice.**
  - 4.6 compares the stats file with "the penalty goals found above". It skips a record whose line
    prints no minutes, and in v2.2 a penalty on such a line "changes nothing". So that penalty is
    neither found nor in G.
  - The stats file counts it, so the excess `e` includes it, and adjG is scaled down for a goal
    that G never held.
  - Of the 449 player-seasons the second source changed, **345** are wholly this
    case: every excess penalty is one the play-by-play credits to the player on a skipped record.
  - Fix: compare the stats file with every penalty the play-by-play credits to the player, skipped
    records included. Or subtract those from `e`.
- **O2. Section 1 names the kept copy for the score but no copy for the box score** (R1). Two
  faithful builds can differ by about 2% in regular defenders, and the 2.2 sanity table seems to
  come from a reading other than this one. The contract should name the copy, for example "the kept
  copy's box score; for a side it prints no minutes for, the other copy's".
- **O3. The shortest kicker tries match by surname alone.** A one-word try takes no first-letter
  test, and dropping leading words can drop a real initial. So "FHSU Z. Laws" credits the only Laws
  on the sheet, Rhys Laws, though the text gives the initial Z. As written, any text ending in a
  surname that appears once on the sheet is credited.

The objections to version 1 (C1 to C6) were all answered by versions 2 to 2.2: one match a day, the
position normaliser, `m`, the 2022 note, rounding, and `basis.seasons`.

## Rebuild

```bash
cd <this worktree>
bun install
bun run tiers:build   # = bun run scripts/tiers/build.ts --out tiers/d2 --frozen-at 2026-11-16
# TOUCHLINE_DATA_DIR overrides the data home (default ~/keelson/d2-soccer)
```

## Appendix: every player the second penalty source changed (4.6)

The counts are as the two sources print them, for each player-season whose stats file shows more
penalty goals or attempts than the play-by-play found. Names are as the source prints them. The
last column marks the O1 case. The scaling factors are in `tiers/.debug/stats-penalties.csv`, which
is not committed.

| File | Programme | Player | Penalty goals: play-by-play / stats file | Penalty attempts: play-by-play / stats file | The excess sits on records with no minutes |
| --- | --- | --- | --- | --- | --- |
| 2022-men | adams-state | Aidyn Ogle | 0 / 1 | 0 / 1 | no |
| 2022-men | adelphi | Rodrigo Descalzo Rocca | 0 / 2 | 0 / 2 | yes |
| 2022-men | assumption | Johannes Sundgot | 0 / 1 | 0 / 1 | yes |
| 2022-men | bentley | Ronan Fitzpatrick | 2 / 2 | 2 / 3 | yes |
| 2022-men | bloomsburg | Anthony Schlee | 0 / 1 | 0 / 1 | yes |
| 2022-men | bloomsburg | Olly Whitham | 0 / 2 | 0 / 3 | yes |
| 2022-men | bridgeport | Ian Spetnagel | 0 / 1 | 0 / 1 | yes |
| 2022-men | bridgeport | Lucas Sousa | 0 / 2 | 0 / 2 | yes |
| 2022-men | carson-newman | Jannik Schulte | 0 / 1 | 0 / 2 | yes |
| 2022-men | carson-newman | Yannick Kranz | 1 / 2 | 1 / 2 | yes |
| 2022-men | clayton-state | Lewis Green | 0 / 0 | 0 / 1 | no |
| 2022-men | concord | Tomas Kelly | 0 / 1 | 0 / 1 | yes |
| 2022-men | csu-pueblo | Reggie Nicolas | 0 / 0 | 0 / 1 | no |
| 2022-men | davis-elkins | Alex Estrada-Avila | 4 / 5 | 4 / 5 | yes |
| 2022-men | district-of-columbia | Ignacio Pericet | 0 / 1 | 0 / 1 | yes |
| 2022-men | e-stroudsburg | Bradley Turocy | 0 / 1 | 0 / 2 | yes |
| 2022-men | e-stroudsburg | Ignasi Cucurella Tuset | 0 / 1 | 0 / 1 | no |
| 2022-men | emmanuel | Lucas Pollacchi | 1 / 2 | 1 / 2 | no |
| 2022-men | florida-tech | Julen Lafuente | 0 / 1 | 0 / 1 | no |
| 2022-men | fort-hays-state | Blake Arndt | 1 / 3 | 1 / 3 | no |
| 2022-men | frostburg-state | Ethan Addo | 0 / 0 | 0 / 1 | yes |
| 2022-men | gannon | Sergio Del Castillo | 3 / 4 | 3 / 4 | yes |
| 2022-men | georgia-southwestern | Jr., Daniel Gardner | 0 / 1 | 0 / 1 | no |
| 2022-men | goldey-beacom | Patrick Short | 0 / 0 | 0 / 1 | no |
| 2022-men | harding | Matthew Sanchez | 0 / 1 | 0 / 1 | no |
| 2022-men | jefferson | Noah Stover | 0 / 1 | 0 / 1 | yes |
| 2022-men | lake-erie | Teddy Baker | 1 / 2 | 2 / 3 | no |
| 2022-men | lake-erie | Tom Akinola | 0 / 1 | 0 / 1 | no |
| 2022-men | le-moyne | Tom Henne | 0 / 1 | 0 / 1 | yes |
| 2022-men | lincoln-memorial | Arkin Ulusoy | 0 / 1 | 0 / 1 | yes |
| 2022-men | lincoln-memorial | Harry Cooke | 1 / 4 | 1 / 5 | yes |
| 2022-men | lubbock-christian | Pablo Galietero Diez | 1 / 2 | 2 / 3 | no |
| 2022-men | mercyhurst | Sean Kerrigan | 5 / 7 | 5 / 7 | yes |
| 2022-men | millersville | Jake Altimore | 0 / 1 | 0 / 1 | yes |
| 2022-men | millersville | Spencer Shortt | 0 / 0 | 0 / 1 | yes |
| 2022-men | mississippi-college | Zach Diallo | 1 / 2 | 1 / 2 | no |
| 2022-men | missouri-st-louis | Leo Sowa | 0 / 2 | 1 / 3 | yes |
| 2022-men | molloy | Jonas Jacobsen | 1 / 2 | 1 / 2 | yes |
| 2022-men | newman | Felix Tellez Ramirez | 0 / 1 | 0 / 1 | no |
| 2022-men | newman | Matthew Roberts | 0 / 1 | 0 / 1 | no |
| 2022-men | northeastern-state | Flynn Semmerling | 2 / 3 | 2 / 3 | no |
| 2022-men | northeastern-state | Giani Mascarel | 0 / 1 | 0 / 1 | no |
| 2022-men | northeastern-state | Ryan McCully | 0 / 1 | 0 / 1 | no |
| 2022-men | northwood | Lucas Hart | 1 / 2 | 1 / 2 | no |
| 2022-men | oklahoma-christian | Joep Claassen | 5 / 6 | 5 / 6 | no |
| 2022-men | ouachita-baptist | Bobby Boone | 0 / 2 | 0 / 4 | no |
| 2022-men | rockhurst | Kaden Cripe | 1 / 2 | 1 / 2 | no |
| 2022-men | rogers-state | Luke Morgan | 0 / 1 | 0 / 1 | no |
| 2022-men | rogers-state | Marcos Vasallo | 0 / 0 | 0 / 1 | no |
| 2022-men | saint-anselm | Jackson Bukunt | 0 / 0 | 0 / 2 | yes |
| 2022-men | saint-anselm | Kyle White | 0 / 1 | 0 / 1 | yes |
| 2022-men | saint-anselm | Taylor Silverstein | 1 / 2 | 1 / 2 | yes |
| 2022-men | seton-hill | Benjamin Nicholson | 0 / 0 | 0 / 1 | yes |
| 2022-men | seton-hill | Nevlyn Harper | 0 / 0 | 0 / 1 | yes |
| 2022-men | shippensburg | Ashton Davies | 0 / 2 | 0 / 2 | yes |
| 2022-men | southern-connecticut | Zico Groenveld | 0 / 1 | 0 / 1 | yes |
| 2022-men | spring-hill | Johannes Hanken Tjostheim | 1 / 2 | 1 / 2 | no |
| 2022-men | st-thomas-aquinas | Anthony Sanchez | 0 / 0 | 0 / 1 | yes |
| 2022-men | st-thomas-aquinas | Jorge Umana | 1 / 2 | 1 / 2 | yes |
| 2022-men | staten-island | Daniel Angulo | 0 / 1 | 1 / 2 | yes |
| 2022-men | tusculum | Gui Busato | 0 / 1 | 0 / 1 | yes |
| 2022-men | tusculum | Ignacio Alconchel | 0 / 1 | 0 / 1 | yes |
| 2022-men | upper-iowa | Yannis Sapim | 0 / 1 | 0 / 1 | yes |
| 2022-men | west-alabama | Harry Colville | 0 / 1 | 0 / 1 | yes |
| 2022-men | west-chester | Andrew Markopoulos | 1 / 2 | 1 / 2 | yes |
| 2023-men | adelphi | Alessio Consoli | 1 / 2 | 1 / 2 | yes |
| 2023-men | adelphi | Jesper Mikkelsen | 0 / 1 | 0 / 1 | yes |
| 2023-men | adelphi | Pablo Herrera | 0 / 1 | 0 / 1 | yes |
| 2023-men | adelphi | Victor Castel | 0 / 1 | 0 / 1 | yes |
| 2023-men | anderson | Julian Caro | 0 / 2 | 0 / 2 | no |
| 2023-men | assumption | Johannes Sundgot | 1 / 2 | 1 / 2 | yes |
| 2023-men | bloomsburg | Alex Wilsterman | 0 / 1 | 1 / 3 | yes |
| 2023-men | bloomsburg | Anthony Schlee | 0 / 1 | 0 / 3 | yes |
| 2023-men | bridgeport | Lucas Sousa | 1 / 1 | 1 / 2 | yes |
| 2023-men | chestnut-hill | Juan Ortiz | 0 / 1 | 0 / 2 | yes |
| 2023-men | coker | Jacques Fokam Sandeu | 1 / 1 | 2 / 3 | yes |
| 2023-men | coker | Matty Tricker | 0 / 1 | 0 / 1 | yes |
| 2023-men | concord | Tomas Kelly | 0 / 2 | 0 / 3 | yes |
| 2023-men | district-of-columbia | Axel Gamez | 2 / 4 | 2 / 4 | yes |
| 2023-men | district-of-columbia | Ignacio Pericet | 0 / 1 | 0 / 2 | yes |
| 2023-men | e-stroudsburg | Juan Conde | 0 / 0 | 0 / 1 | yes |
| 2023-men | e-stroudsburg | Trevor Paone | 0 / 1 | 0 / 1 | yes |
| 2023-men | emory-henry | Josiah Garrett | 0 / 1 | 0 / 1 | yes |
| 2023-men | felician | Alex Ramos | 1 / 2 | 1 / 2 | yes |
| 2023-men | felician | Alvaro Martin Castedo | 0 / 1 | 0 / 2 | no |
| 2023-men | fort-hays-state | Blake Arndt | 0 / 3 | 0 / 3 | no |
| 2023-men | goldey-beacom | Eduardo Coimbra | 0 / 1 | 0 / 1 | yes |
| 2023-men | harding | Jonah Pastiroff | 0 / 1 | 0 / 1 | no |
| 2023-men | harding | Stefano Silva | 0 / 1 | 0 / 1 | no |
| 2023-men | holy-family | Ever Maradiaga | 0 / 0 | 0 / 1 | yes |
| 2023-men | holy-family | Tajhay Williams | 0 / 0 | 0 / 1 | yes |
| 2023-men | lincoln-memorial | Daniel Burko | 2 / 6 | 2 / 6 | yes |
| 2023-men | lock-haven | Tom Pombor | 0 / 1 | 0 / 1 | yes |
| 2023-men | mars-hill | Jorge Perez Prada | 0 / 1 | 1 / 2 | yes |
| 2023-men | midwestern-state | Mere Escobar | 3 / 4 | 4 / 5 | no |
| 2023-men | millersville | Jake Altimore | 0 / 1 | 1 / 2 | yes |
| 2023-men | missouri-s-t | Sigurd Semlitsch | 0 / 0 | 0 / 1 | no |
| 2023-men | missouri-st-louis | Gus Mantia | 0 / 1 | 0 / 1 | yes |
| 2023-men | new-haven | Adam Lindstrom | 0 / 1 | 0 / 1 | yes |
| 2023-men | newman | Carlos Bellosta Manchon | 2 / 3 | 2 / 3 | no |
| 2023-men | newman | Felix Tellez Ramirez | 0 / 1 | 0 / 1 | no |
| 2023-men | queens | Adolfo Martinez Paquet | 1 / 3 | 1 / 3 | no |
| 2023-men | rogers-state | Luke Morgan | 0 / 1 | 0 / 1 | no |
| 2023-men | saint-anselm | Samuel Assantha | 0 / 0 | 0 / 1 | yes |
| 2023-men | saint-marys | Jose Rivera | 0 / 0 | 0 / 1 | no |
| 2023-men | saint-michael-s | Amos Schramm | 0 / 0 | 0 / 1 | yes |
| 2023-men | shippensburg | Victor Vottero | 0 / 1 | 0 / 1 | yes |
| 2023-men | slippery-rock | Arturo Pla Hernandis | 1 / 2 | 1 / 2 | yes |
| 2023-men | southern-nazarene | Bruno Ferreira | 0 / 1 | 1 / 2 | no |
| 2023-men | southern-nazarene | Cesar Solis | 0 / 1 | 0 / 1 | no |
| 2023-men | southern-new-hampshire | Philipp Herrmann | 1 / 2 | 1 / 2 | yes |
| 2023-men | st-thomas-aquinas | Kevon Evans | 0 / 1 | 0 / 2 | yes |
| 2023-men | thomas-more | Ali Kazim Nakhid | 0 / 1 | 1 / 2 | yes |
| 2023-men | tusculum | Carlos Perez | 0 / 1 | 0 / 1 | yes |
| 2023-men | tusculum | Mo Bouta | 0 / 1 | 0 / 2 | yes |
| 2023-men | west-chester | Andrew Markopoulos | 2 / 3 | 3 / 4 | yes |
| 2023-men | west-chester | Josh Daniels | 0 / 0 | 0 / 1 | yes |
| 2023-men | west-florida | Jaime Guillén | 0 / 0 | 0 / 1 | no |
| 2023-men | west-liberty | Mark Donnelly | 1 / 2 | 1 / 2 | yes |
| 2023-men | wingate | Pablo Pozos | 3 / 4 | 3 / 4 | yes |
| 2023-men | wingate | Pedro Santos | 0 / 0 | 0 / 1 | yes |
| 2024-men | american-international | Leo Consoloni | 0 / 1 | 0 / 1 | yes |
| 2024-men | bloomfield | Christian Jhon Cruz | 2 / 3 | 2 / 3 | yes |
| 2024-men | bloomsburg | Logan Savage | 0 / 1 | 0 / 1 | yes |
| 2024-men | bloomsburg | Owen Hollobaugh | 0 / 0 | 0 / 1 | yes |
| 2024-men | bloomsburg | Teagan Wallace | 0 / 1 | 0 / 2 | yes |
| 2024-men | bridgeport | Lucas Sousa | 0 / 1 | 0 / 1 | yes |
| 2024-men | carson-newman | Mitchell Honcoop | 0 / 2 | 0 / 2 | yes |
| 2024-men | carson-newman | Tim Haans | 0 / 0 | 0 / 1 | yes |
| 2024-men | catawba | Sebastia Cerda-Tous | 0 / 1 | 0 / 1 | no |
| 2024-men | chowan | Junior Smith | 2 / 3 | 2 / 3 | no |
| 2024-men | coker | Matty Tricker | 1 / 1 | 2 / 3 | yes |
| 2024-men | colorado-school-of-mines | Gabriel Rodriguez | 0 / 1 | 0 / 1 | no |
| 2024-men | concord | Syrus Conolly | 0 / 2 | 0 / 2 | yes |
| 2024-men | davis-elkins | Shemar Daley | 0 / 0 | 0 / 1 | yes |
| 2024-men | district-of-columbia | Axel Gamez | 0 / 1 | 2 / 3 | yes |
| 2024-men | district-of-columbia | George Shaw | 0 / 0 | 0 / 1 | yes |
| 2024-men | district-of-columbia | Ignacio Lopez | 0 / 2 | 0 / 3 | yes |
| 2024-men | district-of-columbia | Isaiah Daniel | 0 / 1 | 0 / 1 | yes |
| 2024-men | district-of-columbia | Vasco Irazola | 0 / 1 | 0 / 1 | yes |
| 2024-men | dominican | Armando Morales | 0 / 1 | 0 / 1 | yes |
| 2024-men | dominican | Henrique Zachello | 1 / 2 | 1 / 3 | yes |
| 2024-men | e-stroudsburg | Cayetano Diaz | 0 / 1 | 0 / 1 | yes |
| 2024-men | e-stroudsburg | Ignasi Cucurella Tuset | 0 / 2 | 0 / 3 | no |
| 2024-men | fort-hays-state | Chris Rios-Cruz | 0 / 1 | 0 / 1 | no |
| 2024-men | fresno-pacific | Lucas Ribeiro | 4 / 5 | 4 / 5 | no |
| 2024-men | frostburg-state | Carlos Quintero Rivas | 0 / 1 | 0 / 1 | yes |
| 2024-men | goldey-beacom | Eduardo Gonzalez | 0 / 0 | 0 / 1 | no |
| 2024-men | harding | Matthew Sanchez | 0 / 1 | 0 / 1 | no |
| 2024-men | hawaii-hilo | Colby Lee | 0 / 1 | 0 / 1 | no |
| 2024-men | kentucky-wesleyan | Calum Newson | 0 / 1 | 0 / 1 | yes |
| 2024-men | lincoln-memorial | Botond Skulka | 0 / 1 | 1 / 2 | yes |
| 2024-men | lock-haven | Carter Rosno | 0 / 0 | 0 / 1 | yes |
| 2024-men | mars-hill | Adrian Faus | 0 / 1 | 0 / 1 | yes |
| 2024-men | mars-hill | Nicholas Graves | 0 / 1 | 0 / 1 | yes |
| 2024-men | mars-hill | Peter Plougmand | 0 / 2 | 0 / 2 | yes |
| 2024-men | millersville | Roy Parkyn | 0 / 1 | 0 / 1 | no |
| 2024-men | mississippi-college | Sergio Garrido | 2 / 3 | 3 / 4 | no |
| 2024-men | missouri-st-louis | JT Goldstein | 0 / 0 | 0 / 1 | yes |
| 2024-men | missouri-st-louis | Jon Campbell | 3 / 4 | 3 / 4 | yes |
| 2024-men | molloy | Sean Salgueiro | 1 / 2 | 1 / 2 | yes |
| 2024-men | mount-olive | Babacar Fall | 0 / 1 | 0 / 1 | yes |
| 2024-men | newman | Alberto Romano | 1 / 5 | 1 / 5 | no |
| 2024-men | newman | Gustavo Dias Juliani | 0 / 1 | 0 / 1 | no |
| 2024-men | northeastern-state | Ivan Lopez | 0 / 2 | 0 / 2 | no |
| 2024-men | nova-southeastern | Alessandro Salvadego | 0 / 1 | 0 / 1 | yes |
| 2024-men | ouachita-baptist | Alexis Murillo | 0 / 1 | 0 / 1 | no |
| 2024-men | ouachita-baptist | João Gonçalves | 0 / 1 | 0 / 1 | no |
| 2024-men | point-park | Cheroky Briard | 0 / 1 | 1 / 2 | yes |
| 2024-men | post | Luca Dettoli | 1 / 1 | 1 / 2 | yes |
| 2024-men | post | Luis Rodrigues | 0 / 1 | 0 / 1 | yes |
| 2024-men | queens | Harry Cooke | 0 / 1 | 0 / 1 | yes |
| 2024-men | roberts-wesleyan | Tamas Nagy | 3 / 4 | 3 / 4 | yes |
| 2024-men | rogers-state | Erik Hjertsson | 1 / 2 | 1 / 2 | no |
| 2024-men | rogers-state | Marcos Vasallo | 1 / 4 | 1 / 4 | no |
| 2024-men | rogers-state | Trindon Turner | 0 / 1 | 0 / 1 | no |
| 2024-men | shippensburg | Victor Vottero | 0 / 2 | 0 / 2 | yes |
| 2024-men | southern-nazarene | Axel Agurcia | 1 / 2 | 1 / 2 | no |
| 2024-men | southern-nazarene | Cesar Solis | 0 / 1 | 0 / 1 | no |
| 2024-men | southern-nazarene | Nemanja Djurisic | 0 / 0 | 0 / 1 | no |
| 2024-men | st-thomas-aquinas | Kevon Evans | 0 / 2 | 1 / 3 | yes |
| 2024-men | staten-island | Daniel Sokira | 0 / 0 | 0 / 1 | yes |
| 2024-men | tusculum | Clarenns Sainrimat | 0 / 1 | 0 / 1 | yes |
| 2024-men | tusculum | Lars Schutrups | 0 / 0 | 0 / 1 | yes |
| 2024-men | tusculum | Mo Bouta | 0 / 0 | 0 / 1 | yes |
| 2024-men | uccs | Miles Seminario | 1 / 2 | 2 / 3 | no |
| 2024-men | uccs | Nick Walker | 2 / 3 | 2 / 3 | no |
| 2024-men | union | Kenny Nitzsche | 2 / 3 | 3 / 4 | no |
| 2024-men | upper-iowa | Thomas Walle | 0 / 1 | 0 / 1 | yes |
| 2024-men | west-florida | Jaime Guillén | 0 / 0 | 0 / 1 | no |
| 2024-men | western-oregon | Yahir Ocampo Navarro | 4 / 5 | 4 / 5 | no |
| 2024-men | wheeling | Josh Timbrell | 1 / 1 | 1 / 2 | yes |
| 2024-men | wilmington | Theo Faillon | 2 / 8 | 4 / 10 | yes |
| 2024-men | wingate | Pablo Pozos | 3 / 3 | 4 / 5 | yes |
| 2025-men | adelphi | Matthew Murphy | 0 / 0 | 0 / 1 | yes |
| 2025-men | adelphi | Ryan Holt | 0 / 2 | 0 / 2 | yes |
| 2025-men | bloomsburg | Sam Blumberger | 0 / 1 | 0 / 1 | yes |
| 2025-men | cal-state-la | Alex Mendez | 2 / 2 | 2 / 3 | no |
| 2025-men | carson-newman | Mitchell Honcoop | 1 / 3 | 1 / 3 | yes |
| 2025-men | cedarville | Yonis Velasquez-Quezada | 0 / 2 | 0 / 2 | no |
| 2025-men | chestnut-hill | Andres Gomez | 0 / 1 | 0 / 2 | yes |
| 2025-men | chowan | Cameron Letterlough | 5 / 7 | 5 / 7 | yes |
| 2025-men | chowan | Robbie Deighan | 2 / 3 | 2 / 3 | yes |
| 2025-men | coker | Christian Johnson | 1 / 2 | 1 / 3 | yes |
| 2025-men | concord | Dominique Malhomme | 0 / 2 | 0 / 2 | yes |
| 2025-men | concord | Julian Correa | 0 / 1 | 0 / 1 | yes |
| 2025-men | concord | Malher Santi Possu | 0 / 3 | 0 / 3 | yes |
| 2025-men | concord | Raheem Baptiste | 0 / 0 | 0 / 1 | yes |
| 2025-men | dallas-baptist | Gavyn Rosales | 0 / 1 | 0 / 1 | no |
| 2025-men | district-of-columbia | Ignacio Lopez | 1 / 2 | 1 / 2 | yes |
| 2025-men | e-stroudsburg | Darryl Longdon | 0 / 1 | 0 / 1 | yes |
| 2025-men | e-stroudsburg | Hunter Stites | 0 / 0 | 0 / 1 | yes |
| 2025-men | e-stroudsburg | Nathan Bradway | 0 / 0 | 0 / 1 | yes |
| 2025-men | e-stroudsburg | Owen Rennie | 0 / 1 | 0 / 2 | yes |
| 2025-men | emory-henry | Noah Serwy | 0 / 1 | 0 / 1 | yes |
| 2025-men | felician | Bartu Yakkan | 0 / 1 | 0 / 1 | yes |
| 2025-men | frostburg-state | Carlos Quintero Rivas | 0 / 1 | 1 / 2 | yes |
| 2025-men | goldey-beacom | Emanuel Bustos | 0 / 1 | 0 / 1 | yes |
| 2025-men | goldey-beacom | Tiwalade Ogunfadebo | 0 / 1 | 0 / 1 | yes |
| 2025-men | hawaii-pacific | Kelly Takara | 2 / 2 | 2 / 3 | no |
| 2025-men | holy-family | Ned Lewis | 0 / 1 | 0 / 1 | yes |
| 2025-men | lenoir-rhyne | Jonas Moos | 2 / 2 | 2 / 3 | yes |
| 2025-men | lincoln-memorial | Gian-Carlo Kama | 0 / 0 | 0 / 1 | yes |
| 2025-men | lincoln-memorial | Ronan O'Mahony Blondel | 0 / 1 | 0 / 1 | yes |
| 2025-men | lock-haven | Carter Rosno | 0 / 0 | 0 / 1 | yes |
| 2025-men | maryville | Jacob Darwesh Lund Iversen | 0 / 1 | 0 / 1 | no |
| 2025-men | millersville | Roy Parkyn | 1 / 1 | 1 / 2 | yes |
| 2025-men | missouri-st-louis | Alexander Ramirez Aoueiss | 0 / 1 | 0 / 1 | yes |
| 2025-men | missouri-st-louis | Gibson Hunt | 0 / 0 | 0 / 1 | yes |
| 2025-men | missouri-st-louis | Kyler Sorber | 0 / 0 | 0 / 1 | yes |
| 2025-men | rockhurst | Kaden Cripe | 0 / 0 | 0 / 1 | yes |
| 2025-men | saint-leo | Jorge Perez Rosales | 0 / 1 | 0 / 1 | no |
| 2025-men | shepherd | Josh Petty | 1 / 2 | 2 / 3 | yes |
| 2025-men | shippensburg | Cam Henry | 0 / 1 | 0 / 1 | yes |
| 2025-men | st-cloud-state | Mahmood Maldonado | 0 / 1 | 0 / 1 | no |
| 2025-men | st-thomas-aquinas | Jorge De La Vibora | 0 / 0 | 0 / 1 | yes |
| 2025-men | st-thomas-aquinas | Kevon Evans | 0 / 1 | 0 / 1 | yes |
| 2025-men | wilmington | Theo Faillon | 2 / 6 | 2 / 6 | yes |
| 2026-men | adelphi | Agustin Soldo | 0 / 1 | 0 / 1 | yes |
| 2026-men | adelphi | Andre Josaphat | 0 / 1 | 0 / 1 | yes |
| 2026-men | adelphi | Enrico Cesarini Sforza | 0 / 0 | 0 / 1 | yes |
| 2026-men | anderson | Adrian Castillo | 0 / 0 | 0 / 1 | no |
| 2026-men | aum | Benjamin Hoffmann | 0 / 0 | 0 / 1 | no |
| 2026-men | bloomsburg | Dylan Kopenits | 0 / 0 | 0 / 1 | yes |
| 2026-men | bloomsburg | Nick Guzak | 0 / 0 | 0 / 1 | yes |
| 2026-men | bloomsburg | Owen Hollobaugh | 0 / 0 | 0 / 1 | yes |
| 2026-men | carson-newman | Dan Coles | 0 / 1 | 0 / 1 | yes |
| 2026-men | carson-newman | Mitchell Honcoop | 1 / 3 | 1 / 3 | yes |
| 2026-men | chestnut-hill | Abdoulaye Kamagate | 0 / 0 | 0 / 1 | yes |
| 2026-men | chestnut-hill | Kervening Thelistin | 0 / 1 | 0 / 1 | yes |
| 2026-men | coker | Alexis Abalam | 1 / 2 | 1 / 2 | yes |
| 2026-men | coker | Alvaro Bonet | 0 / 1 | 0 / 1 | yes |
| 2026-men | concord | Dominique Malhomme | 0 / 0 | 0 / 1 | yes |
| 2026-men | concord | Lucas Costa | 0 / 1 | 0 / 1 | yes |
| 2026-men | district-of-columbia | Christopher Ruiz | 0 / 1 | 0 / 1 | yes |
| 2026-men | district-of-columbia | Cody Williams | 0 / 1 | 0 / 1 | yes |
| 2026-men | district-of-columbia | Isaiah Daniel | 1 / 2 | 1 / 2 | yes |
| 2026-men | district-of-columbia | Joao De Souza De Aquino | 0 / 1 | 0 / 1 | yes |
| 2026-men | district-of-columbia | Marius Elmose | 0 / 0 | 0 / 1 | yes |
| 2026-men | dominican | Bigad Sid | 0 / 0 | 0 / 1 | yes |
| 2026-men | dominican | Nuhan Berete | 0 / 1 | 0 / 1 | yes |
| 2026-men | e-stroudsburg | Bat-Od Buman-Uchral | 0 / 1 | 0 / 1 | yes |
| 2026-men | e-stroudsburg | Owen Rennie | 0 / 2 | 0 / 2 | yes |
| 2026-men | erskine | Peyton Williams | 1 / 2 | 1 / 3 | no |
| 2026-men | felician | Bartu Yakkan | 0 / 1 | 0 / 1 | yes |
| 2026-men | felician | Ernest Llaras | 0 / 0 | 0 / 1 | no |
| 2026-men | felician | Vittorio Bellesi | 0 / 0 | 0 / 1 | yes |
| 2026-men | franklin-pierce | Guillermo Rios | 1 / 2 | 1 / 2 | yes |
| 2026-men | franklin-pierce | Patrick Brisa | 0 / 0 | 0 / 1 | no |
| 2026-men | georgian-court | Gijs van Eif | 3 / 4 | 5 / 6 | yes |
| 2026-men | goldey-beacom | Derrick Muhire | 0 / 1 | 0 / 1 | yes |
| 2026-men | goldey-beacom | Sam Ball | 0 / 1 | 0 / 1 | no |
| 2026-men | goldey-beacom | Yuma Reichert | 0 / 1 | 0 / 1 | yes |
| 2026-men | holy-family | Luiz Recchimuzzi | 1 / 2 | 1 / 2 | yes |
| 2026-men | jefferson | Jude Clymer | 0 / 0 | 0 / 1 | yes |
| 2026-men | lee | Matias Milla Munoz | 1 / 2 | 1 / 2 | no |
| 2026-men | lenoir-rhyne | Hector Taboada | 0 / 1 | 0 / 1 | yes |
| 2026-men | lincoln-memorial | Enrique Martin | 0 / 1 | 0 / 1 | yes |
| 2026-men | mars-hill | Gabriel Cavalcanti | 0 / 1 | 0 / 1 | yes |
| 2026-men | mars-hill | Kieran Edworthy | 0 / 1 | 0 / 1 | yes |
| 2026-men | mercy | John Hollis | 0 / 0 | 0 / 1 | yes |
| 2026-men | millersville | Roy Parkyn | 2 / 4 | 2 / 4 | yes |
| 2026-men | missouri-st-louis | Brady Freeman | 0 / 0 | 0 / 1 | yes |
| 2026-men | missouri-st-louis | Mario Garcia | 2 / 3 | 2 / 3 | yes |
| 2026-men | molloy | Charlie Morgan | 0 / 0 | 0 / 1 | yes |
| 2026-men | north-greenville | Jesse Zborovsky | 0 / 1 | 0 / 1 | no |
| 2026-men | point-loma | Simon Sagal | 1 / 2 | 1 / 2 | no |
| 2026-men | queens | Tommy Wagner | 0 / 1 | 1 / 2 | yes |
| 2026-men | saint-anselm | Brian Jones | 2 / 3 | 2 / 3 | yes |
| 2026-men | saint-michael-s | Bennett Yeboah | 0 / 1 | 0 / 1 | yes |
| 2026-men | shepherd | Mac Long | 0 / 1 | 0 / 1 | yes |
| 2026-men | shippensburg | Maddox Davies | 0 / 1 | 0 / 1 | yes |
| 2026-men | southern-new-hampshire | Inigo Burusco | 4 / 5 | 4 / 6 | yes |
| 2026-men | staten-island | Peterson Larose | 0 / 1 | 0 / 1 | yes |
| 2026-men | tiffin | Andre Robison | 0 / 1 | 0 / 1 | no |
| 2026-men | truman | Jacob Panagos | 4 / 5 | 5 / 6 | yes |
| 2026-men | tusculum | Zeljko Stanojevic | 0 / 0 | 0 / 1 | yes |
| 2026-men | west-liberty | Jasper Newton | 0 / 1 | 0 / 1 | yes |
| 2026-men | wheeling | Jon-Michael Gordon | 0 / 2 | 0 / 2 | no |
| 2026-men | wilmington | Matthew Yi | 1 / 2 | 1 / 2 | yes |
| 2022-women | adelphi | Madison Apicella | 0 / 0 | 0 / 1 | yes |
| 2022-women | adelphi | Morgan Salmon | 0 / 1 | 0 / 1 | yes |
| 2022-women | anderson | Carly Keuffer | 0 / 1 | 0 / 1 | no |
| 2022-women | anderson | Claudia WATSON | 0 / 0 | 0 / 1 | no |
| 2022-women | bloomsburg | Lorelei Hartzfeld | 0 / 1 | 0 / 1 | yes |
| 2022-women | bloomsburg | Molly Groff | 0 / 1 | 0 / 1 | yes |
| 2022-women | carson-newman | Addie Henry | 0 / 1 | 0 / 2 | yes |
| 2022-women | carson-newman | Felicia Frick | 0 / 2 | 0 / 2 | yes |
| 2022-women | chestnut-hill | Lauren Sullivan | 1 / 2 | 1 / 2 | yes |
| 2022-women | concord | Michelle Brogden | 0 / 1 | 0 / 1 | yes |
| 2022-women | dominican | Danielle Zacher | 0 / 1 | 0 / 1 | yes |
| 2022-women | dominican | Isabella Wysocki | 0 / 1 | 1 / 3 | yes |
| 2022-women | dominican | Mathilde Skovbakke | 0 / 1 | 0 / 1 | yes |
| 2022-women | e-stroudsburg | Rebecca Kotula | 0 / 2 | 0 / 2 | yes |
| 2022-women | fairmont-state | Alejandra Puerto | 0 / 0 | 0 / 1 | no |
| 2022-women | florida-tech | May Queiroz | 0 / 1 | 0 / 2 | no |
| 2022-women | georgian-court | Aliya Canfield | 1 / 1 | 1 / 2 | yes |
| 2022-women | goldey-beacom | Alex Lowry | 0 / 1 | 0 / 1 | yes |
| 2022-women | goldey-beacom | Alyssa Ruggeri | 0 / 0 | 0 / 1 | no |
| 2022-women | holy-family | Jacqueline Ziegler | 0 / 0 | 0 / 1 | yes |
| 2022-women | jefferson | Kiery Spatz | 2 / 3 | 2 / 3 | yes |
| 2022-women | jefferson | Nikki Dedes | 1 / 2 | 1 / 2 | yes |
| 2022-women | kutztown | Kayla Argen | 0 / 3 | 0 / 3 | yes |
| 2022-women | lees-mcrae | Hannah Davies | 0 / 0 | 0 / 1 | yes |
| 2022-women | mercy | Nikki Bermudez | 0 / 1 | 0 / 1 | yes |
| 2022-women | molloy | Alessandra Borsellino | 0 / 1 | 0 / 1 | no |
| 2022-women | mount-olive | Delia Allwood | 0 / 1 | 0 / 1 | yes |
| 2022-women | post | Fitore Kllobocishta | 0 / 0 | 0 / 1 | yes |
| 2022-women | st-thomas-aquinas | Sarai Rodriguez | 0 / 1 | 0 / 1 | yes |
| 2022-women | tusculum | Rosy Wodhams | 0 / 1 | 0 / 1 | yes |
| 2022-women | usc-beaufort | Eva Kristjansdottir | 0 / 1 | 0 / 1 | yes |
| 2022-women | usc-beaufort | Julia Gherardi | 0 / 1 | 0 / 2 | yes |
| 2022-women | usc-beaufort | Mari Kalvatn | 0 / 2 | 0 / 4 | yes |
| 2022-women | west-chester | Alyson Cutter | 0 / 1 | 1 / 2 | yes |
| 2022-women | west-virginia-state | Fran Soares-Cupertino | 0 / 1 | 1 / 2 | yes |
| 2022-women | wilmington | Samantha Emmi | 0 / 0 | 0 / 1 | yes |
| 2022-women | wingate | Chandler Hendrix | 0 / 0 | 0 / 1 | yes |
| 2022-women | wingate | Sascha Larsen | 1 / 2 | 1 / 2 | yes |
| 2023-women | adelphi | Madison Apicella | 0 / 1 | 0 / 1 | yes |
| 2023-women | adelphi | Morgan Salmon | 0 / 1 | 0 / 2 | yes |
| 2023-women | anderson | Carly Keuffer | 0 / 0 | 0 / 1 | yes |
| 2023-women | bloomsburg | Alivia Gallardo | 0 / 1 | 0 / 1 | yes |
| 2023-women | caldwell | Sarah Costanza | 4 / 5 | 4 / 5 | yes |
| 2023-women | carson-newman | Felicia Frick | 0 / 3 | 0 / 3 | yes |
| 2023-women | charleston | Carina Widauer | 0 / 0 | 0 / 1 | no |
| 2023-women | chestnut-hill | Lauren Sullivan | 0 / 1 | 0 / 1 | yes |
| 2023-women | coker | Kylee Ryan | 0 / 0 | 0 / 1 | yes |
| 2023-women | concord | Alexa Todd | 0 / 1 | 0 / 1 | yes |
| 2023-women | daemen | Alyssa Diaz | 0 / 0 | 0 / 1 | yes |
| 2023-women | davis-elkins | Alexa Karsel | 0 / 0 | 0 / 1 | yes |
| 2023-women | e-stroudsburg | Natalie Schooley | 0 / 2 | 0 / 2 | yes |
| 2023-women | emory-henry | Sophie Graham | 0 / 0 | 0 / 1 | yes |
| 2023-women | holy-family | Izzy Mignon | 1 / 2 | 1 / 2 | yes |
| 2023-women | iup | Hannah Scardina | 0 / 1 | 0 / 1 | yes |
| 2023-women | jefferson | Devin Sullivan | 0 / 0 | 0 / 1 | yes |
| 2023-women | jefferson | Kiery Spatz | 0 / 1 | 0 / 1 | yes |
| 2023-women | jefferson | Nikki Dedes | 1 / 2 | 1 / 2 | yes |
| 2023-women | kutztown | Katelyn Economopoulos | 0 / 1 | 0 / 1 | yes |
| 2023-women | lincoln-memorial | Carla Wilson | 0 / 1 | 0 / 1 | yes |
| 2023-women | newberry | Jaidyn Jacobs | 0 / 1 | 0 / 1 | yes |
| 2023-women | tampa | Sofia Karlholm | 0 / 0 | 0 / 1 | yes |
| 2023-women | tusculum | Joey Garrett | 0 / 1 | 0 / 1 | yes |
| 2023-women | usc-beaufort | Eva Kristjansdottir | 0 / 1 | 0 / 1 | yes |
| 2023-women | washburn | Aubrey Tanksley | 0 / 0 | 0 / 1 | no |
| 2023-women | west-liberty | Amelia Compston | 2 / 3 | 2 / 3 | yes |
| 2023-women | west-virginia-state | Esther Dhiramo | 2 / 2 | 3 / 4 | yes |
| 2023-women | wilmington | Manuela Restrepo | 2 / 3 | 2 / 3 | yes |
| 2024-women | american-international | Rachel Newman | 0 / 1 | 0 / 1 | yes |
| 2024-women | bemidji-state | Maria Stocke | 0 / 1 | 0 / 1 | no |
| 2024-women | carson-newman | Felicia Frick | 1 / 2 | 1 / 2 | yes |
| 2024-women | chestnut-hill | Abby Galazka | 0 / 1 | 0 / 1 | yes |
| 2024-women | coker | Maia Clark | 0 / 3 | 0 / 3 | yes |
| 2024-women | coker | Mallie Bates | 0 / 1 | 0 / 1 | yes |
| 2024-women | concord | Marika Svensson | 0 / 1 | 0 / 1 | yes |
| 2024-women | dominican | Isabella Wysocki | 0 / 3 | 0 / 3 | yes |
| 2024-women | dominican | Kaitlyn Zeeb | 0 / 1 | 0 / 1 | yes |
| 2024-women | dominican | Sabine Sorensen | 0 / 1 | 0 / 2 | yes |
| 2024-women | e-stroudsburg | Natalie Schooley | 0 / 1 | 0 / 1 | yes |
| 2024-women | e-stroudsburg | Sophia Lowery | 0 / 1 | 0 / 1 | yes |
| 2024-women | georgian-court | Chelsea Lavezzo | 1 / 2 | 1 / 2 | yes |
| 2024-women | georgian-court | Sophia Ridolfo | 0 / 1 | 0 / 1 | yes |
| 2024-women | jessup | Kaylee Gillespie | 0 / 0 | 0 / 1 | no |
| 2024-women | lenoir-rhyne | Tea Sabin | 0 / 1 | 0 / 1 | yes |
| 2024-women | lincoln-memorial | Samantha Hulstaert | 0 / 1 | 0 / 1 | yes |
| 2024-women | mckendree | Reagan Mauch | 0 / 1 | 0 / 2 | no |
| 2024-women | newberry | Emily Castaneda | 0 / 0 | 0 / 1 | yes |
| 2024-women | pitt-johnstown | Haley Neidig | 0 / 0 | 0 / 1 | yes |
| 2024-women | regis | Natalie Bunch | 0 / 1 | 0 / 1 | no |
| 2024-women | saint-anselm | Josie Pecor | 0 / 0 | 0 / 1 | yes |
| 2024-women | saint-anselm | Riley DiGilio | 0 / 1 | 0 / 1 | yes |
| 2024-women | saint-michael-s | Faith Kosiba | 0 / 1 | 0 / 1 | yes |
| 2024-women | st-thomas-aquinas | Sarai Rodriguez | 0 / 1 | 0 / 1 | yes |
| 2024-women | west-chester | Faith Matter | 0 / 1 | 0 / 1 | yes |
| 2024-women | wilmington | Alyssa Ruggeri | 0 / 2 | 0 / 2 | yes |
| 2024-women | wilmington | Brianna Wons | 1 / 2 | 2 / 3 | yes |
| 2024-women | wingate | Sascha Larsen | 1 / 2 | 2 / 4 | yes |
| 2025-women | adelphi | Kayleigh Goodrich | 0 / 1 | 0 / 1 | yes |
| 2025-women | caldwell | Melissa Pires | 0 / 1 | 0 / 1 | yes |
| 2025-women | carson-newman | Felicia Frick | 0 / 4 | 0 / 4 | yes |
| 2025-women | chestnut-hill | Abby Collins | 0 / 1 | 0 / 1 | yes |
| 2025-women | chestnut-hill | Chelsea Ritter | 0 / 1 | 0 / 1 | yes |
| 2025-women | chestnut-hill | Lauren Sullivan | 0 / 0 | 1 / 2 | yes |
| 2025-women | concord | Ailsa Swinburne | 0 / 1 | 0 / 1 | yes |
| 2025-women | concord | Tiana Campbell | 0 / 2 | 0 / 3 | yes |
| 2025-women | dominican | Emily Rath | 1 / 2 | 1 / 2 | yes |
| 2025-women | dominican | Jessie Maraia | 0 / 1 | 0 / 1 | yes |
| 2025-women | emory-henry | Anjelika DeJesus | 0 / 1 | 0 / 1 | no |
| 2025-women | emory-henry | Charlotte Stavis | 0 / 1 | 0 / 1 | no |
| 2025-women | gannon | Olivia Dixon | 0 / 1 | 0 / 1 | yes |
| 2025-women | georgian-court | Chelsea Lavezzo | 0 / 0 | 0 / 1 | yes |
| 2025-women | georgian-court | Hailey Funkhouser | 0 / 0 | 0 / 1 | yes |
| 2025-women | goldey-beacom | Tess Pearce | 0 / 0 | 0 / 1 | yes |
| 2025-women | iup | Jordina Rovira | 0 / 1 | 0 / 1 | no |
| 2025-women | jefferson | Nikki Dedes | 0 / 1 | 0 / 1 | yes |
| 2025-women | kutztown | Corinne Morgan | 0 / 1 | 0 / 1 | yes |
| 2025-women | kutztown | Maura Day | 0 / 1 | 0 / 1 | yes |
| 2025-women | lenoir-rhyne | Lucia Hidalgo | 0 / 1 | 1 / 2 | yes |
| 2025-women | lenoir-rhyne | Nicole Auger | 0 / 0 | 0 / 1 | yes |
| 2025-women | lincoln-memorial | Donna van der Zalm | 0 / 1 | 0 / 1 | yes |
| 2025-women | mars-hill | Jenna Matzat | 0 / 1 | 0 / 1 | yes |
| 2025-women | millersville | Peyton Yocum | 0 / 0 | 0 / 1 | yes |
| 2025-women | saint-anselm | Meghan Deneen | 0 / 2 | 0 / 2 | yes |
| 2025-women | seton-hill | Jessica Molitoris | 0 / 0 | 0 / 1 | yes |
| 2025-women | shippensburg | Ryleigh Cook | 0 / 1 | 0 / 1 | yes |
| 2025-women | usc-beaufort | Izzy Amphlett | 0 / 0 | 0 / 1 | no |
| 2025-women | west-chester | Faith Matter | 0 / 0 | 0 / 1 | yes |
| 2026-women | adelphi | Kayleigh Goodrich | 0 / 0 | 0 / 1 | yes |
| 2026-women | bloomsburg | Abby Rock | 0 / 1 | 0 / 1 | yes |
| 2026-women | bloomsburg | Laci Bell | 0 / 1 | 0 / 1 | yes |
| 2026-women | bloomsburg | Meg Mullin | 0 / 1 | 0 / 1 | yes |
| 2026-women | central-washington | Kylee Schreck | 0 / 1 | 0 / 2 | no |
| 2026-women | chowan | Amy Cotton | 0 / 1 | 0 / 1 | yes |
| 2026-women | clayton-state | Jessica Fidhi | 2 / 2 | 2 / 3 | yes |
| 2026-women | dominican | Sophia Stahl | 0 / 2 | 0 / 2 | yes |
| 2026-women | emory-henry | Siena Booth | 1 / 2 | 1 / 2 | no |
| 2026-women | felician | Brooklyn Niemy | 0 / 1 | 0 / 1 | yes |
| 2026-women | georgian-court | Chelsea Lavezzo | 2 / 2 | 2 / 3 | yes |
| 2026-women | glenville-state | Sofia Jalaksova | 1 / 2 | 1 / 2 | yes |
| 2026-women | lenoir-rhyne | Isabella Zicchinolfi | 0 / 1 | 0 / 1 | yes |
| 2026-women | lincoln-memorial | Donna Van Der Zalm | 0 / 1 | 0 / 1 | yes |
| 2026-women | mars-hill | Leah Krugh | 0 / 1 | 0 / 1 | yes |
| 2026-women | millersville | Aubrey Strohecker | 1 / 2 | 1 / 2 | yes |
| 2026-women | saint-anselm | Meghan Deneen | 1 / 2 | 2 / 3 | yes |
| 2026-women | shepherd | Aniyah Parker | 1 / 1 | 1 / 2 | yes |
| 2026-women | shippensburg | Gabrielle Walker | 0 / 1 | 0 / 1 | yes |
| 2026-women | tusculum | Gabby Stone | 0 / 1 | 0 / 1 | yes |
| 2026-women | unc-pembroke | Willow Price | 0 / 1 | 0 / 1 | yes |
| 2026-women | west-chester | Kianna Barber | 0 / 1 | 1 / 2 | yes |
| 2026-women | wilmington | Maria Leguizamon | 0 / 1 | 0 / 1 | yes |
