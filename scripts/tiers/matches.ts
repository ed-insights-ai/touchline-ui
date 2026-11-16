// ALGORITHM.md section 1: one record per physical match.
//
// A match between two collected programmes is published twice, once in each
// conference's file. This module does not fold them itself: it hands every
// conference's records to the site's own fold, `foldToMatches` in
// src/lib/division.ts (the resolution the home ledger, the division counts and
// the postseason read), after reading each record's sides the way the match
// page and the postseason do (`canonicalFixture` in src/lib/postseason.ts,
// which strips a ranking from a slug like "21-mckendree"). The fold groups by
// date and the unordered pair of slugs, and keeps the home side's
// conference's record; that record, and that record's box score, is the copy
// used. Exhibitions and forfeits are dropped, as is any match not final.

import type { Season } from "../../src/lib/derive.ts";
import { isExhibition, matchIdentity } from "../../src/lib/derive.ts";
import {
  allSightings,
  type DivisionMatch,
  foldToMatches,
  type Sighting,
} from "../../src/lib/division.ts";
import {
  type FixturesFile,
  isForfeit,
  type MatchDetail,
  type MatchesFile,
  type MatchTeam,
  type RostersFile,
  type StatsFile,
} from "../../src/lib/model.ts";
import { NameBook } from "../../src/lib/names.ts";
import { canonicalFixture, knownProgrammes } from "../../src/lib/postseason.ts";

/** One conference's four files for one season and gender. */
export interface ConferenceSeason {
  key: string;
  fixtures: FixturesFile;
  rosters: RostersFile | null;
  stats: StatsFile | null;
  matches: MatchesFile | null;
}

export interface PhysicalMatch {
  season: number;
  identity: string;
  date: string;
  /** The conference whose record is canonical, and the record's id there. */
  conference: string;
  fixtureId: string;
  home: string;
  away: string;
  neutral: boolean;
  /** The records print different finals; the canonical record's score is used. */
  disputed: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  /** The canonical record's box score, when collected. */
  detail: MatchDetail | null;
  /** The box score's side for the fixture's home and away slugs, by the
   *  stored home_index (null when the page gave none). */
  homeTeam: MatchTeam | null;
  awayTeam: MatchTeam | null;
  homeTeamIndex: number | null;
}

export interface FoldCounts {
  records: number;
  physical: number;
  exhibitions: number;
  forfeits: number;
  unplayed: number;
  disputed: number;
  kept: number;
  noBoxScore: number;
  unoriented: number;
  /** Matches the site's fold refuses (its records disagree on score or
   *  status) when no record of them is a final: unplayed either way, so set
   *  aside with the unplayed and named here. */
  refused: string[];
}

/** A site Season around one conference's files: just what the fold reads
 *  (the programmes, to say which record is the home side's). */
export function seasonOf(c: ConferenceSeason): Season {
  return {
    key: c.key,
    fixtures: c.fixtures,
    rosters: c.rosters,
    stats: c.stats,
    matches: c.matches,
    coverage: null,
    names: new NameBook(
      [c.fixtures],
      [],
      c.fixtures.programmes.map((p) => p.slug),
    ),
    asOf: c.fixtures.collected_at.slice(0, 10),
    collectedAt: c.fixtures.collected_at,
  };
}

const integer = (x: number | null | undefined): x is number =>
  typeof x === "number" && Number.isInteger(x);

/**
 * The site's fold, one match at a time. foldToMatches groups by identity and
 * folds each group on its own, so folding group by group gives the same
 * matches; it only lets one refused group stand aside instead of stopping the
 * season. The fold throws when a match's records disagree on its score or
 * status in a way it will not read (2024-09-12 Flagler v Florida Tech, women:
 * postponed in one file, postponed "2-2" in the other). When no record of
 * such a match is a final it was not played either way, and it is set aside;
 * a refusal that involves a final still stops the build.
 */
export function foldEach(sightings: readonly Sighting[]): {
  folded: DivisionMatch[];
  refused: string[];
} {
  const groups = new Map<string, Sighting[]>();
  for (const s of sightings) {
    const id = matchIdentity(s.fixture);
    const g = groups.get(id);
    if (g) g.push(s);
    else groups.set(id, [s]);
  }
  const folded: DivisionMatch[] = [];
  const refused: string[] = [];
  for (const [id, group] of groups) {
    try {
      folded.push(...foldToMatches(group));
    } catch (err) {
      if (group.some((s) => s.fixture.status === "final")) throw err;
      refused.push(id);
    }
  }
  return { folded, refused };
}

/** Every physical match of one season and gender, in date order. */
export function physicalMatches(
  season: number,
  conferences: readonly ConferenceSeason[],
): { matches: PhysicalMatch[]; counts: FoldCounts } {
  const seasons = conferences.map(seasonOf);
  const known = knownProgrammes(seasons);
  const sightings = allSightings(seasons).map((s) => {
    const fixture = canonicalFixture(s.fixture, known);
    return fixture === s.fixture ? s : { ...s, fixture };
  });
  const { folded, refused } = foldEach(sightings);
  const counts: FoldCounts = {
    records: sightings.length,
    physical: folded.length + refused.length,
    exhibitions: 0,
    forfeits: 0,
    unplayed: 0,
    disputed: 0,
    kept: 0,
    noBoxScore: 0,
    unoriented: 0,
    refused,
  };
  counts.unplayed += refused.length;
  const out: PhysicalMatch[] = [];
  for (const m of folded) {
    const f = m.fixture;
    if (isExhibition(f)) {
      counts.exhibitions++;
      continue;
    }
    if (isForfeit(f)) {
      counts.forfeits++;
      continue;
    }
    if (f.status !== "final") {
      counts.unplayed++;
      continue;
    }
    if (m.disputed) counts.disputed++;
    const detail = m.season.matches?.matches[f.id] ?? null;
    const hi = detail?.home_index;
    const oriented =
      detail !== null && detail.teams.length === 2 && (hi === 0 || hi === 1) ? hi : null;
    if (detail === null) counts.noBoxScore++;
    else if (oriented === null) counts.unoriented++;
    counts.kept++;
    out.push({
      season,
      identity: m.identity,
      date: f.date,
      conference: m.key,
      fixtureId: f.id,
      home: f.home,
      away: f.away,
      neutral: m.neutral,
      disputed: m.disputed,
      homeGoals: integer(f.home_score) ? f.home_score : null,
      awayGoals: integer(f.away_score) ? f.away_score : null,
      detail,
      homeTeam: oriented === null ? null : (detail?.teams[oriented] ?? null),
      awayTeam: oriented === null ? null : (detail?.teams[1 - oriented] ?? null),
      homeTeamIndex: oriented,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.identity.localeCompare(b.identity));
  return { matches: out, counts };
}
