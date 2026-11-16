# Player tiers: build log

| | |
| --- | --- |
| Built | 2026-11-15 |
| Contract | `docs/specs/player-tiers/ALGORITHM.md`, version 1, for specification draft 0.6 (ed-insights-platform) |
| Data home | `~/keelson/d2-soccer` at **`ea45f891+dirty`** — modified, uncommitted: `data/coverage.json`, `data/fixtures/2026-women-ccaa.json`, `data/fixtures/2026-women-gliac.json`. Read only; the build refuses an `--out` inside it, and `git status` there was the same before and after. |
| Site | `feature/player-tiers`, branched from `e5bf621c6e` |
| Command | `bun run tiers:build` (= `bun run scripts/tiers/build.ts --out tiers/d2`), about 6 s for all ten files |
| Output | `tiers/d2/{2022..2026}-{men,women}.json` (committed). `tiers/.debug/` holds per-player and per-team intermediates (adjG, adjS, threat, estimate, seasons counted, career record; n, GA, EGA, SA, workload, record, score) plus `report.md` and `penalty-gaps.csv`. It is gitignored, and no file under `src/` reads it (a test checks this). |

The level comes from `ncaaDivision` in `src/site.config.ts`. If it is anything other than `d2`, the build writes nothing (section 0).

## Site functions the build uses

**One record per physical match (section 1).** The build uses the resolution the match page uses:
`canonicalFixture(fixture, knownProgrammes(seasons))` from `src/lib/postseason.ts` strips the ranking
prefixes some pages put on an opponent's slug (`21-mckendree`). Then `foldToMatches` over
`allSightings` from `src/lib/division.ts`, grouped by `matchIdentity` from `src/lib/derive.ts`, gives
one record per match. The match page reaches the same fold through `divisionMatchOf` in
`src/lib/kickoff-division.ts`. The standings read one conference file at a time, so they never see
the second copy. The fold's canonical record is the home side's conference record. Exhibitions are
dropped with `isExhibition` (`derive.ts`). The build calls `foldToMatches` once for each identity
group (`foldEach` in `scripts/tiers/matches.ts`) so that one refusal cannot stop the whole season
(see A7).

**Joining a player's lines (section 4).** The site has no function that implements the contract's
join. `foldName` in `src/lib/player.ts`, and the private `lineFor` built on it, use a different fold:
it keeps spaces and digits and strips only some punctuation. So the join is done in `scripts/tiers/players.ts` (`playerSeasons`, a union-find over join keys) using
the contract's fold, `foldKey` in `src/lib/tiers.ts`. Site functions it uses: `playerIdOf`
(`player.ts`) to read a roster entry's page id, `goalScorer` and `playerIndex` (`plays.ts`) to read
whom a penalty play names, `isGoalPlay` (`plays.ts`) to count goals in the play-by-play, `tenureOf`
(`tenure.ts`) to place a class year, and `NameBook` (`names.ts`) to build the site's `Season`. The
files are read with the site's loaders `loadFixtures`, `loadRosters`, `loadStats` and `loadMatches`
from `src/lib/data.ts`, which was not modified.

## Section 11.2: sanity against the research prototype

| Quantity | Expected men | Measured men | Expected women | Measured women | Note |
| --- | --- | --- | --- | --- | --- |
| Programme-seasons with a workload group, all five seasons | 996 | 990 | 1,255 | 1,249 | The data home has only 993 men's programme-seasons in all (1,256 women's), so 996 cannot be reached by any rule on n. The prototype must have seen a different set of programmes. |
| Division shots faced a match / percentage that went in (pooled; the mean of the five seasons gives the same to 0.1) | 12.3 / 12.8% | 12.2 / 12.6% | 12.4 / 11.5% | 12.2 / 11.3% | 0.1 to 0.2 low on both figures, both genders. Not explained: the prototype is out of bounds for this build. |
| Regular defenders a season | about 388 | 394.0 | about 535 | 568.4 | Reading the box-score label first, as the prototype did, gives **385.2 / 542.0**. The roster-first rule of section 3 accounts for nearly all of the women's +6%. |
| Regular goalkeepers a season | about 173 | 167.8 | about 226 | 222.2 | Box-score-first gives 168.0 / 222.6: the position rule is not the cause. |
| Defenders and goalkeepers with two or more seasons counted, a season, 2023 to 2026 | about 188 | 184.0 | about 314 | 327.3 | −2% / +4% |
| Of those, holding the tier | about 38 | 37.5 | about 64 | 66.5 | −1% / +4% |
| Penalty goals as a share of all goals in the play-by-play | 8.1% | 8.1% (2,284 of 28,239) | 5.6% | 5.6% (1,919 of 34,020) | exact |

The regular counts leave out incomplete player-seasons. The 2022 files are excluded from the last
two rows because no 2022 player can have two seasons counted (A41).

## Counts per file

| File | Entries | shooting_scoring: tier / eligible / needs_minutes / incomplete | team_defence: tier / eligible / needs_second_season / needs_minutes / incomplete | No group (incomplete) | Incomplete by reason | Teams light / typical / heavy / no group |
| --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 5615 | 160 / 637 / 2280 / 73 | 0 / 0 / 567 / 1509 / 76 | 313 | few_matches 8, identity 141, no_position 313 | 66 / 66 / 66 / 1 |
| 2023-men | 5600 | 193 / 768 / 2210 / 77 | 43 / 172 / 332 / 1457 / 63 | 285 | few_matches 14, identity 126, no_position 285 | 65 / 65 / 66 / 1 |
| 2024-men | 5672 | 192 / 763 / 2208 / 54 | 39 / 153 / 390 / 1507 / 70 | 296 | few_matches 8, identity 116, no_position 296 | 67 / 66 / 67 / 1 |
| 2025-men | 5780 | 188 / 752 / 2283 / 77 | 35 / 137 / 379 / 1566 / 43 | 320 | identity 120, no_position 320 | 66 / 66 / 66 / 0 |
| 2026-men | 5904 | 184 / 730 / 2428 / 5 | 33 / 124 / 405 / 1719 / 5 | 271 | identity 10, no_position 271 | 66 / 66 / 66 / 0 |
| 2022-women | 6626 | 231 / 919 / 2611 / 58 | 0 / 0 / 789 / 1671 / 61 | 286 | few_matches 14, identity 41, no_minutes 65, no_position 285 | 83 / 83 / 83 / 1 |
| 2023-women | 6735 | 270 / 1077 / 2456 / 35 | 71 / 280 / 425 / 1777 / 51 | 293 | few_matches 19, identity 31, no_minutes 36, no_position 293 | 82 / 81 / 84 / 2 |
| 2024-women | 6845 | 271 / 1082 / 2579 / 33 | 70 / 280 / 451 / 1806 / 15 | 258 | identity 25, no_minutes 23, no_position 258 | 84 / 84 / 84 / 0 |
| 2025-women | 6878 | 272 / 1084 / 2600 / 25 | 64 / 243 / 505 / 1825 / 28 | 232 | few_matches 15, identity 14, no_minutes 26, no_position 230 | 84 / 83 / 84 / 2 |
| 2026-women | 6886 | 271 / 1081 / 2664 / 29 | 61 / 240 / 474 / 1836 / 29 | 201 | few_matches 10, identity 10, no_minutes 38, no_position 201 | 83 / 83 / 84 / 2 |

"No group" counts every entry with `group: null`: all `no_position` entries, plus `no_minutes`
entries at a programme that also gives them no group. In 2022-women and 2025-women, one and two
`no_minutes` players have no group, so that column reads one or two more than `no_position`.

## Tier holders per file

| File | Tier 1 F | Tier 1 M | Tier 2 F | Tier 2 M | Team defence: defenders | Team defence: goalkeepers |
| --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 13 | 28 | 37 | 82 | 0 | 0 |
| 2023-men | 17 | 32 | 48 | 96 | 27 | 16 |
| 2024-men | 17 | 31 | 51 | 93 | 28 | 11 |
| 2025-men | 18 | 30 | 53 | 87 | 23 | 12 |
| 2026-men | 15 | 31 | 45 | 93 | 22 | 11 |
| 2022-women | 23 | 36 | 66 | 106 | 0 | 0 |
| 2023-women | 27 | 41 | 79 | 123 | 51 | 20 |
| 2024-women | 28 | 41 | 81 | 121 | 51 | 19 |
| 2025-women | 26 | 42 | 78 | 126 | 40 | 24 |
| 2026-women | 26 | 42 | 78 | 125 | 42 | 19 |

## One record per match, and what the build set aside

| Season | Records | Physical | Exhibitions | Forfeits | Not final | Disputed (kept, canonical score) | Kept | No box score | Box score with no home_index | Refused by the fold (unplayed) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 2413 | 1989 | 54 | 0 | 84 | 0 | 1851 | 31 | 0 | 0 |
| 2023-men | 2449 | 2014 | 52 | 0 | 115 | 0 | 1847 | 25 | 0 | 0 |
| 2024-men | 2513 | 2057 | 58 | 1 | 116 | 0 | 1882 | 38 | 1 | 0 |
| 2025-men | 2481 | 2003 | 46 | 0 | 102 | 0 | 1855 | 21 | 1 | 0 |
| 2026-men | 2489 | 2014 | 65 | 0 | 112 | 1 | 1837 | 15 | 1 | 0 |
| 2022-women | 3080 | 2593 | 68 | 0 | 134 | 0 | 2391 | 27 | 0 | 0 |
| 2023-women | 3090 | 2591 | 71 | 2 | 121 | 0 | 2397 | 33 | 0 | 0 |
| 2024-women | 3156 | 2608 | 68 | 0 | 142 | 0 | 2398 | 15 | 0 | 2024-09-12 flagler v florida-tech |
| 2025-women | 3166 | 2605 | 67 | 0 | 123 | 0 | 2415 | 13 | 0 | 0 |
| 2026-women | 3132 | 2596 | 78 | 4 | 146 | 0 | 2368 | 14 | 0 | 0 |

**Opponent model** (section 2, fitted jointly over 2022–2026 for each gender, 40 iterations):

- men: goals mu 1.6553, home 1.1000, 1,365 teams; shots mu 12.4299, home 1.0727, 1,320 teams
- women: goals mu 1.5181, home 1.1093, 1,648 teams; shots mu 12.5633, home 1.0786, 1,587 teams

## Section 4: the penalty check

The play-by-play penalty goals of each player-season were compared with `penalty_goals` in that
programme's stats file. The stats line is found by page id, else by folded name, with the shirt
number settling a tie.

| Season | Players compared | Disagreements | Penalty scorers with no stats line | Stats line without penalty_goals |
| --- | --- | --- | --- | --- |
| 2022-men | 5044 | 30 | 13 | 0 |
| 2023-men | 5095 | 22 | 13 | 0 |
| 2024-men | 5217 | 28 | 15 | 0 |
| 2025-men | 5353 | 9 | 6 | 0 |
| 2026-men | 5448 | 12 | 13 | 0 |
| 2022-women | 6115 | 10 | 11 | 0 |
| 2023-women | 6307 | 3 | 10 | 0 |
| 2024-women | 6490 | 1 | 11 | 0 |
| 2025-women | 6605 | 6 | 3 | 0 |
| 2026-women | 6597 | 3 | 3 | 0 |

There are **124 disagreements** in all, out of 58,271 player-seasons compared. In 94 of them the
play-by-play shows fewer penalty goals than the stats file, and in 30 it shows more. The rule does
not change because of the check: section 4 strips the play-by-play count. The ten largest gaps:

| File | Programme | Player | Play-by-play | Stats file |
| --- | --- | --- | --- | --- |
| 2024-men | newman | Alberto Romano | 1 | 5 |
| 2023-men | fort-hays-state | Blake Arndt | 0 | 3 |
| 2023-women | minnesota-duluth | Jackie Jares | 0 | 3 |
| 2024-men | rogers-state | Marcos Vasallo | 1 | 4 |
| 2022-men | fort-hays-state | Blake Arndt | 1 | 3 |
| 2022-men | lubbock-christian | Pablo Galietero Diez | 0 | 2 |
| 2022-men | northern-michigan | Tommaso Lami | 2 | 4 |
| 2022-men | ouachita-baptist | Bobby Boone | 0 | 2 |
| 2023-men | queens | Adolfo Martinez Paquet | 1 | 3 |
| 2023-men | saint-leo | Edoardo Degl'Innocenti | 0 | 2 |

Section 4 asks for every disagreement, so all 124 are listed in the appendix.

## Measures behind the ambiguities

| Season | Workload boundaries | Penalty plays / unattributed | Lines without minutes | Multi-id people | Twice on one sheet | Box-group ties | Roster label unrecognised | No roster entry | Split pairs | Contradicted links | Ambiguous links | No-minutes programmes | Programme-days with two matches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2022-men | 10.532 / 13.240 | 657 / 16 | 5992 | 16 | 5 | 2 | 69 | 596 | 88 | 0 | 0 | 0 | 7 |
| 2023-men | 11.056 / 13.250 | 620 / 8 | 5770 | 0 | 2 | 2 | 119 | 485 | 70 | 12 | 0 | 0 | 11 |
| 2024-men | 10.877 / 12.796 | 570 / 9 | 6171 | 0 | 0 | 1 | 97 | 413 | 73 | 11 | 0 | 0 | 16 |
| 2025-men | 10.926 / 13.274 | 564 / 8 | 5666 | 0 | 2 | 0 | 168 | 413 | 73 | 12 | 0 | 0 | 12 |
| 2026-men | 11.137 / 13.489 | 641 / 8 | 6625 | 1 | 11 | 4 | 136 | 303 | 7 | 21 | 0 | 0 | 3 |
| 2022-women | 10.253 / 13.089 | 552 / 12 | 7289 | 29 | 2 | 4 | 144 | 495 | 28 | 0 | 0 | bloomsburg, e-stroudsburg | 24 |
| 2023-women | 10.250 / 13.353 | 580 / 12 | 7483 | 43 | 2 | 1 | 175 | 400 | 17 | 5 | 0 | bloomsburg | 20 |
| 2024-women | 10.241 / 13.699 | 511 / 5 | 6832 | 77 | 1 | 2 | 200 | 324 | 14 | 11 | 0 | adelphi | 14 |
| 2025-women | 10.268 / 13.681 | 525 / 3 | 6852 | 29 | 0 | 0 | 157 | 327 | 7 | 11 | 0 | kutztown | 19 |
| 2026-women | 10.316 / 14.059 | 502 / 4 | 6442 | 0 | 6 | 1 | 185 | 210 | 5 | 3 | 0 | bloomsburg | 1 |

| Season | Penalty plays reading AWARDED | Penalty plays saying GOAL elsewhere | no_position / with no label at all | Team figures on a rounding tie | Defender and keeper seasons with share > 1 |
| --- | --- | --- | --- | --- | --- |
| 2022-men | 1 | 1 | 313 / 283 | 10 | 8 |
| 2023-men | 0 | 3 | 285 / 256 | 6 | 15 |
| 2024-men | 1 | 0 | 296 / 251 | 5 | 15 |
| 2025-men | 2 | 0 | 320 / 234 | 2 | 19 |
| 2026-men | 3 | 0 | 271 / 186 | 5 | 10 |
| 2022-women | 0 | 0 | 285 / 244 | 8 | 14 |
| 2023-women | 3 | 0 | 293 / 224 | 8 | 18 |
| 2024-women | 0 | 0 | 258 / 184 | 8 | 24 |
| 2025-women | 0 | 0 | 230 / 170 | 10 | 25 |
| 2026-women | 2 | 0 | 201 / 129 | 7 | 10 |

Labels carried by `no_position` player-seasons, all files (roster and box score, counted once per
player): `Winger` 32, `- MID` 25, `- FWD` 22, `Center Back` 18, `Foward` 17, `- DEF` 16,
`Goal Keeper` 16, `F-M` 11, `M\D` 11, `Central Midfielder` 10, `Outside Back` 9, `Wingback` 9,
`Center Midfielder` 8, `Defenseman` 7, `F\M` 7.

Every file has no keeper-only lines, and no team with n = 0. The share column was measured from the
debug rows. Every other figure comes from `tiers/.debug/report.md`, which each build regenerates.

## Ambiguities, and what the build did

The contract says to stop and report an ambiguity. This build was briefed to do the most literal
thing and record it, so each entry below says what was ambiguous, what was done, and what it
affects, measured where it can be.

### Sections 0 and 10: the file

- **A1. `data_commit`** gives no length. The build writes `git rev-parse --short HEAD` (8 characters
  here), plus `+dirty` when `git status --porcelain` is non-empty, which includes untracked files.
- **A2. `frozen_at`** is the build machine's local calendar date. `--frozen-at YYYY-MM-DD`
  overrides it, so a file can be rebuilt byte for byte.
- **A3. Order of programmes** inside `teams` and `players` is not given. Slugs are written in
  code-unit order.
- **A4. "Sorted by key, then number"**: numbers are compared as the printed strings, in code-unit
  order (`"10"` before `"4"`), and a missing number goes last.
- **A5. `shots_faced_per_match` at n = 0**: SA / n is undefined there. The contract marks only
  `pct_in` as nullable, but the build writes `null` and the schema allows it. No team has n = 0 in
  any file, so no null is written.
- **A6. Rounding** ("1 decimal") names no rule. The build writes `Number(x.toFixed(1))`, which
  rounds the double the arithmetic produced and goes up on an exact tie. Python's `round` goes to
  even on such ties. Only a double ending exactly in .25 or .75 is a tie. There are 69 such team
  figures in the ten files (2 to 10 a file) and none at division level. See C5.

### Section 1: one record per match

- **A7. A group the fold refuses.** The site's fold throws when two published records of one match
  disagree. For 2024-09-12 flagler v florida-tech (women), neither record is final: both are
  postponed, and one carries a 2–2. The build sets such a group aside and counts it. If a refused
  group holds a final record, the build stops. There is 1 such group in the ten files.
- **A8. Copies that disagree on a final score** are kept with the fold's canonical score: 1 (2026
  men).
- **A9. Matches that are not final** (postponed, cancelled, never played): section 1 drops only
  exhibitions and forfeits. A match with no result gives no model row and no team totals, and its
  box score is not read. 84 to 146 a file.
- **A10. Box scores with no usable `home_index`** cannot be oriented. The match keeps its fixture
  score for the goals model, but its box score gives no shots and no lines. 3 in all.
- **A11. One match under two opponent slugs.** The grouping key (gender, date, slug pair) cannot
  merge a match published as `concordia` on one page and `concordia-irvine` on the other. The same
  goes for `msu-billings` / `montana-state-billings` and `maryville` / `umary`. Both copies were
  kept, as the key requires. Programme-days holding two physical matches: men 7 / 11 / 16 / 12 / 3,
  women 24 / 20 / 14 / 19 / 1, 127 in all. The cases inspected were all one match under two slugs,
  but not all 127 were inspected. Such a match counts twice in the model, in the programme's n, GA
  and SA, and in its players' minutes and shots. See C1.

### Section 2: opponent factors

- **A12.** The model is fitted on the matches kept by section 1. A neutral site gives h = 1. Step 3
  sums over home and away rows only, so neutral rows do not enter it. Step 3 has a guard for a set
  with no home or no away rows; that never occurs in real data. `mu` starts at the plain mean of y.
  Opponents outside the collected conferences enter only through their matches against collected
  programmes.

### Section 3: position group

- **A13. The table is closed.** A label it does not list is not recognised, however plain: Winger,
  Center Back, Goal Keeper, the misspelt Foward, `F-M`, `M\D` (only `/` splits), and `- MID`
  (`group` trims spaces, not the dash). 2,752 player-seasons are `no_position` across the ten files.
  Most carry no label at all (2,161), and the rest carry labels like those above. Removing a leading
  `- ` would place about 84 more. See C2.
- **A14. A tie in the box-score fallback.** "The most common group among the labels" does not say
  how to break a tie. The build takes the group listed first in the table (GK, D, M, F). 17
  player-seasons in all.
- **A15. Finding the roster entry.** The contract does not say how a player-season finds its roster
  entry. The build matches by page id (the site's `playerIdOf`), else by folded name (the printed
  key first, then the season's other spellings), with the shirt number settling a tie. A tie that
  stays unsettled means no entry. No entry: 210 to 596 a file.
- **A16.** The box-score labels read include the lines that print no minutes ("the labels on the
  player's box-score lines that season").

### Section 4: a player-season

- **A17. "Join by player_ref, then player_id, then folded name"** is read as: two lines that share
  any of the three are one person, transitively. Ids from `player_ref` routes that name a page
  (`page`, `twin`, `roster`) share one namespace with `player_id`. The synthetic `key` route's ids
  are their own. As a result, lines with different ids and the same folded name join. Player-seasons
  holding two or more page ids: men 16 / 0 / 0 / 0 / 1, women 29 / 43 / 77 / 29 / 0. Each one
  inspected was a roster-route id beside a page id for the same person. Joining by name only when a
  line has no id would split those.
- **A18. Name, id and number when the joined lines differ.** `name` is the most common spelling
  among lines that carry a page id, else among all lines. `player_id` is the most common page id,
  and `number` the most common printed number. A tie goes to the code-unit-smallest. `key` is the
  fold of that name.
- **A19. A player printed twice on one sheet**: both lines count, toward minutes and appearances,
  because the contract says "for each player line". 31 player-seasons in all.
- **A20. Split spellings.** Surname and first initial: a name with a comma splits there ("Laws,
  Rhys"), otherwise the first and last words are used; both are folded, and a one-word name never
  pairs. "Share a shirt number" means any number in common over the season. Pairs: men 88 / 70 /
  73 / 73 / 7, women 28 / 17 / 14 / 7 / 5. 2026 men drops because its match files carry
  `player_ref`, which joins the spellings before this rule sees them.
- **A21. Same folded name across seasons.** The link uses the printed key (A18). If two
  player-seasons the season before carry that key, a shared shirt number settles it; otherwise there
  is no link. Unsettled: 0 in every file.
- **A22. Contradiction.** Home towns are compared by the fold. Class years are placed on the site's
  tenure ladder (FR < SO < JR < SR < 5Y). A year the ladder cannot place contradicts nothing, and a
  repeated year (a redshirt) is not backwards. The home town is read for this comparison only and
  is never written. Contradicted links: men 0 / 12 / 11 / 12 / 21, women 0 / 5 / 11 / 11 / 3.
- **A23. "The player it names".** The build uses the site's own penalty parse (`goalScorer`), then a
  folded-name match, then the one line on that side whose every name word appears in the sentence.
  For a play with no side, both sides are tried. A play is credited only when exactly one line is
  found. Unattributed plays (85 in all, 3 to 16 a file) strip nothing from anyone.
- **A24. `PENALTY KICK AWARDED`** plays are of type `penalty`, so each counts as an attempt by the
  player it names. There are 12 in all; 2 of them name a player on the sheet. If the kick that
  follows is recorded too, that player's attempts count twice. Because of `max(s − attempts, 0)`,
  the effect is at most one shot.
- **A25. The goal test is the literal `PENALTY KICK GOAL`.** Four penalty plays say GOAL some other
  way. Two are penalty goals printed "Penalty Kick by … for a GOAL": they count as misses, so the
  goal stays in g. The other two are rebounds off a saved kick, correctly not goals.
- **A26. Lines without minutes** (the field absent or not a number) are skipped whole, along with
  any penalties credited to them. A printed 0 counts as minutes: it adds 0 minutes and no
  appearance. A goal or shot count that is not printed reads as 0. Those penalties still count in
  the season's penalty goals for the check.
- **A27. `no_minutes`** applies when no line of the programme's own players prints minutes in any
  of its box scores. It occurs in women only (programmes in the table above).
- **A28. Precedence of reasons** when more than one applies: `no_minutes`, then `no_position`, then
  `identity`, then `few_matches`. The contract lists the reasons but gives no order.

### Section 5: shooting and scoring

- **A29. The `avg` pool** is every player-season of the group, season and gender with at least 600
  minutes, including those incomplete for `identity`, which the wording admits. The eligible pool
  leaves incomplete players out.
- **A30. "The season before counts"** is judged on the linked season's own minutes (at least 600)
  and group (F or M, not necessarily this season's group). Being incomplete that season does not
  stop it counting.
- **A31. `basis.seasons` for a shooting entry.** Section 5 defines no "seasons counted". The build
  writes the seasons whose threat enters the estimate, `[s − 1, s]` when two count and `[s]`
  otherwise, with minutes and matches summed over them.
- **A32. The cut** is computed in integers, ceil(5n / 100) and ceil(20n / 100). This equals the
  float `ceil(0.05 × n)` for every n up to 2,000 (a test checks it). A tie means two estimates are
  exactly equal as doubles. Tier 2 is everyone inside the 20% cut, ties included, who is not Tier 1.

### Sections 6 to 8: team defence

- **A33.** The EGA fallback "where the opponent has no factor" never fires: every match in section 6
  has integer scores, so every opponent has a goals-model factor.
- **A34.** The quantile is linear interpolation of order statistics (type 7, h = (N − 1)p). The
  standard deviation is the population SD, and a group with SD 0 would score 0; none does.
- **A35. `share`.** n is section 6's count (matches with integer shots and scores on both sides),
  but the minutes come from every box score that prints them. Share can therefore exceed 1: 158
  defender and keeper seasons do (8 to 25 a file), all above their minute threshold. The literal
  rule was kept. See C3.
- **A36. The chain of seasons counted** stops at the first earlier season that is not regular, is in
  another group, has no workload group, or has no link. It does not skip a season, and each step
  must be exactly one season back.
- **A37.** An earlier season counts in the chain even when the player was incomplete for `identity`
  that season, provided the section 8 conditions hold. Players incomplete *this* season are left out
  of the pool.
- **A38.** `class_year` is written exactly as printed, untrimmed, or null when blank.

### Scope consequences

- **A39.** Every player with a box-score line at a collected programme has an entry, including
  players none of whose lines print minutes.
- **A40.** Every collected programme-season appears under `teams`, including those with n < 12
  (`workload: null`).
- **A41. 2022 has no season before it** in scope (section 0), so no 2022 player is eligible on 600
  to 899 minutes, every 2022 estimate is a one-season estimate, and no 2022 defender or keeper can
  have two seasons counted. Both 2022 files hold **0** team-defence tier or eligible entries; every
  complete 2022 regular is `needs_second_season`. See C4.

## Where the contract looks wrong or incomplete

- **C1. Section 1 cannot merge slug aliases** (A11). 127 programme-days double-count a match, its
  minutes and its shots. The fix belongs either upstream, with the collector writing canonical slugs
  (the site's fold tests already assume them, #67), or in the contract as an alias table. Grouping on
  the slug pair alone will keep doing this.
- **C2. Section 3's table is too narrow** (A13). 2,752 of 62,541 entries (4.4%) are `no_position`, 591 of
  them with a perfectly clear label. Adding WINGER, CENTER BACK, GOAL KEEPER and similar, splitting on
  `-` and `\` as well as `/`, and trimming a leading dash would place most of the labelled ones.
- **C3. Section 8's share divides minutes from one set of matches by a count from another** (A35).
  158 seasons have a share above 100%. Counting both over the same matches would make the 0.70 and
  0.50 thresholds mean what they say.
- **C4. 2022 cannot hold a team-defence tier** (A41), and its shooting tiers rest on single seasons
  only. A page that shows 2022 next to 2023 would present the two years on different footings. The
  contract should either read 2021 for links and the "season before" only, or say that 2022 has no
  team-defence tier.
- **C5. The unspecified rounding rule can break acceptance 11.1.** If the Python build uses `round`
  (half to even), up to 10 team figures in a file can differ from this build's (2022-men: 10, across
  199 teams). That is up to 5% of teams, against the 1% that 11.1 allows. The contract should name
  the rule, for example "half up on the double", meaning Decimal ROUND_HALF_UP in Python.
- **C6. Sections 5 and 8 do not define `basis.seasons` the same way** (A31): section 8 defines
  "seasons counted" and section 5 does not. The display will need to know what a shooting entry's
  seasons mean.

## Rebuild

```bash
cd <this worktree>
bun install
bun run tiers:build          # = bun run scripts/tiers/build.ts --out tiers/d2
# TOUCHLINE_DATA_DIR overrides the data home (default ~/keelson/d2-soccer)
# --frozen-at YYYY-MM-DD reproduces a file's frozen_at
```

## Appendix: every penalty disagreement (section 4)

| File | Programme | Player | Play-by-play | Stats file |
| --- | --- | --- | --- | --- |
| 2022-men | emmanuel | Alexander Panner | 1 | 0 |
| 2022-men | emmanuel | Tomas Pollacchi | 1 | 2 |
| 2022-men | queens | Adolfo Martinez Paquet | 6 | 7 |
| 2022-men | ashland | Haruki Kimura | 5 | 6 |
| 2022-men | lake-erie | Tom Akinola | 0 | 1 |
| 2022-men | lake-erie | Teddy Baker | 1 | 2 |
| 2022-men | northwood | Lucas Hart | 1 | 2 |
| 2022-men | fort-hays-state | Blake Arndt | 1 | 3 |
| 2022-men | harding | Matthew Sanchez | 0 | 1 |
| 2022-men | newman | Matthew Roberts | 0 | 1 |
| 2022-men | newman | Felix Tellez Ramirez | 0 | 1 |
| 2022-men | northeastern-state | Ryan McCully | 0 | 1 |
| 2022-men | northeastern-state | Flynn Semmerling | 2 | 3 |
| 2022-men | northeastern-state | Giani Mascarel | 0 | 1 |
| 2022-men | ouachita-baptist | Bobby Boone | 0 | 2 |
| 2022-men | rogers-state | Luke Morgan | 0 | 1 |
| 2022-men | northern-michigan | Tommaso Lami | 2 | 4 |
| 2022-men | upper-iowa | Edward Stephens-Truman | 2 | 1 |
| 2022-men | rockhurst | Kaden Cripe | 1 | 2 |
| 2022-men | mississippi-college | Zach Diallo | 1 | 2 |
| 2022-men | spring-hill | Joao Amaral | 2 | 1 |
| 2022-men | spring-hill | Johannes Hanken Tjostheim | 1 | 2 |
| 2022-men | lubbock-christian | Pablo Galietero Diez | 0 | 2 |
| 2022-men | oklahoma-christian | Joep Claassen | 5 | 6 |
| 2022-men | hawaii-pacific | Gerrit Arzberger | 5 | 4 |
| 2022-men | e-stroudsburg | Ignasi Cucurella Tuset | 0 | 1 |
| 2022-men | adams-state | Aidyn Ogle | 0 | 1 |
| 2022-men | fort-lewis | Gabriel Legendre | 1 | 0 |
| 2022-men | fort-lewis | Loic Jean-Baptiste | 1 | 0 |
| 2022-men | florida-tech | Julen Lafuente | 0 | 1 |
| 2023-men | felician | Alvaro Martin Castedo | 0 | 1 |
| 2023-men | post | Nick Anagnostiadis | 0 | 1 |
| 2023-men | cal-state-monterey-bay | Hugo Vargas-Rios | 1 | 0 |
| 2023-men | queens | Adolfo Martinez Paquet | 1 | 3 |
| 2023-men | cedarville | Jackson Isaacs | 2 | 1 |
| 2023-men | kentucky-wesleyan | Calum Newson | 2 | 1 |
| 2023-men | fort-hays-state | Blake Arndt | 0 | 3 |
| 2023-men | harding | Jonah Pastiroff | 0 | 1 |
| 2023-men | harding | Stefano Silva | 0 | 1 |
| 2023-men | newman | Felix Tellez Ramirez | 0 | 1 |
| 2023-men | newman | Carlos Bellosta Manchon | 2 | 3 |
| 2023-men | rogers-state | Luke Morgan | 0 | 1 |
| 2023-men | southern-nazarene | Bruno Ferreira | 0 | 1 |
| 2023-men | southern-nazarene | Cesar Solis | 0 | 1 |
| 2023-men | st-cloud-state | Zinedine Kroeten | 0 | 1 |
| 2023-men | west-florida | Finn Werner | 0 | 1 |
| 2023-men | west-florida | Jack Patching | 1 | 2 |
| 2023-men | midwestern-state | Mere Escobar | 3 | 4 |
| 2023-men | slippery-rock | Arturo Pla Hernandis | 1 | 2 |
| 2023-men | westminster | Lute Maja | 2 | 1 |
| 2023-men | saint-leo | Edoardo Degl'Innocenti | 0 | 2 |
| 2023-men | tampa | Theo Maye | 3 | 2 |
| 2024-men | felician | Nicholas Robinson | 0 | 1 |
| 2024-men | belmont-abbey | Alex Ljusberg | 0 | 1 |
| 2024-men | fort-hays-state | Chris Rios-Cruz | 0 | 1 |
| 2024-men | harding | Matthew Sanchez | 0 | 1 |
| 2024-men | newman | Alberto Romano | 1 | 5 |
| 2024-men | newman | Gustavo Dias Juliani | 0 | 1 |
| 2024-men | northeastern-state | Ivan Lopez | 0 | 2 |
| 2024-men | ouachita-baptist | João Gonçalves | 0 | 1 |
| 2024-men | ouachita-baptist | Alexis Murillo | 0 | 1 |
| 2024-men | rogers-state | Erik Hjertsson | 1 | 2 |
| 2024-men | rogers-state | Marcos Vasallo | 1 | 4 |
| 2024-men | rogers-state | Trindon Turner | 0 | 1 |
| 2024-men | southern-nazarene | Axel Agurcia | 1 | 2 |
| 2024-men | southern-nazarene | Cesar Solis | 0 | 1 |
| 2024-men | western-oregon | Yahir Ocampo Navarro | 4 | 5 |
| 2024-men | mississippi-college | Sergio Garrido | 2 | 3 |
| 2024-men | union | Kenny Nitzsche | 2 | 3 |
| 2024-men | fresno-pacific | Lucas Ribeiro | 4 | 5 |
| 2024-men | fresno-pacific | Chris Macias | 2 | 1 |
| 2024-men | hawaii-hilo | Tom Vorkastner | 1 | 0 |
| 2024-men | hawaii-hilo | Colby Lee | 0 | 1 |
| 2024-men | e-stroudsburg | Ignasi Cucurella Tuset | 0 | 2 |
| 2024-men | millersville | Roy Parkyn | 0 | 1 |
| 2024-men | uccs | Nick Walker | 2 | 3 |
| 2024-men | uccs | Miles Seminario | 1 | 2 |
| 2024-men | catawba | Sebastia Cerda-Tous | 0 | 1 |
| 2024-men | catawba | Rodrigo Albayeros | 1 | 0 |
| 2024-men | saint-leo | Edoardo Degl'Innocenti | 0 | 1 |
| 2025-men | chowan | KJ Coleman | 0 | 1 |
| 2025-men | cedarville | Yonis Velasquez-Quezada | 0 | 2 |
| 2025-men | st-cloud-state | Mahmood Maldonado | 0 | 1 |
| 2025-men | maryville | Jacob Darwesh Lund Iversen | 0 | 1 |
| 2025-men | truman | Jacob Panagos | 2 | 3 |
| 2025-men | dallas-baptist | Gavyn Rosales | 0 | 1 |
| 2025-men | msu-denver | Adan Perez | 2 | 1 |
| 2025-men | lynn | Junior Smith | 0 | 2 |
| 2025-men | saint-leo | Jorge Perez Rosales | 0 | 1 |
| 2026-men | goldey-beacom | Sam Ball | 0 | 1 |
| 2026-men | converse | Iker Revuelta | 3 | 2 |
| 2026-men | north-greenville | Jesse Zborovsky | 0 | 1 |
| 2026-men | north-greenville | Warren Traina | 1 | 0 |
| 2026-men | tiffin | Andre Robison | 0 | 1 |
| 2026-men | lee | Matias Milla Munoz | 1 | 2 |
| 2026-men | lee | Jesse Thompson | 1 | 0 |
| 2026-men | shawnee-state | Théo Cavaleiro Trindade | 1 | 2 |
| 2026-men | wheeling | Jon-Michael Gordon | 0 | 2 |
| 2026-men | pace | Daniel Santos | 0 | 1 |
| 2026-men | point-loma | Simon Sagal | 1 | 2 |
| 2026-men | mars-hill | Adrian Faus | 0 | 1 |
| 2022-women | belmont-abbey | Goose Andrews | 1 | 0 |
| 2022-women | cal-state-la | Shelby Melin | 3 | 2 |
| 2022-women | molloy | Alessandra Borsellino | 0 | 1 |
| 2022-women | missouri-s-t | Andersyn Foster | 1 | 0 |
| 2022-women | western-washington | Caylie Etherington | 1 | 0 |
| 2022-women | fort-lewis | Sabrina Reyes | 1 | 0 |
| 2022-women | fort-lewis | Madyson Barela | 1 | 0 |
| 2022-women | fort-lewis | Hannah Paschke | 1 | 0 |
| 2022-women | anderson | Carly Keuffer | 0 | 1 |
| 2022-women | florida-tech | May Queiroz | 0 | 1 |
| 2023-women | assumption | Ryann Lima | 0 | 1 |
| 2023-women | minnesota-duluth | Jackie Jares | 0 | 3 |
| 2023-women | catawba | Lillie Rusher | 1 | 0 |
| 2024-women | regis | Natalie Bunch | 0 | 1 |
| 2025-women | southwestern-oklahoma-state | Saoirse Hourigan | 3 | 2 |
| 2025-women | dallas-baptist | Bella Medina | 0 | 1 |
| 2025-women | emporia-state | Peyton Pipes | 2 | 1 |
| 2025-women | edinboro | Jada Cole | 2 | 1 |
| 2025-women | emory-henry | Charlotte Stavis | 0 | 1 |
| 2025-women | emory-henry | Anjelika DeJesus | 0 | 1 |
| 2026-women | truman | Meghan Knust | 1 | 0 |
| 2026-women | bloomsburg | Abby Rock | 0 | 1 |
| 2026-women | emory-henry | Siena Booth | 1 | 2 |
