// Every figure the pages render, derived here from the collected files and
// nowhere else. If a number cannot be recomputed from the data home it does
// not belong in this file, and therefore does not belong on a page.

import { site } from "../site.config.ts";
import type { CoverageFile } from "./coverage.ts";
import { coverageKey } from "./coverage.ts";
import { loadCoverage, loadFixtures, loadMatches, loadRosters, loadStats } from "./data.ts";
import {
  classAbbr,
  dayNumber,
  dayOfMonth,
  dowIndex,
  monShort,
  positionLine,
  toISO,
} from "./format.ts";
import type {
  Fixture,
  FixturesFile,
  KeeperStats,
  MatchDetail,
  MatchesFile,
  Player,
  PlayerStats,
  Programme,
  RostersFile,
  StatsFile,
  TableRow,
} from "./model.ts";
import { computeTable, isPlayed } from "./model.ts";
import { type NameBook, nameBookFor } from "./names.ts";

export type Result = "W" | "D" | "L";

export interface Season {
  /** The conference's file key — `gac`, never printed, always the route. */
  key: string;
  fixtures: FixturesFile;
  rosters: RostersFile | null;
  stats: StatsFile | null;
  matches: MatchesFile | null;
  coverage: CoverageFile | null;
  names: NameBook;
  /** The date the site treats as today: the day the data was collected. */
  asOf: string;
  collectedAt: string;
}

const seasons = new Map<string, Season>();

export function loadSeason(key: string): Season {
  const hit = seasons.get(key);
  if (hit) return hit;
  const fixtures = loadFixtures(site.season, site.gender, key);
  const season: Season = {
    key,
    fixtures,
    rosters: loadRosters(site.season, site.gender, key),
    stats: loadStats(site.season, site.gender, key),
    matches: loadMatches(site.season, site.gender, key),
    coverage: loadCoverage(),
    names: nameBookFor(fixtures),
    asOf: site.asOf ?? fixtures.collected_at.slice(0, 10),
    collectedAt: fixtures.collected_at,
  };
  seasons.set(key, season);
  return season;
}

export const programmes = (s: Season): readonly Programme[] => s.fixtures.programmes;
export const memberSlugs = (s: Season): Set<string> =>
  new Set(s.fixtures.programmes.map((p) => p.slug));

/** A fixture has a scoreline only when both numbers were published. A final
 *  with no score is a real state, not a zero. */
export function hasScore(f: Fixture): f is Fixture & { home_score: number; away_score: number } {
  return typeof f.home_score === "number" && typeof f.away_score === "number";
}

/**
 * Whether a fixture belongs to the record at all.
 *
 * An exhibition is played, is marked final, and — for two Saint Mary's games —
 * even carries a scoreline, but it counts toward nothing: not the record, not
 * goals for or against, not the table, and not the conference's silences. A
 * pre-season friendly with no score published is not a programme withholding a
 * result; it is a programme that was never going to print one, and counting it
 * as a silence puts a fault on a page where none exists.
 *
 * Exhibitions are dropped from every figure and named where they are dropped —
 * never quietly deleted from the fixture list.
 *
 * KNOWN AND DELIBERATE: `match_type` exists only from 2026. It arrived with
 * the completion-aware parser, and all thirteen marks in the data home are in
 * the three 2026 files — every one of 2,535 earlier fixtures is unmarked. So
 * this predicate is silently incomplete on historical seasons, and a career
 * table on a player sheet may count an unmarked friendly in a pre-2026 row.
 * There is nothing to do about that here: the site is honest to what the
 * collector recorded, and when the backfill gains exhibition detection these
 * figures heal with no change to this file. Do not "fix" it with a heuristic —
 * guessing which old fixtures were friendlies would replace a known gap with
 * an invented number.
 */
export const isCountable = (f: Fixture): boolean => f.match_type !== "exhibition";

export const isExhibition = (f: Fixture): boolean => f.match_type === "exhibition";

export const isScored = (f: Fixture): boolean => isCountable(f) && isPlayed(f) && hasScore(f);

export function byKickoff(a: Fixture, b: Fixture): number {
  return a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
}

export function fixturesOf(s: Season, slug: string): Fixture[] {
  return s.fixtures.fixtures.filter((f) => f.home === slug || f.away === slug).sort(byKickoff);
}

/** One side's view of a fixture: which end they were on, and how it went. */
export interface SideResult {
  fixture: Fixture;
  opponent: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: Result;
}

export function resultsOf(s: Season, slug: string): SideResult[] {
  const out: SideResult[] = [];
  for (const f of fixturesOf(s, slug)) {
    if (!isScored(f) || !hasScore(f)) continue;
    const home = f.home === slug;
    const gf = home ? f.home_score : f.away_score;
    const ga = home ? f.away_score : f.home_score;
    out.push({
      fixture: f,
      opponent: home ? f.away : f.home,
      home,
      goalsFor: gf,
      goalsAgainst: ga,
      result: gf > ga ? "W" : gf < ga ? "L" : "D",
    });
  }
  return out;
}

export const formOf = (s: Season, slug: string, limit = 5): Result[] =>
  resultsOf(s, slug)
    .slice(-limit)
    .map((r) => r.result);

export interface Record {
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  played: number;
}

export function recordOf(s: Season, slug: string): Record {
  const rec: Record = { won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, played: 0 };
  for (const r of resultsOf(s, slug)) {
    rec.played++;
    rec.goalsFor += r.goalsFor;
    rec.goalsAgainst += r.goalsAgainst;
    if (r.result === "W") rec.won++;
    else if (r.result === "D") rec.drawn++;
    else rec.lost++;
  }
  return rec;
}

/** The conference's aggregate record against everyone who is not in it —
 *  every scored fixture with exactly one member side. */
export function outsideRecord(s: Season): Record {
  const members = memberSlugs(s);
  const rec: Record = { won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, played: 0 };
  for (const f of s.fixtures.fixtures) {
    if (!isScored(f) || !hasScore(f)) continue;
    const home = members.has(f.home);
    const away = members.has(f.away);
    if (home === away) continue; // both members, or neither: not "us vs them"
    const gf = home ? f.home_score : f.away_score;
    const ga = home ? f.away_score : f.home_score;
    rec.played++;
    rec.goalsFor += gf;
    rec.goalsAgainst += ga;
    if (gf > ga) rec.won++;
    else if (gf < ga) rec.lost++;
    else rec.drawn++;
  }
  return rec;
}

export const table = (s: Season): TableRow[] => computeTable(s.fixtures);

/** Goals each member has scored, most first. Non-conference by default: before
 *  the table opens, that is the only football there has been. */
export function goalsForByProgramme(
  s: Season,
  scope: "non-conference" | "all" = "non-conference",
): { slug: string; goals: number; conceded: number }[] {
  const members = memberSlugs(s);
  const tally = new Map<string, { goals: number; conceded: number }>();
  for (const p of s.fixtures.programmes) tally.set(p.slug, { goals: 0, conceded: 0 });
  for (const f of s.fixtures.fixtures) {
    if (!isScored(f) || !hasScore(f)) continue;
    const bothMembers = members.has(f.home) && members.has(f.away);
    if (scope === "non-conference" && bothMembers) continue;
    const home = tally.get(f.home);
    if (home) {
      home.goals += f.home_score;
      home.conceded += f.away_score;
    }
    const away = tally.get(f.away);
    if (away) {
      away.goals += f.away_score;
      away.conceded += f.home_score;
    }
  }
  return [...tally.entries()]
    .map(([slug, t]) => ({ slug, ...t }))
    .sort((a, b) => b.goals - a.goals || a.slug.localeCompare(b.slug));
}

/** True once any conference fixture has been played and scored — the table
 *  only means something after that. */
export const tableIsLive = (s: Season): boolean => table(s).some((r) => r.played > 0);

/** The first date two member sides meet in a fixture that counts. */
export function conferenceOpensOn(s: Season): string | null {
  const members = memberSlugs(s);
  const dates = s.fixtures.fixtures
    .filter((f) => f.conference_game !== false && members.has(f.home) && members.has(f.away))
    .map((f) => f.date)
    .sort();
  return dates[0] ?? null;
}

export const playedCount = (s: Season): number =>
  s.fixtures.fixtures.filter((f) => isCountable(f) && isPlayed(f)).length;
/** Played AND scored — the fixtures any figure on the page can rest on. */
export const scoredCount = (s: Season): number => s.fixtures.fixtures.filter(isScored).length;
export const fixtureCount = (s: Season): number => s.fixtures.fixtures.filter(isCountable).length;

/** Exhibitions, which every figure above leaves out. Named, not hidden. */
export const exhibitionsOf = (s: Season, slug?: string): Fixture[] =>
  s.fixtures.fixtures
    .filter(isExhibition)
    .filter((f) => slug === undefined || f.home === slug || f.away === slug)
    .sort(byKickoff);

/**
 * The counts a page may print, and the vocabulary they are printed in.
 *
 * "Played" is reserved for a final with a published score. A final with no
 * score is a SILENT FINAL, counted beside the played figure and never folded
 * into it — the difference between a match that happened and a match a
 * programme told us about is the whole point of the site. Exhibitions are
 * outside all of it (see isCountable).
 *
 * Every count on a page comes from here, so no two surfaces can disagree about
 * what "played" means.
 */
export interface SeasonCounts {
  played: number;
  silentFinals: number;
  gaps: number;
  total: number;
}

export function seasonCounts(s: Season): SeasonCounts {
  const u = unresolved(s);
  return {
    played: scoredCount(s),
    silentFinals: u.finalsWithoutScore.length,
    gaps: boxScoreGaps(s).length,
    total: fixtureCount(s),
  };
}

/** The same counts for one programme's own ledger. */
export function programmeCounts(s: Season, slug: string): SeasonCounts {
  const own = s.fixtures.fixtures.filter(
    (f) => isCountable(f) && (f.home === slug || f.away === slug),
  );
  const gapIds = new Set(boxScoreGaps(s).map((g) => g.fixtureId));
  return {
    played: own.filter(isScored).length,
    silentFinals: own.filter((f) => isPlayed(f) && !hasScore(f)).length,
    gaps: own.filter((f) => gapIds.has(f.id)).length,
    total: own.length,
  };
}

/** The two silences the design names separately: a game the site marked
 *  finished but never scored, and a game whose date has passed with the site
 *  still calling it scheduled. */
export interface Unresolved {
  finalsWithoutScore: Fixture[];
  pastDateNoResult: Fixture[];
  total: number;
}

export function unresolved(s: Season): Unresolved {
  const finalsWithoutScore: Fixture[] = [];
  const pastDateNoResult: Fixture[] = [];
  for (const f of s.fixtures.fixtures) {
    if (!isCountable(f)) continue;
    if (isPlayed(f) && !hasScore(f)) finalsWithoutScore.push(f);
    else if (!isPlayed(f) && f.status === "scheduled" && f.date < s.asOf) pastDateNoResult.push(f);
  }
  finalsWithoutScore.sort(byKickoff);
  pastDateNoResult.sort(byKickoff);
  return {
    finalsWithoutScore,
    pastDateNoResult,
    total: finalsWithoutScore.length + pastDateNoResult.length,
  };
}

/**
 * Matches with a published result whose box score the collector could not
 * reach, each with the reason it gave.
 *
 * The collector's `missing` map is wider than that: it also records the
 * exhibitions it skipped and the finals that never carried a score. Neither
 * is a gap. An exhibition is outside the record entirely, and a final with no
 * score is already named — as a silent final, counted beside the played
 * figure — so counting it here again puts the same fixture in a coverage line
 * twice and makes the site look blinder than it is.
 *
 * A gap is where Touchline has the RESULT but not the DETAIL. That is the
 * only case nothing else on the page names.
 */
export interface BoxScoreGap {
  fixtureId: string;
  reason: string;
  fixture: Fixture | undefined;
  /** "Aug 27 · Harding v Delta State" — the gap named the way a reader
   *  recognises a match, for the disclosure that lists them. */
  label: string;
}

export function boxScoreGaps(s: Season): BoxScoreGap[] {
  const byId = new Map(s.fixtures.fixtures.map((f) => [f.id, f]));
  return Object.entries(s.matches?.missing ?? {})
    .filter(([fixtureId]) => {
      const f = byId.get(fixtureId);
      return f !== undefined && isScored(f);
    })
    .map(([fixtureId, reason]) => {
      const fixture = byId.get(fixtureId);
      return {
        fixtureId,
        reason,
        fixture,
        label: fixture
          ? `${monShort(fixture.date)} ${dayOfMonth(fixture.date)} · ${s.names.name(fixture.home)} v ${s.names.name(fixture.away)}`
          : fixtureId,
      };
    });
}

export function coverageFor(
  s: Season,
  programme: string,
): { schedule?: string; roster?: string; stats?: string; matches?: string } {
  const cells = s.coverage?.cells;
  if (!cells) return {};
  const at = (layer: "schedule" | "roster" | "stats" | "matches") =>
    cells[coverageKey(s.fixtures.season, s.fixtures.gender, programme, layer)]?.state;
  return {
    schedule: at("schedule"),
    roster: at("roster"),
    stats: at("stats"),
    matches: at("matches"),
  };
}

export const lastResult = (s: Season, onOrBefore = s.asOf): Fixture | null => {
  const played = s.fixtures.fixtures
    .filter((f) => isScored(f) && f.date <= onOrBefore)
    .sort(byKickoff);
  return played[played.length - 1] ?? null;
};

export const nextFixture = (s: Season, onOrAfter = s.asOf): Fixture | null => {
  const ahead = s.fixtures.fixtures
    .filter((f) => f.status === "scheduled" && f.date >= onOrAfter)
    .sort(byKickoff);
  return ahead[0] ?? null;
};

/** Every scored fixture on the most recent day that produced one. */
export function latestResults(s: Season, onOrBefore = s.asOf): Fixture[] {
  const last = lastResult(s, onOrBefore);
  if (!last) return [];
  return s.fixtures.fixtures.filter((f) => isScored(f) && f.date === last.date).sort(byKickoff);
}

/** Every fixture on the next day that has one. */
export function upcomingFixtures(s: Season, onOrAfter = s.asOf): Fixture[] {
  const next = nextFixture(s, onOrAfter);
  if (!next) return [];
  return s.fixtures.fixtures
    .filter((f) => f.status === "scheduled" && f.date === next.date)
    .sort(byKickoff);
}

// ── The season as weeks ──────────────────────────────────────────────────────
// A matchweek is a week that carries at least one fixture. Weeks run Sunday to
// Saturday, the college convention, and a week belongs to the month of its
// first fixture — so a week straddling December is a December week.

export interface Matchweek {
  index: number;
  startISO: string;
  month: string;
  fixtures: Fixture[];
  state: "past" | "current" | "future";
}

function weekStart(iso: string): string {
  return toISO(dayNumber(iso) - dowIndex(iso));
}

export function matchweeks(s: Season): Matchweek[] {
  const byWeek = new Map<string, Fixture[]>();
  for (const f of s.fixtures.fixtures) {
    const k = weekStart(f.date);
    const list = byWeek.get(k);
    if (list) list.push(f);
    else byWeek.set(k, [f]);
  }
  const current = weekStart(s.asOf);
  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([startISO, list], i) => {
      const sorted = list.sort(byKickoff);
      return {
        index: i + 1,
        startISO,
        month: monShort((sorted[0] as Fixture).date).toUpperCase(),
        fixtures: sorted,
        state:
          startISO === current
            ? ("current" as const)
            : startISO < current
              ? ("past" as const)
              : ("future" as const),
      };
    });
}

export interface SeasonWindow {
  firstISO: string;
  lastISO: string;
  weekIndex: number | null;
  weekCount: number;
}

export function seasonWindow(s: Season): SeasonWindow {
  const weeks = matchweeks(s);
  const dates = s.fixtures.fixtures.map((f) => f.date).sort();
  const current = weeks.find((w) => w.state === "current");
  return {
    firstISO: dates[0] ?? s.asOf,
    lastISO: dates[dates.length - 1] ?? s.asOf,
    weekIndex: current?.index ?? null,
    weekCount: weeks.length,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** Fixture ids carry colons (`sidearm:harding:15273`); URLs should not. */
export const matchSlug = (fixtureId: string): string =>
  fixtureId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every internal link goes through the deploy base, so the same build serves
 *  from a domain root and from a project page at /<repo>/ alike. Guarded
 *  because this module is also imported by the journal CLI, outside Vite. */
const BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");
const withBase = (path: string): string => `${BASE}${path}`;

export const seasonHref = (key: string): string => withBase(`/${key}/`);
export const teamHref = (key: string, slug: string): string => withBase(`/${key}/team/${slug}/`);

/**
 * Where a programme's team page actually lives.
 *
 * A match report names both sides, but only one of them is necessarily a
 * member of the conference whose pages you are reading. Ecclesia appears in a
 * GAC report and has no GAC team page; UT Tyler appears in one and has an LSC
 * page. Linking both sides to the current conference sends readers to a 404,
 * so the slug is resolved against every configured conference and an opponent
 * that belongs to none gets no link affordance at all.
 */
const memberIndexes = new Map<string, Map<string, string>>();

function memberIndex(season: number, gender: string): Map<string, string> {
  const cacheKey = `${season}-${gender}`;
  const cached = memberIndexes.get(cacheKey);
  if (cached) return cached;
  const index = new Map<string, string>();
  for (const key of site.conferences) {
    try {
      for (const p of loadFixtures(season, gender, key).programmes) {
        if (!index.has(p.slug)) index.set(p.slug, key);
      }
    } catch {
      // A conference the data home has not collected contributes no members.
    }
  }
  memberIndexes.set(cacheKey, index);
  return index;
}

/** The team page for this programme in whichever configured conference has it
 *  as a member, or null when none does. */
export function teamPageHref(s: Season, slug: string): string | null {
  const key = memberIndex(s.fixtures.season, s.fixtures.gender).get(slug);
  return key ? teamHref(key, slug) : null;
}
export const matchHref = (key: string, fixtureId: string): string =>
  withBase(`/${key}/match/${matchSlug(fixtureId)}/`);

export function matchDetailOf(s: Season, fixtureId: string): MatchDetail | null {
  return s.matches?.matches[fixtureId] ?? null;
}

export function fixtureById(s: Season, id: string): Fixture | null {
  return s.fixtures.fixtures.find((f) => f.id === id) ?? null;
}

/** The canonical address of a fixture: `"{date} {home-slug} v {away-slug}"`. */
export const canonicalFixtureRef = (f: Fixture): string => `${f.date} ${f.home} v ${f.away}`;

export interface FixtureRefMatch {
  fixture: Fixture | null;
  canonical: string | null;
  /** The ref named one real fixture, but not in canonical form. */
  normalized: boolean;
  /** More than one fixture answers to this ref: not resolvable. */
  ambiguous: boolean;
}

/** Resolve a journal's fixture reference.
 *
 *  Anything after the away slug — a scoreline, a kickoff time — is the writer's
 *  annotation, not part of the address, so it is ignored rather than treated as
 *  a failure. Strictness is kept where it matters: a ref that answers to no
 *  fixture, or to more than one, does not resolve. */
export function matchFixtureRef(s: Season, ref: string | undefined): FixtureRefMatch {
  const none: FixtureRefMatch = {
    fixture: null,
    canonical: null,
    normalized: false,
    ambiguous: false,
  };
  if (!ref) return none;
  const m = /^(\d{4}-\d{2}-\d{2})\s+(\S+)\s+v\s+(\S+)/.exec(ref.trim());
  if (!m) return none;
  const hits = s.fixtures.fixtures.filter(
    (f) => f.date === m[1] && f.home === m[2] && f.away === m[3],
  );
  const fixture = hits.length === 1 ? (hits[0] as Fixture) : null;
  if (!fixture) return { ...none, ambiguous: hits.length > 1 };
  const canonical = canonicalFixtureRef(fixture);
  return { fixture, canonical, normalized: canonical !== ref.trim(), ambiguous: false };
}

export const resolveFixtureRef = (s: Season, ref: string | undefined): Fixture | null =>
  matchFixtureRef(s, ref).fixture;

export type { Fixture, FixturesFile, MatchDetail, MatchesFile, Programme, StatsFile, TableRow };

// ── One programme's season ───────────────────────────────────────────────────

export interface SquadMember {
  player: Player;
  line: ReturnType<typeof positionLine>;
  stats: PlayerStats | undefined;
  keeper: KeeperStats | undefined;
  /** Not on this programme's roster the season before. Absent previous data
   *  means nobody is marked new — an unknown is not a claim. */
  isNew: boolean;
  /** Shots for an outfielder, saves for a keeper: what the line lists them by. */
  contribution: number;
}

/** Names on this programme's roster the season before, or null when that
 *  season was never collected. */
export function previousRoster(s: Season, slug: string): Set<string> | null {
  const prev = loadRosters(s.fixtures.season - 1, s.fixtures.gender, s.key);
  const roster = prev?.rosters[slug];
  return roster ? new Set(roster.players.map((p) => p.name)) : null;
}

export function squadOf(s: Season, slug: string): SquadMember[] {
  const roster = s.rosters?.rosters[slug];
  if (!roster) return [];
  const team = s.stats?.teams[slug];
  const byName = new Map((team?.players ?? []).map((p) => [p.name, p]));
  const keepers = new Map((team?.keepers ?? []).map((k) => [k.name, k]));
  const before = previousRoster(s, slug);
  return roster.players.map((player) => {
    const stats = byName.get(player.name);
    const keeper = keepers.get(player.name);
    return {
      player,
      line: positionLine(player.position),
      stats,
      keeper,
      isNew: before ? !before.has(player.name) : false,
      contribution: keeper ? (keeper.saves ?? 0) : (stats?.shots ?? 0),
    };
  });
}

export interface SquadShape {
  size: number;
  returning: number | null;
  fresh: number | null;
}

export function squadShape(s: Season, slug: string): SquadShape {
  const squad = squadOf(s, slug);
  const before = previousRoster(s, slug);
  if (!before) return { size: squad.length, returning: null, fresh: null };
  const fresh = squad.filter((m) => m.isNew).length;
  return { size: squad.length, returning: squad.length - fresh, fresh };
}

/** The line the design colours, ordered by what the line is listed by, then by
 *  the order the programme printed its roster in. */
export function squadByLine(
  s: Season,
  slug: string,
  line: "GK" | "DEF" | "MID" | "FWD",
): SquadMember[] {
  const squad = squadOf(s, slug);
  return squad
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.line === line)
    .sort((a, b) => b.m.contribution - a.m.contribution || a.i - b.i)
    .map(({ m }) => m);
}

/** The keeper with the season's best published save percentage — the only
 *  keeper line the page can honestly call the goalkeeping story. */
export function leadKeeper(s: Season, slug: string): KeeperStats | null {
  const keepers = (s.stats?.teams[slug]?.keepers ?? []).filter((k) => (k.minutes ?? 0) > 0);
  if (keepers.length === 0) return null;
  return [...keepers].sort(
    (a, b) => (b.save_pct ?? 0) - (a.save_pct ?? 0) || (b.minutes ?? 0) - (a.minutes ?? 0),
  )[0] as KeeperStats;
}

/** This side's first fixture that counts in the conference table. */
export function conferenceOpenerOf(s: Season, slug: string): Fixture | null {
  const members = memberSlugs(s);
  return (
    fixturesOf(s, slug).find(
      (f) => f.conference_game !== false && members.has(f.home) && members.has(f.away),
    ) ?? null
  );
}

export function upcomingOf(s: Season, slug: string, withinDays = 14): Fixture[] {
  const horizon = toISO(dayNumber(s.asOf) + withinDays);
  return fixturesOf(s, slug).filter(
    (f) => isCountable(f) && f.status === "scheduled" && f.date >= s.asOf && f.date <= horizon,
  );
}

/** The conference's leading players by published season points — the honest
 *  stand-in for a journal's chosen names. Points is the NCAA convention the
 *  stats files already carry (2 × goals + assists), so nothing here is a new
 *  ranking invented for the page. */
export interface LeaderLine {
  player: string;
  programme: string;
  position: string | null;
  class: string | null;
  line: string;
}

/** A player's class year as the roster prints it, abbreviated. The journal may
 *  name it, but the roster already knows — so a journal that omits it costs the
 *  page nothing. */
export function playerClassOf(s: Season, programme: string, player: string): string | null {
  const bio = s.rosters?.rosters[programme]?.players.find((p) => p.name === player);
  return classAbbr(bio?.class_year);
}

export function conferenceLeaders(s: Season, limit = 3): LeaderLine[] {
  if (!s.stats) return [];
  const rosterOf = (slug: string) => s.rosters?.rosters[slug]?.players ?? [];
  const rows: { slug: string; p: PlayerStats; score: number }[] = [];
  for (const [slug, team] of Object.entries(s.stats.teams)) {
    if (!memberSlugs(s).has(slug)) continue;
    for (const p of team.players) {
      const score = (p.points ?? 0) * 1000 + (p.goals ?? 0) * 100 + (p.shots ?? 0);
      if (score === 0) continue;
      rows.push({ slug, p, score });
    }
  }
  rows.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  return rows.slice(0, limit).map(({ slug, p }) => {
    const bio = rosterOf(slug).find((r) => r.name === p.name);
    const parts = [
      p.goals ? `${p.goals} G` : null,
      p.assists ? `${p.assists} A` : null,
      p.shots ? `${p.shots} ${p.shots === 1 ? "shot" : "shots"}` : null,
    ].filter(Boolean);
    return {
      player: p.name,
      programme: slug,
      position: positionLine(bio?.position ?? undefined),
      class: classAbbr(bio?.class_year),
      line: parts.length ? parts.join(" · ") : `${p.gp ?? 0} appearances`,
    };
  });
}
