// The whole contract for one gender, every season at once: the opponent model
// is fitted jointly across the seasons (section 2), and a player's earlier
// seasons at the programme feed sections 5 and 8. Pure over loaded files: the
// CLI (build.ts) reads the data home and writes what this returns.

import type { Gender, MatchPlayerLine, MatchTeam, Player, StatsFile } from "../../src/lib/model.ts";
import { isGoalPlay } from "../../src/lib/plays.ts";
import type {
  IncompleteReason,
  PositionGroup,
  TierEntry,
  TierKind,
  TierStatus,
} from "../../src/lib/tiers.ts";
import { foldKey } from "../../src/lib/tiers.ts";
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
import { isPenaltyGoalText, readPenalties } from "./penalties.ts";
import {
  contradicts,
  type PlayerSeason,
  playerSeasons,
  rosterEntryFor,
  type Sheet,
  type SheetLine,
  sameName,
  splitSpellingPairs,
} from "./players.ts";
import { boxGroupTied, groupOf, group as groupOfLabel } from "./position.ts";
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
import { type TeamMatch, teamTotals } from "./teams.ts";
import { scoreTeams, type TeamSeason } from "./workload.ts";

export const FIRST_SEASON = 2022;
export const LAST_SEASON = 2026;

/** One player-season after every section has run. */
export interface Rated {
  p: PlayerSeason;
  roster: Player | null;
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

export interface PenaltyGap {
  programme: string;
  name: string;
  playByPlay: number;
  stats: number;
}

/** What the build log reports beyond the artifact. */
export interface Measures {
  boundaries: { first: number; second: number } | null;
  penaltyPlays: number;
  penaltyUnattributed: number;
  penaltyGoalPlays: number;
  goalPlays: number;
  keeperOnlyLines: number;
  linesSkippedNoMinutes: number;
  multiIdPlayers: number;
  twiceOnOneSheet: number;
  boxGroupTies: number;
  rosterLabelUnrecognised: number;
  noRosterEntry: number;
  splitPairs: number;
  contradictedLinks: number;
  ambiguousLinks: number;
  noMinutesProgrammes: string[];
  teamsWithoutMatches: string[];
  /** Collected programme-days holding two or more physical matches: one match
   *  published under two opponent slugs ("concordia" and "concordia-irvine"),
   *  which no grouping by slug pair can merge. */
  sameDayDoubles: string[];
  penaltyCompared: number;
  penaltyGaps: PenaltyGap[];
  penaltyNoStatsLine: number;
  penaltyStatsUnpublished: number;
}

const integer = (x: number | null | undefined): x is number =>
  typeof x === "number" && Number.isInteger(x);

/** The model rows of one season's matches: one row per side per match where
 *  y is an integer. */
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
    const hs = m.homeTeam?.shots;
    const as = m.awayTeam?.shots;
    if (integer(hs)) shots.push({ attack: home, defend: away, y: hs, venue: hv });
    if (integer(as)) shots.push({ attack: away, defend: home, y: as, venue: av });
  }
  return { goals, shots };
}

/** A side's box-score lines: every players[] line, plus a keepers[] line whose
 *  name the players[] table does not carry (the keeper is otherwise listed in
 *  both, and counting both would count their minutes twice). */
export function sideLines(team: MatchTeam): { lines: MatchPlayerLine[]; keeperOnly: number } {
  const players = team.players ?? [];
  const names = new Set(players.map((l) => l.name));
  const extra = (team.keepers ?? []).filter((k) => !names.has(k.name));
  return { lines: [...players, ...extra], keeperOnly: extra.length };
}

function toSheetLine(
  line: MatchPlayerLine,
  pen: { goals: number; attempts: number } | undefined,
): SheetLine {
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
    penGoals: pen?.goals ?? 0,
    penAttempts: pen?.attempts ?? 0,
  };
}

/** The stats file's line for a player-season: by page id, else by folded name
 *  with the shirt number settling a tie. */
function statsLineFor(p: PlayerSeason, stats: StatsFile | null) {
  const team = stats?.teams[p.programme];
  if (!team) return null;
  const byId = team.players.filter((x) => x.player_id !== undefined && p.ids.has(x.player_id));
  const pool = byId.length > 0 ? byId : team.players.filter((x) => foldKey(x.name) === p.key);
  if (pool.length === 1) return pool[0] ?? null;
  const byNumber = pool.filter((x) => x.number !== undefined && p.numbers.has(x.number));
  return byNumber.length === 1 ? (byNumber[0] ?? null) : null;
}

const emptyMeasures = (): Measures => ({
  boundaries: null,
  penaltyPlays: 0,
  penaltyUnattributed: 0,
  penaltyGoalPlays: 0,
  goalPlays: 0,
  keeperOnlyLines: 0,
  linesSkippedNoMinutes: 0,
  multiIdPlayers: 0,
  twiceOnOneSheet: 0,
  boxGroupTies: 0,
  rosterLabelUnrecognised: 0,
  noRosterEntry: 0,
  splitPairs: 0,
  contradictedLinks: 0,
  ambiguousLinks: 0,
  noMinutesProgrammes: [],
  teamsWithoutMatches: [],
  sameDayDoubles: [],
  penaltyCompared: 0,
  penaltyGaps: [],
  penaltyNoStatsLine: 0,
  penaltyStatsUnpublished: 0,
});

export interface GenderResult {
  gender: Gender;
  goals: Factors;
  shots: Factors;
  seasons: SeasonResult[];
}

/** Every season of one gender. `data` holds each season's conference files. */
export function computeGender(
  gender: Gender,
  data: ReadonlyMap<number, readonly ConferenceSeason[]>,
): GenderResult {
  const seasons = [...data.keys()].sort((a, b) => a - b);

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

    // Collected programmes this season, and the files each one's lives in.
    const memberOf = new Map<string, ConferenceSeason>();
    for (const c of confs) {
      for (const p of c.fixtures.programmes) if (!memberOf.has(p.slug)) memberOf.set(p.slug, c);
    }

    // ── Sheets and team matches per collected programme ─────────────────────
    const sheets = new Map<string, Sheet[]>();
    const teamMatches = new Map<string, TeamMatch[]>();
    for (const slug of memberOf.keys()) {
      sheets.set(slug, []);
      teamMatches.set(slug, []);
    }
    for (const m of matches) {
      const hv: Venue = m.neutral ? "neutral" : "home";
      const sides = [
        {
          slug: m.home,
          opp: m.away,
          venue: hv,
          team: m.homeTeam,
          oppTeam: m.awayTeam,
          gf: m.homeGoals,
          ga: m.awayGoals,
        },
        {
          slug: m.away,
          opp: m.home,
          venue: otherVenue(hv),
          team: m.awayTeam,
          oppTeam: m.homeTeam,
          gf: m.awayGoals,
          ga: m.homeGoals,
        },
      ];
      let pens: ReturnType<typeof readPenalties> | null = null;
      if (m.detail) {
        for (const play of m.detail.plays ?? []) {
          if (isGoalPlay(play)) measures.goalPlays++;
          if (play.type === "penalty" && isPenaltyGoalText(play.text)) measures.penaltyGoalPlays++;
        }
        pens = readPenalties(m.detail);
        measures.penaltyPlays += pens.credits.length + pens.unattributed.length;
        measures.penaltyUnattributed += pens.unattributed.length;
      }
      for (const side of sides) {
        const tm = teamMatches.get(side.slug);
        if (!tm) continue; // not a collected programme
        tm.push({
          opponent: teamId(season, side.opp),
          venue: side.venue,
          goalsFor: side.gf,
          goalsAgainst: side.ga,
          shotsFor: integer(side.team?.shots) ? (side.team?.shots as number) : null,
          shotsAgainst: integer(side.oppTeam?.shots) ? (side.oppTeam?.shots as number) : null,
        });
        if (!side.team || !m.detail) continue;
        const sideIndex = m.detail.teams.indexOf(side.team);
        const credit = new Map<MatchPlayerLine, { goals: number; attempts: number }>();
        for (const c of pens?.credits ?? []) {
          if (c.side !== sideIndex) continue;
          const t = credit.get(c.line) ?? { goals: 0, attempts: 0 };
          t.attempts += 1;
          if (c.goal) t.goals += 1;
          credit.set(c.line, t);
        }
        const { lines, keeperOnly } = sideLines(side.team);
        measures.keeperOnlyLines += keeperOnly;
        const sheetLines = lines.map((l) => toSheetLine(l, credit.get(l)));
        measures.linesSkippedNoMinutes += sheetLines.filter((l) => l.minutes === null).length;
        (sheets.get(side.slug) as Sheet[]).push({
          identity: m.identity,
          date: m.date,
          opponent: teamId(season, side.opp),
          venue: side.venue,
          lines: sheetLines,
        });
      }
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

    // ── Sections 6 and 7 ─────────────────────────────────────────────────────
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
      const ps = playerSeasons(slug, season, list, scale);
      if (ps.length === 0) continue;
      const conf = memberOf.get(slug) as ConferenceSeason;
      const roster = conf.rosters?.rosters[slug]?.players ?? [];
      const noMinutes = !ps.some((p) => p.printedMinutes);
      if (noMinutes) measures.noMinutesProgrammes.push(slug);
      const identity = new Set<number>();
      const pairs = splitSpellingPairs(ps);
      measures.splitPairs += pairs.length;
      for (const [i, j] of pairs) {
        identity.add(i);
        identity.add(j);
      }
      for (const p of ps) {
        if (p.ids.size > 1) measures.multiIdPlayers++;
        if (p.sheets.size < p.lineCount) measures.twiceOnOneSheet++;
      }
      const entries: Rated[] = ps.map((p, i) => {
        const entry = rosterEntryFor(p, roster);
        if (entry === null) measures.noRosterEntry++;
        else if (entry.position && groupOfLabel(entry.position) === null) {
          measures.rosterLabelUnrecognised++;
        }
        const g = groupOf(entry?.position, p.labels);
        if (groupOfLabel(entry?.position) === null && boxGroupTied(p.labels))
          measures.boxGroupTies++;
        const kind: TierKind | null =
          g === null ? null : isShootingGroup(g) ? "shooting_scoring" : "team_defence";
        const team = teamBySlug.get(slug);
        let reason: IncompleteReason | null = null;
        if (noMinutes) reason = "no_minutes";
        else if (g === null) reason = "no_position";
        else if (identity.has(i)) reason = "identity";
        else if (isDefenceGroup(g) && (team?.workload ?? null) === null) reason = "few_matches";
        return {
          p,
          roster: entry,
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
          regular: isRegular(g, p.minutes, team?.matches ?? 0),
          defence: null,
          basisSeasons: [season],
          basisMinutes: p.minutes,
          basisMatches: p.matches,
        };
      });
      rated.set(slug, entries);
    }
    ratedBySeason.set(season, rated);

    // ── The cross-season link (section 4) ───────────────────────────────────
    const before = ratedBySeason.get(season - 1);
    for (const [slug, list] of rated) {
      const earlier = before?.get(slug) ?? [];
      const earlierPs = earlier.map((r) => r.p);
      for (const r of list) {
        const sameKey = earlier.filter((e) => e.p.key === r.p.key).length;
        const prevP = sameName(r.p, earlierPs);
        if (prevP === null) {
          if (sameKey > 1) measures.ambiguousLinks++;
          continue;
        }
        const prev = earlier.find((e) => e.p === prevP) as Rated;
        if (contradicts(prev.roster, r.roster)) {
          measures.contradictedLinks++;
          continue;
        }
        r.previous = prev;
      }
    }

    // ── Section 5: shooting and scoring ─────────────────────────────────────
    const all = [...rated.values()].flat();
    for (const g of ["F", "M"] as const) {
      const pool = all.filter((r) => r.group === g && r.p.minutes >= COUNTS_MINUTES);
      const avg = groupAverage(pool.map((r) => r.threat as number));
      const eligible: { id: string; value: number; r: Rated }[] = [];
      all
        .filter((r) => r.group === g && r.status !== "incomplete")
        .forEach((r, idx) => {
          const prev = r.previous;
          const prevCounts = prev !== null && seasonCounts(prev.p.minutes, prev.group);
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
      .filter((r) => isDefenceGroup(r.group) && r.status !== "incomplete")
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

    // ── The penalty check (section 4) ───────────────────────────────────────
    for (const [slug, list] of rated) {
      const stats = (memberOf.get(slug) as ConferenceSeason).stats;
      for (const r of list) {
        const line = statsLineFor(r.p, stats);
        if (line === null) {
          if (r.p.penGoals > 0) measures.penaltyNoStatsLine++;
          continue;
        }
        if (line.penalty_goals === undefined) {
          if (r.p.penGoals > 0) measures.penaltyStatsUnpublished++;
          continue;
        }
        measures.penaltyCompared++;
        if (line.penalty_goals !== r.p.penGoals) {
          measures.penaltyGaps.push({
            programme: slug,
            name: r.p.name,
            playByPlay: r.p.penGoals,
            stats: line.penalty_goals,
          });
        }
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
            class_year: r.roster?.class_year?.trim() ? (r.roster.class_year as string) : null,
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
