// Every match the division holds, folded once per build and keyed by its
// identity, so a Match Centre can find the other collected records of its own
// match (schedule.ts kickoffCall) without refolding the division per page.
// Kept apart from schedule.ts so the schedule rules stay importable without
// the data home, the arrangement postseason-division.ts uses.

import { allSightings, type DivisionMatch, foldToMatches } from "./division.ts";
import { homeSeasons } from "./home.ts";

let byIdentity: Map<string, DivisionMatch> | null = null;

/** The folded match with this identity, or undefined. */
export function divisionMatchOf(identity: string): DivisionMatch | undefined {
  byIdentity ??= new Map(foldToMatches(allSightings(homeSeasons())).map((m) => [m.identity, m]));
  return byIdentity.get(identity);
}
