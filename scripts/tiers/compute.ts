// The whole contract (ALGORITHM.md version 2.2) for one gender, every season
// at once: the opponent model is fitted jointly across the seasons (section
// 2), and a player's earlier seasons at the programme feed sections 5 and 8.
// Pure over loaded files: the CLI (build.ts) reads the data home and writes
// what this returns.

import type { Gender, MatchDetail, MatchPlayerLine } from "../../src/lib/model.ts";
import { isGoalPlay } from "../../src/lib/plays.ts";
import type {
  IncompleteReason,
  PositionGroup,
  TierEntry,
  TierKind,
  TierStatus,
} from "../../src/lib/tiers.ts";
import { foldName } from "../../src/lib/tiers.ts";
import {
  careerRecord,
  type DefenceSeason,
  defenceTier,
  isDefenceGroup,
  isRegular,
  seasonsCounted,
} from "./defence.ts";
import {
  type ConferenceSeason,
  type FoldCounts,
  type PhysicalMatch,
  physicalMatches,
} from "./matches.ts";
import { applyMinutesOfRecord, type MinutesOfRecord, minutesOfRecord } from "./minutes.ts";
import {
  type Factors,
  fitFactors,
  GOALS_PRIOR,
  type ModelRow,
  otherVenue,
  SHOTS_PRIOR,
  teamId,
  type Venue,
  venueFactor,
} from "./opponents.ts";
import {
  isPenaltyAttempt,
  isPenaltyGoalText,
  type PenaltyReading,
  readPenalties,
} from "./penalties.ts";
import {
  applyStatsPenalties,
  classStep,
  closeLink,
  contradicts,
  emptyJoinMeasures,
  type JoinMeasures,
  type JoinOptions,
  type PlayerSeason,
  playerSeasons,
  type Sheet,
  type SheetLine,
  type StatsPenaltyChange,
  sameName,
  splitSpellingPairs,
  statsRowFor,
} from "./players.ts";
import { boxGroupTied, group as groupOfLabel, mostCommonGroup, rosterGroup } from "./position.ts";
import {
  COUNTS_MINUTES,
  estimate,
  groupAverage,
  isShootingGroup,
  seasonCounts,
  shootingEligible,
  shootingTiers,
  threat,
} from "./shooting.ts";
import type { SideSource } from "./sides.ts";
import { type TeamMatch, teamTotals } from "./teams.ts";
import { scoreTeams, type TeamSeason } from "./workload.ts";

export const FIRST_SEASON = 2022;
export const LAST_SEASON = 2026;

/** One player-season after every section has run. */
export interface Rated {
  p: PlayerSeason;
  group: PositionGroup | null;
  kind: TierKind | null;
  status: TierStatus;
  tier: 1 | 2 | null;
  reason: IncompleteReason | null;
  previous: Rated | null;
  threat: number | null;
  estimate: number | null;
  counted: number[];
  career: number | null;
  regular: boolean;
  defence: DefenceSeason | null;
  statsChange: StatsPenaltyChange | null;
  /** [N1] Where the minutes of record came from, and the share's records. */
  ofRecord: MinutesOfRecord;
  /** [N1] r and m of the programme-season. */
  records: number;
  withMinutes: number;
  /** The box minutes, whatever the minutes of record. */
  boxMinutes: number;
  /** The basis the entry prints. */
  basisSeasons: number[];
  basisMinutes: number;
  basisMatches: number;
}

export interface SeasonResult {
  season: number;
  gender: Gender;
  teams: TeamSeason[];
  rated: Rated[];
  entries: Map<string, TierEntry[]>;
  fold: FoldCounts;
  measures: Measures;
}

/** What the build log reports beyond the artifact. */
export interface Measures {
  boundaries: { first: number; second: number } | null;
  /** Penalty plays that are attempts, and those no line was found for. */
  penaltyAttempts: number;
  penaltyUnattributed: number;
  /** Penalty plays that are not attempts (AWARDED, or a `*` note). */
  penaltyNotAttempts: number;
  /** Penalty attempts that are goals, and every goal play. */
  penaltyGoalPlays: number;
  goalPlays: number;
  linesSkippedNoMinutes: number;
  /** Player-records with two or more lines on one sheet (counted once). */
  doubledRecords: number;
  join: JoinMeasures;
  boxGroupTies: number;
  /** [N3] Players whose two-group roster label the box scores decided
   *  against the whole label's reading. */
  rosterGroupByBox: number;
  noRosterLine: number;
  rosterLabelNoGroup: number;
  splitPairs: number;
  contradictedLinks: number;
  ambiguousLinks: number;
  /** [N2c] Links made by a close name. */
  closeLinks: number;
  noMinutesProgrammes: string[];
  teamsWithoutMatches: string[];
  /** Collected programme-days still holding two records after one match a day. */
  sameDayDoubles: string[];
  noPosition: number;
  noPositionUnlabelled: number;
  noPositionLabels: Map<string, number>;
  /** Roster class years the 4.4 ladder cannot place, with how many lines. */
  unplacedClassYears: Map<string, number>;
  /** Players incomplete for identity, and of them those with 600+ minutes. */
  identity: number;
  identity600: number;
  /** Player-seasons the second penalty source changed. */
  statsChanges: { programme: string; name: string; change: StatsPenaltyChange }[];
  /** m of section 8 per collected programme: records whose box score prints
   *  minutes for at least one of its players. */
  withMinutes: Map<string, number>;
}

const integer = (x: number | null | undefined): x is number =>
  typeof x === "number" && Number.isInteger(x);

/** The model rows of one season's records: one row per side per record
 *  where y is an integer; [R-B] a record enters the shots model only when
 *  both its shot totals (one copy's, sides.ts) are integers. */
export function modelRows(matches: readonly PhysicalMatch[]): {
  goals: ModelRow[];
  shots: ModelRow[];
} {
  const goals: ModelRow[] = [];
  const shots: ModelRow[] = [];
  for (const m of matches) {
    const home = teamId(m.season, m.home);
    const away = teamId(m.season, m.away);
    const hv: Venue = m.neutral ? "neutral" : "home";
    const av: Venue = otherVenue(hv);
    if (integer(m.homeGoals)) goals.push({ attack: home, defend: away, y: m.homeGoals, venue: hv });
    if (integer(m.awayGoals)) goals.push({ attack: away, defend: home, y: m.awayGoals, venue: av });
    const hs = m.homeShots;
    const as = m.awayShots;
    if (integer(hs) && integer(as)) {
      shots.push({ attack: home, defend: away, y: hs, venue: hv });
      shots.push({ attack: away, defend: home, y: as, venue: av });
    }
  }
  return { goals, shots };
}

export function toSheetLine(line: MatchPlayerLine): SheetLine {
  return {
    name: line.name,
    playerId: line.player_id ?? null,
    ref: line.player_ref ? { id: line.player_ref.id, source: line.player_ref.source } : null,
    number: line.number ?? null,
    position: line.position ?? null,
    started: line.started === true,
    minutes: typeof line.minutes === "number" ? line.minutes : null,
    goals: line.goals ?? 0,
    shots: line.shots ?? 0,
  };
}

const emptyMeasures = (): Measures => ({
  boundaries: null,
  penaltyAttempts: 0,
  penaltyUnattributed: 0,
  penaltyNotAttempts: 0,
  penaltyGoalPlays: 0,
  goalPlays: 0,
  linesSkippedNoMinutes: 0,
  doubledRecords: 0,
  join: emptyJoinMeasures(),
  boxGroupTies: 0,
  rosterGroupByBox: 0,
  noRosterLine: 0,
  rosterLabelNoGroup: 0,
  splitPairs: 0,
  contradictedLinks: 0,
  ambiguousLinks: 0,
  closeLinks: 0,
  noMinutesProgrammes: [],
  teamsWithoutMatches: [],
  sameDayDoubles: [],
  noPosition: 0,
  noPositionUnlabelled: 0,
  noPositionLabels: new Map(),
  unplacedClassYears: new Map(),
  identity: 0,
  identity600: 0,
  statsChanges: [],
  withMinutes: new Map(),
});

export interface GenderResult {
  gender: Gender;
  goals: Factors;
  shots: Factors;
  seasons: SeasonResult[];
}

export interface ComputeOptions {
  /** Section 4.2's roster pass; off only to measure acceptance 11.4. */
  rosterPass: boolean;
  /** [N2d] Each programme's nickname (the programmes reference), so a line
   *  printing it with no minutes is read as a team row. */
  nicknames?: ReadonlyMap<string, string>;
}

/** Every season of one gender. `data` holds each season's conference files. */
export function computeGender(
  gender: Gender,
  data: ReadonlyMap<number, readonly ConferenceSeason[]>,
  options: ComputeOptions = { rosterPass: true },
): GenderResult {
  const seasons = [...data.keys()].sort((a, b) => a - b);
  const join: JoinOptions = { rosterPass: options.rosterPass };

  // ── Section 1, then section 2 over all five seasons ───────────────────────
  const folded = new Map<number, { matches: PhysicalMatch[]; counts: FoldCounts }>();
  const goalRows: ModelRow[] = [];
  const shotRows: ModelRow[] = [];
  for (const season of seasons) {
    const f = physicalMatches(season, data.get(season) ?? []);
    folded.set(season, f);
    const rows = modelRows(f.matches);
    goalRows.push(...rows.goals);
    shotRows.push(...rows.shots);
  }
  const goals = fitFactors(goalRows, GOALS_PRIOR);
  const shots = fitFactors(shotRows, SHOTS_PRIOR);

  const results: SeasonResult[] = [];
  const ratedBySeason = new Map<number, Map<string, Rated[]>>();

  for (const season of seasons) {
    const confs = data.get(season) ?? [];
    const { matches, counts } = folded.get(season) as {
      matches: PhysicalMatch[];
      counts: FoldCounts;
    };
    const measures = emptyMeasures();

    // Collected programmes this season (section 0), and each one's files.
    const memberOf = new Map<string, ConferenceSeason>();
    for (const c of confs) {
      for (const p of c.fixtures.programmes) if (!memberOf.has(p.slug)) memberOf.set(p.slug, c);
    }

    // ── Sheets, team records and m per collected programme ──────────────────
    const sheets = new Map<string, Sheet[]>();
    const teamMatches = new Map<string, TeamMatch[]>();
    const withMinutes = new Map<string, number>();
    for (const slug of memberOf.keys()) {
      sheets.set(slug, []);
      teamMatches.set(slug, []);
      withMinutes.set(slug, 0);
    }
    const readings = new Map<MatchDetail, PenaltyReading>();
    for (const m of matches) {
      const hv: Venue = m.neutral ? "neutral" : "home";
      for (const play of m.detail.plays ?? []) {
        if (isGoalPlay(play)) measures.goalPlays++;
        if (isPenaltyAttempt(play) && isPenaltyGoalText(play.text)) measures.penaltyGoalPlays++;
      }
      const pens = readPenalties(m.detail);
      measures.penaltyAttempts += pens.credits.length + pens.unattributed.length;
      measures.penaltyUnattributed += pens.unattributed.length;
      measures.penaltyNotAttempts += pens.notAttempts;
      // [R-A] A side's penalty credits come from the copy its lines come from.
      const creditsOf = (src: SideSource) => {
        let r = readings.get(src.detail);
        if (!r) {
          r = readPenalties(src.detail);
          readings.set(src.detail, r);
        }
        return r.credits
          .filter((c) => c.side === src.row)
          .map((c) => ({ lines: c.lines, goal: c.goal }));
      };
      const sides = [
        {
          slug: m.home,
          opp: m.away,
          venue: hv,
          src: m.homeSide,
          shots: m.homeShots,
          oppShots: m.awayShots,
        },
        {
          slug: m.away,
          opp: m.home,
          venue: otherVenue(hv),
          src: m.awaySide,
          shots: m.awayShots,
          oppShots: m.homeShots,
        },
      ];
      const scores = [
        [m.homeGoals, m.awayGoals],
        [m.awayGoals, m.homeGoals],
      ];
      sides.forEach((side, k) => {
        const tm = teamMatches.get(side.slug);
        if (!tm) return; // not a collected programme
        tm.push({
          opponent: teamId(season, side.opp),
          venue: side.venue,
          goalsFor: scores[k]?.[0] ?? null,
          goalsAgainst: scores[k]?.[1] ?? null,
          shotsFor: integer(side.shots) ? side.shots : null,
          shotsAgainst: integer(side.oppShots) ? side.oppShots : null,
        });
        if (!side.src) return;
        const lines = (side.src.team.players ?? []).map(toSheetLine);
        measures.linesSkippedNoMinutes += lines.filter((l) => l.minutes === null).length;
        if (lines.some((l) => l.minutes !== null)) {
          withMinutes.set(side.slug, (withMinutes.get(side.slug) ?? 0) + 1);
        }
        (sheets.get(side.slug) as Sheet[]).push({
          identity: m.identity,
          date: m.date,
          opponent: teamId(season, side.opp),
          venue: side.venue,
          lines,
          credits: creditsOf(side.src),
        });
      });
    }

    const days = new Map<string, number>();
    for (const m of matches) {
      for (const slug of [m.home, m.away]) {
        if (!memberOf.has(slug)) continue;
        const k = `${slug} ${m.date}`;
        days.set(k, (days.get(k) ?? 0) + 1);
      }
    }
    measures.sameDayDoubles = [...days].filter(([, c]) => c > 1).map(([k]) => k);
    measures.withMinutes = withMinutes;

    // ── Sections 6 and 7, over collected programme-seasons ──────────────────
    const totals = [...memberOf.keys()].map((slug) =>
      teamTotals(slug, teamMatches.get(slug) ?? [], goals),
    );
    const scored = scoreTeams(totals);
    measures.boundaries = scored.boundaries;
    const teamBySlug = new Map(scored.teams.map((t) => [t.slug, t]));
    measures.teamsWithoutMatches = scored.teams.filter((t) => t.matches === 0).map((t) => t.slug);

    // ── Section 4: player-seasons ───────────────────────────────────────────
    const scale = (sheet: Sheet) => ({
      goals: (goals.dfn.get(sheet.opponent) ?? 1) * venueFactor(sheet.venue, goals.home),
      shots: (shots.dfn.get(sheet.opponent) ?? 1) * venueFactor(sheet.venue, shots.home),
    });
    const rated = new Map<string, Rated[]>();
    for (const [slug, list] of sheets) {
      if (list.length === 0) continue;
      const conf = memberOf.get(slug) as ConferenceSeason;
      const roster = conf.rosters?.rosters[slug]?.players ?? [];
      const statsRows = conf.stats?.teams[slug]?.players ?? [];
      const ps = playerSeasons(slug, season, list, roster, scale, join, measures.join, {
        statsRows,
        nicknameFold: foldName(options.nicknames?.get(slug) ?? ""),
      });
      if (ps.length === 0) continue;
      const noMinutes = !list.some((sh) => sh.lines.some((l) => l.minutes !== null));
      if (noMinutes) measures.noMinutesProgrammes.push(slug);
      const identity = new Set<number>();
      const pairs = splitSpellingPairs(ps);
      measures.splitPairs += pairs.length;
      for (const [i, j] of pairs) {
        identity.add(i);
        identity.add(j);
      }
      const keeperRows = conf.stats?.teams[slug]?.keepers ?? [];
      const team = teamBySlug.get(slug);
      const r = (teamMatches.get(slug) ?? []).length;
      const m = withMinutes.get(slug) ?? 0;
      const entries: Rated[] = ps.map((p, i) => {
        measures.doubledRecords += p.doubled;
        const boxMinutes = p.minutes;
        const statsRow = statsRowFor(p, statsRows);
        const ofRecord = minutesOfRecord(r, m, statsRow, statsRowFor(p, keeperRows));
        applyMinutesOfRecord(p, ofRecord);
        const statsChange = applyStatsPenalties(p, statsRow);
        if (statsChange)
          measures.statsChanges.push({ programme: slug, name: p.name, change: statsChange });
        if (p.roster === null) measures.noRosterLine++;
        else {
          if (groupOfLabel(p.roster.position) === null) measures.rosterLabelNoGroup++;
          const cy = p.roster.class_year?.trim();
          if (cy && classStep(cy) === null) {
            measures.unplacedClassYears.set(cy, (measures.unplacedClassYears.get(cy) ?? 0) + 1);
          }
        }
        // Section 3, [N3] a roster label naming two groups read by the box scores.
        const fromRoster = rosterGroup(p.roster?.position, p.labels);
        if (fromRoster.byBox) measures.rosterGroupByBox++;
        const g = fromRoster.group ?? mostCommonGroup(p.labels);
        if (groupOfLabel(p.roster?.position) === null && boxGroupTied(p.labels)) {
          measures.boxGroupTies++;
        }
        const kind: TierKind | null =
          g === null ? null : isShootingGroup(g) ? "shooting_scoring" : "team_defence";
        // Section 4.7: the first reason that applies, in this order.
        let reason: IncompleteReason | null = null;
        if (ofRecord.mode === "none") reason = "no_minutes";
        else if (g === null) reason = "no_position";
        else if (identity.has(i)) reason = "identity";
        else if (isDefenceGroup(g) && (team?.workload ?? null) === null) reason = "few_matches";
        return {
          p,
          group: g,
          kind,
          status: reason === null ? "needs_minutes" : "incomplete",
          tier: null,
          reason,
          previous: null,
          threat: threat(gender, p.adjG, p.adjS, p.minutes),
          estimate: null,
          counted: [],
          career: null,
          regular: isRegular(g, p.minutes, ofRecord.denominator, reason !== null),
          defence: null,
          statsChange,
          ofRecord,
          records: r,
          withMinutes: m,
          boxMinutes,
          basisSeasons: [season],
          basisMinutes: p.minutes,
          basisMatches: p.matches,
        };
      });
      rated.set(slug, entries);
      for (const r of entries) {
        if (r.reason === "identity") {
          measures.identity++;
          if (r.p.minutes >= COUNTS_MINUTES) measures.identity600++;
        }
        if (r.reason !== "no_position") continue;
        measures.noPosition++;
        const labels = new Set(
          [r.p.roster?.position ?? null, ...r.p.labels].filter(
            (l): l is string => l !== null && l.trim() !== "",
          ),
        );
        if (labels.size === 0) measures.noPositionUnlabelled++;
        const tally = measures.noPositionLabels;
        for (const l of labels) tally.set(l, (tally.get(l) ?? 0) + 1);
      }
    }
    ratedBySeason.set(season, rated);

    // ── Section 4.4: the same person across seasons ─────────────────────────
    const before = ratedBySeason.get(season - 1);
    for (const [slug, list] of rated) {
      const earlier = before?.get(slug) ?? [];
      const earlierPs = earlier.map((r) => r.p);
      // The same key as now, for every player of the season, before any close
      // name: [N2c] a player who continues under his own name is no one's
      // close link.
      const keyLinked = new Set<PlayerSeason>();
      const noKey: Rated[] = [];
      for (const r of list) {
        const sameKey = earlier.filter((e) => e.p.key === r.p.key).length;
        if (sameKey === 0) {
          noKey.push(r);
          continue;
        }
        const prevP = sameName(r.p, earlierPs);
        if (prevP === null) {
          if (sameKey > 1) measures.ambiguousLinks++;
          continue;
        }
        const prev = earlier.find((e) => e.p === prevP) as Rated;
        if (contradicts(prev.p.roster, r.p.roster)) {
          measures.contradictedLinks++;
          continue;
        }
        r.previous = prev;
        keyLinked.add(prevP);
      }
      // [N2c] No earlier player has his key: the only close one left.
      for (const r of noKey) {
        const prevP = closeLink(r.p, earlierPs, keyLinked);
        if (prevP === null) continue;
        measures.closeLinks++;
        r.previous = earlier.find((e) => e.p === prevP) as Rated;
      }
    }

    // ── Section 5: shooting and scoring ─────────────────────────────────────
    const all = [...rated.values()].flat();
    for (const g of ["F", "M"] as const) {
      // An incomplete player is in no pool and no average (4.7).
      const complete = all.filter((r) => r.group === g && r.reason === null);
      const avg = groupAverage(
        complete.filter((r) => r.p.minutes >= COUNTS_MINUTES).map((r) => r.threat as number),
      );
      const eligible: { id: string; value: number; r: Rated }[] = [];
      complete.forEach((r, idx) => {
        const prev = r.previous;
        const prevCounts =
          prev !== null && seasonCounts(prev.p.minutes, prev.group, prev.reason !== null);
        if (!shootingEligible(r.p.minutes, r.group, prevCounts)) return;
        r.estimate = estimate(
          gender,
          r.threat as number,
          avg as number,
          prevCounts ? (prev?.threat as number) : null,
        );
        r.status = "eligible";
        if (prevCounts && prev) {
          r.basisSeasons = [season - 1, season];
          r.basisMinutes = prev.p.minutes + r.p.minutes;
          r.basisMatches = prev.p.matches + r.p.matches;
        }
        eligible.push({ id: String(idx), value: r.estimate, r });
      });
      const tiers = shootingTiers(eligible);
      for (const e of eligible) {
        const t = tiers.get(e.id);
        if (t !== undefined) {
          e.r.status = "tier";
          e.r.tier = t;
        }
      }
    }

    // ── Section 8: team defence ─────────────────────────────────────────────
    for (const [slug, list] of rated) {
      const team = teamBySlug.get(slug);
      for (const r of list) {
        r.defence = {
          season,
          group: r.group,
          regular: r.regular,
          workload: team?.workload ?? null,
          score: team?.score ?? null,
          previous: r.previous?.defence ?? null,
        };
      }
    }
    const pool: { id: string; value: number; r: Rated }[] = [];
    all
      .filter((r) => isDefenceGroup(r.group) && r.reason === null)
      .forEach((r, idx) => {
        const counted = seasonsCounted(r.defence as DefenceSeason);
        r.counted = counted.map((s) => s.season);
        if (counted.length === 0) {
          r.status = "needs_minutes";
          return;
        }
        let at: Rated | null = r;
        let minutes = 0;
        let apps = 0;
        for (let k = 0; k < counted.length && at; k++) {
          minutes += at.p.minutes;
          apps += at.p.matches;
          at = at.previous;
        }
        r.basisSeasons = [...r.counted].reverse();
        r.basisMinutes = minutes;
        r.basisMatches = apps;
        if (counted.length === 1) {
          r.status = "needs_second_season";
          return;
        }
        r.career = careerRecord(counted);
        r.status = "eligible";
        pool.push({ id: String(idx), value: r.career as number, r });
      });
    const held = defenceTier(pool);
    for (const e of pool) {
      if (held.has(e.id)) {
        e.r.status = "tier";
        e.r.tier = 1;
      }
    }

    // ── Entries (section 10) ────────────────────────────────────────────────
    const entries = new Map<string, TierEntry[]>();
    for (const [slug, list] of rated) {
      entries.set(
        slug,
        list.map((r) => ({
          name: r.p.name,
          key: r.p.key,
          player_id: r.p.playerId,
          number: r.p.number,
          group: r.group,
          kind: r.kind,
          status: r.status,
          tier: r.tier,
          reason: r.reason,
          basis: {
            minutes: r.basisMinutes,
            matches: r.basisMatches,
            seasons: r.basisSeasons,
            class_year: r.p.roster?.class_year?.trim() ? (r.p.roster.class_year as string) : null,
          },
        })),
      );
    }

    results.push({
      season,
      gender,
      teams: scored.teams,
      rated: all,
      entries,
      fold: counts,
      measures,
    });
  }
  return { gender, goals, shots, seasons: results };
}
