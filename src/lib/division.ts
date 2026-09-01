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
import { memberSlugs, type Season } from "./derive.ts";
import type { Fixture } from "./model.ts";

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
}

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
    const canonical = group.find((s) => memberSlugs(s.season).has(s.fixture.home)) ?? group[0];
    if (!canonical) continue;
    out.push({
      identity,
      codes: group.map((s) => s.code),
      key: canonical.key,
      season: canonical.season,
      fixture: canonical.fixture,
      sightings: group,
    });
  }
  return out;
}
