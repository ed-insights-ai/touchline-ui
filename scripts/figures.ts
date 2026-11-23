/**
 * The figures this build prints, as JSON on stdout: for every conference the
 * build carries, each programme's record exactly as its team page computes it
 * (recordOf, the same call the page makes), and each rostered player's season
 * line as the squad table reads it (squadOf).
 *
 * For cross-checks outside the site (the rib's publish workflow compares it
 * with the desk's dataset). It reads the data home, never dist/, and writes
 * nothing, so nothing here is published: the figures stay on the pages they
 * are printed on, not in a downloadable file.
 *
 *   TOUCHLINE_DATA_DIR=… TOUCHLINE_NCAA_DIVISION=d2 TOUCHLINE_GENDER=men \
 *     bun scripts/figures.ts > figures.json
 */

import { loadSeason, recordOf, squadOf } from "../src/lib/derive.ts";
import { site } from "../src/site.config.ts";

const conferences: Record<string, unknown> = {};
for (const key of site.conferences) {
  let season: ReturnType<typeof loadSeason>;
  try {
    season = loadSeason(key);
  } catch {
    continue; // a conference the home does not carry is not on the site either
  }
  const programmes: Record<string, unknown> = {};
  for (const p of season.fixtures.programmes) {
    programmes[p.slug] = {
      name: season.names.name(p.slug),
      record: recordOf(season, p.slug),
      players: squadOf(season, p.slug).map((m) => ({
        name: m.player.name,
        gp: m.stats?.gp ?? null,
        gs: m.stats?.gs ?? null,
        goals: m.stats?.goals ?? null,
        assists: m.stats?.assists ?? null,
        points: m.stats?.points ?? null,
        shots: m.stats?.shots ?? null,
        keeper: m.keeper
          ? {
              gp: m.keeper.gp ?? null,
              saves: m.keeper.saves ?? null,
              goals_against: m.keeper.goals_against ?? null,
            }
          : null,
      })),
    };
  }
  conferences[key] = { name: site.conferenceNames[key] ?? season.fixtures.conference, programmes };
}

console.log(
  JSON.stringify(
    {
      schema: "touchline.figures/1",
      division: site.ncaaDivision,
      gender: site.gender,
      season: site.season,
      conferences,
    },
    null,
    2,
  ),
);
