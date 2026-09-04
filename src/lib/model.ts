// Copyright 2026, Daniel Scholl
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

// ─────────────────────────────────────────────────────────────────────────────
// VENDORED, verbatim, from keelson-rib-touchline `src/model.ts`.
//
// The rib is the authority for these shapes; this site is a reader. It is
// vendored rather than imported so the build has no runtime dependency on the
// rib — the only contract between them is the JSON in the data home. When the
// rib's model changes, re-copy this file; do not edit it here.
//
// Site-specific derivations live in `derive.ts`, never in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// The file contract between the collection pipeline (writer) and the board
// (reader). These files are the consumer's own data: plain JSON in their
// project, readable without a database, and portable without Git.
//
// Both files are versioned by a `schema` string. A reader that meets an
// unknown schema says so rather than guessing — a board that silently renders
// a half-understood file is worse than one that reports it cannot.
// ─────────────────────────────────────────────────────────────────────────────

export const FIXTURES_SCHEMA = "touchline.fixtures/2";
export const ROSTERS_SCHEMA = "touchline.rosters/1";
export const STATS_SCHEMA = "touchline.stats/1";
export const MATCHES_SCHEMA = "touchline.matches/1";

export const genderSchema = z.enum(["men", "women"]);
export type Gender = z.infer<typeof genderSchema>;

/** A fixture's lifecycle. `scheduled` is the pre-season resting state. */
export const fixtureStatusSchema = z.enum(["scheduled", "live", "final", "postponed", "cancelled"]);
export type FixtureStatus = z.infer<typeof fixtureStatusSchema>;

export const programmeSchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    conference: z.string().min(1),
    abbr: z.string().min(1).max(6).optional(),
  })
  .strict();
export type Programme = z.infer<typeof programmeSchema>;

export const fixtureSchema = z
  .object({
    id: z.string().min(1),
    /** ISO date, YYYY-MM-DD. Local to the venue; we never invent a timezone. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Local kickoff, HH:MM 24h. Absent means the source published no time. */
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    home: z.string().min(1),
    away: z.string().min(1),
    venue: z.string().optional(),
    status: fixtureStatusSchema,
    /** Scores are null until played — never 0, which is a real scoreline. */
    home_score: z.number().int().nullable().optional(),
    away_score: z.number().int().nullable().optional(),
    /** Present only when the site itself marks the game as one the teams do
     *  not count — "(Exhibition)" in the opponent's published title. Absence
     *  means a countable game. */
    match_type: z.enum(["exhibition"]).optional(),
    /** Whether the result counts in the conference table. */
    conference_game: z.boolean().optional(),
    /** Present only when the flag was NOT published by a schedule page —
     *  e.g. "derived:membership" where neither side's theme marks conference
     *  games. Absence means the publisher's own marking. */
    conference_game_source: z.string().optional(),
    /** Minute, for a live fixture. */
    clock: z.string().optional(),
    source_url: z.string().optional(),
    /** touchline.fixtures/2 (contract changelog 2026-09-02): true when the
     *  schedule page itself marks a neutral site. Home and away stay as
     *  published. On every other row the key is absent; the contract promises
     *  no other value, so no other value is admitted. */
    neutral: z.literal(true).optional(),
    /** touchline.fixtures/2 (owner's ruling, tl-wyv): the side AWARDED a
     *  forfeit. Status stays final. The scores are the printed ones when the
     *  host printed them (Upper Iowa 2024 game 9017 prints "W, 2-2" beside
     *  "Win by forfeit"), else 1-0 to the awarded side; the award decides the
     *  result whatever the score says. Absent on every other row. */
    forfeit: z.enum(["home", "away"]).optional(),
  })
  .strict();
export type Fixture = z.infer<typeof fixtureSchema>;

/** Which side a fixture went to, or null while it has no score. A forfeit is
 *  decided by the award, whatever score was printed beside it: 2-2 with
 *  forfeit "home" is a home win. Every record on the site reads this and
 *  never the raw comparison, so a forfeit cannot be read as a draw. */
export function outcome(f: Fixture): "home" | "away" | "draw" | null {
  if (f.forfeit) return f.forfeit;
  if (typeof f.home_score !== "number" || typeof f.away_score !== "number") return null;
  if (f.home_score > f.away_score) return "home";
  if (f.away_score > f.home_score) return "away";
  return "draw";
}

/** A forfeit's goals are nobody's: the printed figures stay on the page,
 *  marked, and count toward no tally. */
export const isForfeit = (f: Fixture): boolean => f.forfeit !== undefined;

export const fixturesFileSchema = z
  .object({
    schema: z.literal(FIXTURES_SCHEMA),
    season: z.number().int(),
    gender: genderSchema,
    conference: z.string().min(1),
    collected_at: z.string().min(1),
    /** True when membership had to be carried past its authored windows. */
    membership_extrapolated: z.boolean().optional(),
    /** How each fixture's conference flag was determined: published by the
     *  schedule page for v1, or explicitly named as derived for older data. */
    conference_game_source: z.string().optional(),
    programmes: z.array(programmeSchema),
    fixtures: z.array(fixtureSchema),
    /** Programmes whose schedule could not be collected. Never omit silently. */
    missing: z.array(z.string()).optional(),
  })
  .strict();
export type FixturesFile = z.infer<typeof fixturesFileSchema>;

export const playerSchema = z
  .object({
    /** Jersey number as printed — a string, because "00" and "0" differ. */
    number: z.string().optional(),
    name: z.string().min(1),
    position: z.string().optional(),
    class_year: z.string().optional(),
    height: z.string().optional(),
    /** As printed, e.g. "165 lbs". Only some themes publish it. */
    weight: z.string().optional(),
    hometown: z.string().optional(),
    source_url: z.string().optional(),
  })
  .strict();
export type Player = z.infer<typeof playerSchema>;

export const rosterSchema = z
  .object({
    programme: z.string().min(1),
    source_url: z.string().optional(),
    players: z.array(playerSchema),
  })
  .strict();
export type Roster = z.infer<typeof rosterSchema>;

export const rostersFileSchema = z
  .object({
    schema: z.literal(ROSTERS_SCHEMA),
    season: z.number().int(),
    gender: genderSchema,
    collected_at: z.string().min(1),
    rosters: z.record(z.string(), rosterSchema),
    /** Programmes whose roster page yielded nothing. Named, never dropped. */
    missing: z.array(z.string()).optional(),
  })
  .strict();
export type RostersFile = z.infer<typeof rostersFileSchema>;

/** One outfield player's cumulative season line, as the site published it.
 *  Every stat is optional — a site prints what its stat crew recorded, and an
 *  absent number is "not published", never zero. */
export const playerStatsSchema = z
  .object({
    name: z.string().min(1),
    /** SideArm's own player id — the join key to the roster's bio URL. */
    player_id: z.string().optional(),
    number: z.string().optional(),
    bio_url: z.string().optional(),
    gp: z.number().int().optional(),
    gs: z.number().int().optional(),
    minutes: z.number().int().optional(),
    goals: z.number().int().optional(),
    assists: z.number().int().optional(),
    /** 2 × goals + assists, the NCAA points convention. */
    points: z.number().int().optional(),
    shots: z.number().int().optional(),
    shot_pct: z.number().optional(),
    sog: z.number().int().optional(),
    sog_pct: z.number().optional(),
    game_winners: z.number().int().optional(),
    yellow: z.number().int().optional(),
    red: z.number().int().optional(),
    penalty_goals: z.number().int().optional(),
    penalty_attempts: z.number().int().optional(),
  })
  .strict();
export type PlayerStats = z.infer<typeof playerStatsSchema>;

/** A goalkeeper's cumulative season line. Keepers also appear in the outfield
 *  table when they took a shot; this line is the goalkeeping story. */
export const keeperStatsSchema = z
  .object({
    name: z.string().min(1),
    player_id: z.string().optional(),
    number: z.string().optional(),
    bio_url: z.string().optional(),
    gp: z.number().int().optional(),
    gs: z.number().int().optional(),
    minutes: z.number().int().optional(),
    goals_against: z.number().int().optional(),
    gaa: z.number().optional(),
    saves: z.number().int().optional(),
    save_pct: z.number().optional(),
    wins: z.number().int().optional(),
    losses: z.number().int().optional(),
    ties: z.number().int().optional(),
    shutouts: z.number().int().optional(),
    shots_faced: z.number().int().optional(),
  })
  .strict();
export type KeeperStats = z.infer<typeof keeperStatsSchema>;

export const teamStatsSchema = z
  .object({
    programme: z.string().min(1),
    source_url: z.string().optional(),
    players: z.array(playerStatsSchema),
    keepers: z.array(keeperStatsSchema),
  })
  .strict();
export type TeamStats = z.infer<typeof teamStatsSchema>;

export const statsFileSchema = z
  .object({
    schema: z.literal(STATS_SCHEMA),
    season: z.number().int(),
    gender: genderSchema,
    collected_at: z.string().min(1),
    teams: z.record(z.string(), teamStatsSchema),
    /** Programmes whose statistics page yielded nothing. Named, never dropped. */
    missing: z.array(z.string()).optional(),
  })
  .strict();
export type StatsFile = z.infer<typeof statsFileSchema>;

/** One player's line in a single match, off the box score's own table. */
export const matchPlayerLineSchema = z
  .object({
    name: z.string().min(1),
    /** Same SideArm player id as the roster and season stats, when the row
     *  linked a bio — the owner's players do, opponents usually don't. */
    player_id: z.string().optional(),
    number: z.string().optional(),
    position: z.string().optional(),
    started: z.boolean().optional(),
    shots: z.number().int().optional(),
    sog: z.number().int().optional(),
    goals: z.number().int().optional(),
    assists: z.number().int().optional(),
    minutes: z.number().int().optional(),
    goals_against: z.number().int().optional(),
    saves: z.number().int().optional(),
  })
  .strict();
export type MatchPlayerLine = z.infer<typeof matchPlayerLineSchema>;

/** One side of a match, exactly as the box score served it. The name and
 *  abbreviation are the page's own — consistent within a page, not across
 *  pages — so scoring plays and cards reference sides by index. */
export const matchTeamSchema = z
  .object({
    name: z.string().min(1),
    abbr: z.string().optional(),
    periods: z.array(z.number().int()),
    score: z.number().int().optional(),
    winner: z.boolean().optional(),
    shots: z.number().int().optional(),
    sog: z.number().int().optional(),
    saves: z.number().int().optional(),
    corners: z.number().int().optional(),
    fouls: z.number().int().optional(),
    offsides: z.number().int().optional(),
    players: z.array(matchPlayerLineSchema).optional(),
    keepers: z.array(matchPlayerLineSchema).optional(),
  })
  .strict();
export type MatchTeam = z.infer<typeof matchTeamSchema>;

export const matchScoringSchema = z
  .object({
    time: z.string().optional(),
    /** Index into the match's teams array. */
    team: z.number().int().optional(),
    scorer: z.string().min(1),
    /** The scorer's season goal count as of this goal, as printed. */
    season_total: z.number().int().optional(),
    assist: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();
export type MatchScoring = z.infer<typeof matchScoringSchema>;

export const matchCardSchema = z
  .object({
    time: z.string().optional(),
    team: z.number().int().optional(),
    type: z.enum(["yellow", "red", "unknown"]),
    player: z.string().min(1),
    number: z.string().optional(),
  })
  .strict();
export type MatchCard = z.infer<typeof matchCardSchema>;

/** One play-by-play event, as the box score narrated it. The text is the
 *  record — free prose typed by the home stat crew — and the type exists only
 *  where the collector recognized the phrasing, so an untyped play is still a
 *  play. The period is the page's own section token ("1", "2", "3", "SO"). */
export const matchPlaySchema = z
  .object({
    period: z.string().min(1),
    /** Match clock as printed; shootout rows have none. */
    clock: z.string().optional(),
    /** Index into the match's teams array. */
    team: z.number().int().optional(),
    text: z.string().min(1),
    type: z.string().optional(),
    /** Running score after this play, aligned to the teams order. */
    score: z.tuple([z.number().int(), z.number().int()]).optional(),
  })
  .strict();
export type MatchPlay = z.infer<typeof matchPlaySchema>;

/** One match's published box score. */
export const matchDetailSchema = z
  .object({
    source_url: z.string().min(1),
    teams: z.array(matchTeamSchema),
    /** Which served side is the fixture's home team — absent when the page
     *  gave no way to prove it (an unresolvable draw). */
    home_index: z.number().int().optional(),
    scoring: z.array(matchScoringSchema).optional(),
    cards: z.array(matchCardSchema).optional(),
    plays: z.array(matchPlaySchema).optional(),
    stadium: z.string().optional(),
    attendance: z.number().int().optional(),
    kickoff: z.string().optional(),
    officials: z.array(z.string()).optional(),
  })
  .strict();
export type MatchDetail = z.infer<typeof matchDetailSchema>;

export const matchesFileSchema = z
  .object({
    schema: z.literal(MATCHES_SCHEMA),
    season: z.number().int(),
    gender: genderSchema,
    collected_at: z.string().min(1),
    /** Keyed by fixture id — the same ids the season's fixtures file carries. */
    matches: z.record(z.string(), matchDetailSchema),
    /** Played fixtures whose box score could not be collected, each with the
     *  collector's named reason. */
    missing: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type MatchesFile = z.infer<typeof matchesFileSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Derived view models — computed from the files, never stored.
// ─────────────────────────────────────────────────────────────────────────────

export interface TableRow {
  slug: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/** Three points for a win, one for a draw.
 *
 *  The table is the CONFERENCE table, so it counts only fixtures between two
 *  member programmes. Two guards enforce that, and both are load-bearing: a
 *  non-member opponent must never acquire a row (it would appear in the
 *  standings of a conference it does not belong to), and a member's
 *  non-conference results must never earn conference points. */
export function computeTable(file: FixturesFile): TableRow[] {
  const members = new Set(file.programmes.map((p) => p.slug));
  const bySlug = new Map<string, TableRow>();
  const nameOf = new Map(file.programmes.map((p) => [p.slug, p.name]));
  const row = (slug: string): TableRow => {
    let r = bySlug.get(slug);
    if (!r) {
      r = {
        slug,
        name: nameOf.get(slug) ?? slug,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
      };
      bySlug.set(slug, r);
    }
    return r;
  };
  // Seed every programme so a team that has not played yet still appears.
  for (const p of file.programmes) row(p.slug);

  for (const f of file.fixtures) {
    if (f.status !== "final") continue;
    // A friendly is outside the record everywhere else on the site, and it has
    // to be outside it here too. Every exhibition the 2026 collect carries also
    // says conference_game: false, so the guard below happens to catch them
    // all — but that is the data's manners, not a rule. An unflagged friendly
    // between two members would otherwise take conference points.
    if (f.match_type === "exhibition") continue;
    if (f.conference_game === false) continue;
    // Both sides must be members even when the flag is absent — an unflagged
    // fixture against a non-member is not a conference result.
    if (!members.has(f.home) || !members.has(f.away)) continue;
    const hs = f.home_score;
    const as = f.away_score;
    if (typeof hs !== "number" || typeof as !== "number") continue;
    const h = row(f.home);
    const a = row(f.away);
    h.played++;
    a.played++;
    // A forfeit's printed goals count toward nothing; the award is the result.
    if (!isForfeit(f)) {
      h.goalsFor += hs;
      h.goalsAgainst += as;
      a.goalsFor += as;
      a.goalsAgainst += hs;
    }
    const went = outcome(f);
    if (went === "home") {
      h.won++;
      a.lost++;
      h.points += 3;
    } else if (went === "away") {
      a.won++;
      h.lost++;
      a.points += 3;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }
  for (const r of bySlug.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;
  return rank([...bySlug.values()]);
}

/** Every countable result a member has played, against anyone, ranked on the
 *  same three points for a win.
 *
 *  This is the table BEFORE conference play opens. The conference table is
 *  all zeros then, and a reader of a table expects a top and a bottom (the
 *  owner's ruling, 2026-09-01), so until the first conference result lands
 *  the page ranks what it can show and says so in the table's own label.
 *  Nothing here feeds computeTable, whose two guards stand untouched: a
 *  non-member still never gets a row (its result credits only the member
 *  who played it), and a friendly still counts nowhere. */
export function computeOverallTable(file: FixturesFile): TableRow[] {
  const bySlug = new Map<string, TableRow>(
    file.programmes.map((p) => [p.slug, emptyRow(p.slug, p.name)]),
  );
  for (const f of file.fixtures) {
    if (f.status !== "final") continue;
    if (f.match_type === "exhibition") continue;
    const hs = f.home_score;
    const as = f.away_score;
    if (typeof hs !== "number" || typeof as !== "number") continue;
    const h = bySlug.get(f.home);
    const a = bySlug.get(f.away);
    const went = outcome(f);
    if (h) credit(h, hs, as, went === "home" ? "W" : went === "away" ? "L" : "D", isForfeit(f));
    if (a) credit(a, as, hs, went === "away" ? "W" : went === "home" ? "L" : "D", isForfeit(f));
  }
  return rank([...bySlug.values()]);
}

function emptyRow(slug: string, name: string): TableRow {
  return {
    slug,
    name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
  };
}

function credit(
  r: TableRow,
  gf: number,
  ga: number,
  result: "W" | "D" | "L",
  forfeit: boolean,
): void {
  r.played++;
  if (!forfeit) {
    r.goalsFor += gf;
    r.goalsAgainst += ga;
  }
  r.goalDiff = r.goalsFor - r.goalsAgainst;
  if (result === "W") {
    r.won++;
    r.points += 3;
  } else if (result === "L") {
    r.lost++;
  } else {
    r.drawn++;
    r.points++;
  }
}

/** Points, then goal difference, then the name — the same order in both tables. */
function rank(rows: TableRow[]): TableRow[] {
  return rows.sort(
    (x, y) => y.points - x.points || y.goalDiff - x.goalDiff || x.name.localeCompare(y.name),
  );
}

/** Fixtures grouped by date, ascending, each group's fixtures ordered by time. */
export function groupByDate(fixtures: readonly Fixture[]): { date: string; fixtures: Fixture[] }[] {
  const by = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const list = by.get(f.date);
    if (list) list.push(f);
    else by.set(f.date, [f]);
  }
  return [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({
      date,
      fixtures: list.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99")),
    }));
}

/** Played means the site says the game finished — status final. A played
 *  game may still carry no score: at least one modern theme publishes
 *  completion without a result when no score was entered, so anything
 *  score-dependent guards on the numbers, never on played-ness alone. */
export function isPlayed(f: Fixture): boolean {
  return f.status === "final";
}
