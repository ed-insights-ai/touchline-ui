// The division: what is true across the conferences, rather than inside one.
//
// A conference's fixture file is that conference's record of its own members'
// matches, so a match between two of the conferences this site follows appears
// in TWO files — once from each member's published schedule. The two records
// agree on everything a reader can see: the date, both slugs, which side is at
// home, the score, the status. What they do not share is an id, because an id
// is the collector's own key and each collector made its own.
//
// That is why nothing here identifies a match by its id. Any list or figure
// that spans conferences has to fold the sightings back into one match first —
// the national page's ledger printed one match twice, under two codes, linking
// to two different pages, for as long as it did not (tui-y0q).
//
// Nothing INSIDE a conference needs this: no fixture is duplicated within a
// file, and a season page counting its own conference's matches is counting
// the right things.

import { site } from "../site.config.ts";
import {
  boxScoreGaps,
  hasScore,
  isExhibition,
  isScored,
  memberSlugs,
  type Season,
} from "./derive.ts";
import { type Fixture, isPlayed } from "./model.ts";

/** What makes two records the same real-world match: the day, and the two
 *  programmes in an order neither of them chose. Slugs are the same string in
 *  every file that names a programme, which is what lets this work at all —
 *  and is worth restating, because the day it stops being true this function
 *  silently starts counting one match as two again. */
export const matchIdentity = (f: Fixture): string =>
  `${f.date} ${[f.home, f.away].sort().join(" v ")}`;

/** One conference's record of a match. */
export interface Sighting {
  key: string;
  /** The published abbreviation — what the ledger wears. */
  code: string;
  season: Season;
  fixture: Fixture;
}

/**
 * One real-world match, and every conference that collected it.
 *
 * The canonical record — key, season, fixture — is the HOME side's conference,
 * not the first one seen. Both answers are one row; only one of them is the
 * same row tomorrow. "First seen" is the order the seasons arrived in, which
 * is the home page's column order, which sorts by next kickoff and moves as
 * the season advances: the link under a result would change conference
 * mid-season for no reason a reader could see.
 */
export interface DivisionMatch {
  /** The identity every sighting of this match shares. */
  identity: string;
  /** The codes that collected it, in CONFIG order. One for a match inside a
   *  conference; two for a match between them, and both are true.
   *
   *  Config order, never the caller's: the national page hands its seasons
   *  over in config order today, but its columns sort by next kickoff, and a
   *  fold that inherited the caller's order would quietly reorder "LSC · GSC"
   *  to "GSC · LSC" as the season advanced. Identity is keyed to the stable
   *  list, the same rule the footprint band's hues are held to. */
  codes: string[];
  key: string;
  season: Season;
  fixture: Fixture;
  /** Every record of it, the canonical one included. */
  sightings: Sighting[];
  /** The records disagree on which side was at home and agree on everything
   *  else: a neutral-site match, each site having written itself as the home
   *  side (the 2026 Rogers State tournament in Claremore, Okla. is the case
   *  this was measured on). It is one match, counted once and for both
   *  records; it carries no home side, and a surface must not print one. */
  neutral: boolean;
}

/** The facts two records of one match must agree on once the home side is
 *  set aside: the unordered score and the status. Order-free so that two
 *  sites each calling itself the home side still compare equal. */
const sideFreeShape = (f: Fixture): string => {
  const scored = [
    [f.home, f.home_score ?? "-"],
    [f.away, f.away_score ?? "-"],
  ].sort(([a], [b]) => String(a).localeCompare(String(b)));
  return `${scored.map(([slug, score]) => `${slug}=${score}`).join("|")}|${f.status ?? "-"}`;
};

/** Fold sightings into matches, keeping the order of first appearance. */
export function foldToMatches(sightings: readonly Sighting[]): DivisionMatch[] {
  const groups = new Map<string, Sighting[]>();
  for (const sighting of sightings) {
    const identity = matchIdentity(sighting.fixture);
    const seen = groups.get(identity);
    if (seen) seen.push(sighting);
    else groups.set(identity, [sighting]);
  }
  const order = new Map(site.conferences.map((k, i) => [k, i]));
  const rank = (s: Sighting): number => order.get(s.key) ?? site.conferences.length;
  const out: DivisionMatch[] = [];
  for (const [identity, group] of groups) {
    group.sort((a, b) => rank(a) - rank(b));
    // The home side belongs to exactly one of the conferences that collected
    // this match — that is what makes the choice deterministic. The fallback
    // is for the shape the data has never taken: a match whose home side plays
    // in a conference this site does not follow, which can only reach one file
    // and so can only be one sighting anyway.
    const first = group[0];
    if (!first) continue;
    // Two records may disagree on the home side (a neutral site, each site
    // writing itself as home) and still be one match. They may not disagree
    // on the score or the status: that is two collectors publishing different
    // facts, and the fold refuses to choose between them silently.
    const shapes = new Set(group.map((s) => sideFreeShape(s.fixture)));
    if (shapes.size > 1) {
      throw new Error(
        `Touchline: the records of ${identity} disagree on the score or status: ${group
          .map((s) => `${s.key} ${sideFreeShape(s.fixture)}`)
          .join("  vs  ")}`,
      );
    }
    const neutral = new Set(group.map((s) => s.fixture.home)).size > 1;
    // With a home side, the canonical record is the home side's own
    // conference, which exactly one of the sightings is. Without one, the
    // first in config order: deterministic, and keyed to the stable list.
    const canonical = neutral
      ? first
      : (group.find((s) => memberSlugs(s.season).has(s.fixture.home)) ?? first);
    out.push({
      identity,
      codes: group.map((s) => s.code),
      key: canonical.key,
      season: canonical.season,
      fixture: canonical.fixture,
      sightings: group,
      neutral,
    });
  }
  return out;
}

/** Every conference's record of every match it collected, in config order. */
export function allSightings(seasons: readonly Season[]): Sighting[] {
  const order = new Map(site.conferences.map((k, i) => [k, i]));
  return [...seasons]
    .sort(
      (a, b) =>
        (order.get(a.key) ?? site.conferences.length) -
        (order.get(b.key) ?? site.conferences.length),
    )
    .flatMap((season) =>
      season.fixtures.fixtures.map((fixture) => ({
        key: season.key,
        code: season.fixtures.conference,
        season,
        fixture,
      })),
    );
}

/** The figures a division-level surface may print. */
export interface DivisionFigures {
  played: number;
  silentFinals: number;
  gaps: number;
  total: number;
  exhibitions: number;
}

export interface DivisionCounts extends DivisionFigures {
  /**
   * How many EXTRA records the conferences' own counts hold for each figure.
   *
   * A match two of them collected is in two files, so any sum of their counts
   * holds it twice. Every figure above reconciles exactly —
   *
   *     sum of the columns − duplicated = the figure
   *
   * — and the term is here so that reconciliation stands on a number rather
   * than on a subtraction nobody can check. It is a count of extra RECORDS,
   * not of shared matches, so it stays right if a match ever reaches three
   * files rather than two.
   */
  duplicated: DivisionFigures;
}

/**
 * The division's counts, every one of them a count of MATCHES.
 *
 * Each definition is the season page's own — played is a final with a
 * published score, a silent final is one without, a gap is a played match
 * whose box score the collector could not reach, and a friendly is outside all
 * of it — applied to the FOLDED list rather than to the files. Summing the
 * conferences instead counts a match between two of them twice, which is what
 * "48 of 363 matches played" was doing on the published site (tui-2l6).
 *
 * The fold is structural, not conditional. It runs over every figure whether
 * or not today's data happens to duplicate that one: on the collect this was
 * written against only the total and the played count were affected, and a
 * design that folded just those two would start lying the first day two
 * conferences both went silent on the same match.
 */
export function divisionCounts(seasons: readonly Season[]): DivisionCounts {
  const zero = (): DivisionFigures => ({
    played: 0,
    silentFinals: 0,
    gaps: 0,
    total: 0,
    exhibitions: 0,
  });
  const figures = zero();
  const duplicated = zero();
  const count = (key: keyof DivisionFigures, records: number): void => {
    figures[key]++;
    duplicated[key] += records - 1;
  };

  for (const m of foldToMatches(allSightings(seasons))) {
    const f = m.fixture;
    const records = m.sightings.length;
    if (isExhibition(f)) {
      count("exhibitions", records);
      continue;
    }
    count("total", records);
    if (isScored(f)) count("played", records);
    else if (isPlayed(f) && !hasScore(f)) count("silentFinals", records);
  }

  // A gap is named by the collector that could not reach the box score, so it
  // folds by the match it belongs to. One whose fixture the collector could
  // not resolve either cannot fold at all, and is counted where it stands
  // rather than guessed at.
  const gaps = new Map<string, number>();
  for (const s of seasons) {
    for (const g of boxScoreGaps(s)) {
      const id = g.fixture ? matchIdentity(g.fixture) : `unresolved:${s.key}:${g.fixtureId}`;
      gaps.set(id, (gaps.get(id) ?? 0) + 1);
    }
  }
  for (const records of gaps.values()) count("gaps", records);

  return { ...figures, duplicated };
}
