// A season's titles, read from the conference table and the division's
// postseason. Kept apart from titles.ts so its rules stay importable without
// the data home, as postseason-division.ts is kept apart from postseason.ts.

import { type Season, table, tableIsLive } from "./derive.ts";
import { divisionPostseason } from "./postseason-division.ts";
import { divisionalTables } from "./standings.ts";
import { regularChampion, type Titles } from "./titles.ts";

const cache = new Map<string, Titles>();

/** The titles decided in a season's conference and in the division. */
export function seasonTitles(season: Season): Titles {
  const hit = cache.get(season.key);
  if (hit) return hit;
  const post = divisionPostseason();
  const tournament = post.conference.find((t) => t.codes.includes(season.fixtures.conference));
  // The table is final once the conference tournament has begun (as
  // ConferenceTable marks it: FINAL · REGULAR SEASON).
  const final = tableIsLive(season) && tournament !== undefined;
  const rows = table(season);
  const titles: Titles = {
    regular: regularChampion(rows, final, divisionalTables(season, rows) !== null),
    tournament: tournament?.champion?.slug ?? null,
    national: post.ncaa.champion?.slug ?? null,
  };
  cache.set(season.key, titles);
  return titles;
}
