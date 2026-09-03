// Synthetic conference sets, for tests only.
//
// The density design was approved at twelve and nineteen conferences before
// the site follows more than six. These sets let the map, the home page and
// the masthead be exercised at those sizes now, driving the same helpers
// (lib/regions.ts) the live config drives. Nothing in src/ outside a test
// and this file may import this module; density.test.ts holds that line.
//
// The rows are the coordinator's canvas generator's, copied: key, code, name,
// region, programme count, a lat/lon box, and the season state the canvas
// drew each card with (live or an opener in 2026, played of total). The box
// is a PLACEHOLDER extent inside the conference's states for the map to
// scatter dots in; it is never a programme town, and nothing here is a fact
// about any programme or any season.

import { type SiteConfig, site } from "../../site.config.ts";
import { type ConferenceFootprint, projectPoint } from "../geo.ts";
import { type BandColumn, type CardView, mostImminentKey, opensLine } from "../home.ts";
import type { Region, RegionConfig } from "../regions.ts";

export type DensityConference = {
  key: string;
  code: string;
  name: string;
  region: string;
  programmes: number;
  /** A placeholder extent inside the conference's states, for scattering
   *  synthetic dots. Not a programme's location. */
  box: { latMin: number; latMax: number; lonMin: number; lonMax: number };
  /** Whether the canvas drew this conference's table as under way. */
  live: boolean;
  /** The canvas's opener as an ISO date in 2026; null while live. */
  opens: string | null;
  played: number;
  total: number;
  /** Members the box cannot hold (Hawaii, Canada), by name. */
  unplaced?: string[];
};

/** The season state a row was drawn with: live, or opening on a date. */
type DensityState = { live?: true; opens?: string; played: number; total: number };

export type DensitySize = 12 | 19;

/** The same six rows as site.regions, in the same order, label nudges and
 *  all (density.test.ts holds the two equal). */
export const DENSITY_REGIONS: readonly Region[] = [
  { key: "northeast", name: "Northeast", label: { dx: 40, dy: -46 } },
  { key: "mid-atlantic", name: "Mid-Atlantic", label: { dx: -4, dy: 62 } },
  { key: "midwest", name: "Midwest", label: { dx: -19, dy: -113 } },
  { key: "southeast", name: "Southeast", label: { dx: 128, dy: -28 } },
  { key: "south-central", name: "South Central", label: { dx: 64, dy: 83 } },
  { key: "west", name: "West", label: { dx: -10, dy: -70 } },
];

const row = (
  key: string,
  code: string,
  name: string,
  region: string,
  programmes: number,
  [latMin, latMax, lonMin, lonMax]: [number, number, number, number],
  state: DensityState,
  unplaced?: string[],
): DensityConference => ({
  key,
  code,
  name,
  region,
  programmes,
  box: { latMin, latMax, lonMin, lonMax },
  live: state.live === true,
  opens: state.opens ?? null,
  played: state.played,
  total: state.total,
  ...(unplaced ? { unplaced } : {}),
});

/** The nineteen, in the generator's config order. */
export const DENSITY_CONFERENCES: readonly DensityConference[] = [
  row("ne10", "NE10", "Northeast-10 Conference", "northeast", 10, [41.2, 44.6, -73.6, -70.8], {
    opens: "2026-09-12",
    played: 4,
    total: 46,
  }),
  row(
    "cacc",
    "CACC",
    "Central Atlantic Collegiate Conference",
    "northeast",
    11,
    [39.4, 41.4, -75.6, -73.0],
    { opens: "2026-09-13", played: 6, total: 54 },
  ),
  row("ecc", "ECC", "East Coast Conference", "northeast", 9, [40.6, 43.1, -78.9, -73.4], {
    opens: "2026-09-13",
    played: 2,
    total: 36,
  }),
  row(
    "psac",
    "PSAC",
    "Pennsylvania State Athletic Conference",
    "mid-atlantic",
    12,
    [39.7, 42.1, -80.2, -75.3],
    { opens: "2026-09-10", played: 8, total: 66 },
  ),
  row("mec", "MEC", "Mountain East Conference", "mid-atlantic", 10, [37.9, 40.4, -82.6, -78.5], {
    opens: "2026-09-11",
    played: 5,
    total: 45,
  }),
  row(
    "gmac",
    "G-MAC",
    "Great Midwest Athletic Conference",
    "mid-atlantic",
    11,
    [37.8, 43.7, -85.2, -80.9],
    { opens: "2026-09-12", played: 6, total: 55 },
  ),
  row(
    "gliac",
    "GLIAC",
    "Great Lakes Intercollegiate Athletic Conference",
    "midwest",
    6,
    [41.3, 46.6, -94.2, -83.0],
    { opens: "2026-09-19", played: 0, total: 21 },
  ),
  row("glvc", "GLVC", "Great Lakes Valley Conference", "midwest", 13, [37.4, 41.9, -92.4, -85.4], {
    live: true,
    played: 9,
    total: 78,
  }),
  row("sac", "SAC", "South Atlantic Conference", "southeast", 11, [34.2, 36.9, -84.1, -80.2], {
    opens: "2026-09-09",
    played: 7,
    total: 55,
  }),
  row("cc", "CC", "Conference Carolinas", "southeast", 15, [34.3, 37.3, -83.6, -76.9], {
    opens: "2026-09-06",
    played: 12,
    total: 90,
  }),
  row("pbc", "PBC", "Peach Belt Conference", "southeast", 7, [29.9, 34.6, -84.5, -81.2], {
    opens: "2026-09-16",
    played: 3,
    total: 21,
  }),
  row("gsc", "GSC", "Gulf South Conference", "southeast", 12, [30.6, 36.2, -90.2, -85.3], {
    live: true,
    played: 11,
    total: 66,
  }),
  row("ssc", "SSC", "Sunshine State Conference", "southeast", 9, [26.1, 30.3, -82.7, -80.1], {
    opens: "2026-09-09",
    played: 5,
    total: 36,
  }),
  row("gac", "GAC", "Great American Conference", "south-central", 10, [33.5, 36.4, -97.6, -91.2], {
    live: true,
    played: 10,
    total: 45,
  }),
  row("lsc", "LSC", "Lone Star Conference", "south-central", 12, [29.5, 34.9, -102.4, -95.4], {
    live: true,
    played: 12,
    total: 66,
  }),
  row(
    "rmac",
    "RMAC",
    "Rocky Mountain Athletic Conference",
    "west",
    10,
    [35.1, 41.2, -108.9, -102.9],
    { opens: "2026-09-05", played: 4, total: 45 },
  ),
  row(
    "ccaa",
    "CCAA",
    "California Collegiate Athletic Association",
    "west",
    13,
    [33.8, 40.9, -122.5, -117.0],
    { opens: "2026-09-08", played: 8, total: 78 },
  ),
  row(
    "pacwest",
    "PACWEST",
    "Pacific West Conference",
    "west",
    7,
    [33.6, 38.2, -122.4, -117.6],
    { opens: "2026-09-07", played: 3, total: 45 },
    ["Chaminade", "Hawaii Hilo", "Hawaii Pacific"],
  ),
  row(
    "gnac",
    "GNAC",
    "Great Northwest Athletic Conference",
    "west",
    5,
    [43.6, 48.7, -123.2, -116.4],
    { opens: "2026-09-05", played: 2, total: 15 },
    ["Simon Fraser"],
  ),
];

/** The generator's twelve: the six live keys and six more. */
const TWELVE = new Set([
  "gac",
  "lsc",
  "gsc",
  "glvc",
  "rmac",
  "ssc",
  "ne10",
  "cacc",
  "ecc",
  "psac",
  "mec",
  "gmac",
]);

/** The rows for a size, in DENSITY_CONFERENCES order. */
export function densityConferences(size: DensitySize): readonly DensityConference[] {
  return size === 19 ? DENSITY_CONFERENCES : DENSITY_CONFERENCES.filter((c) => TWELVE.has(c.key));
}

export type DensityConfig = RegionConfig &
  Pick<SiteConfig, "conferences" | "conferenceNames" | "homeColumnCap">;

/** A site-config-shaped set of that size, for driving the region helpers and
 *  the home layout. The column cap is the live site's own, so a layout
 *  decision made on the fixture reads the same field the page reads. */
export function densityConfig(size: DensitySize): DensityConfig {
  const rows = densityConferences(size);
  return {
    regions: DENSITY_REGIONS,
    conferences: rows.map((c) => c.key),
    conferenceNames: Object.fromEntries(rows.map((c) => [c.key, c.name])),
    conferenceRegions: Object.fromEntries(rows.map((c) => [c.key, c.region])),
    homeColumnCap: site.homeColumnCap,
  };
}

/** The canvas dateline is Tue Sep 1, 2026. A live league's next match is the
 *  day after, which is before every opener here, so live sorts first exactly
 *  as it does on the live site (homeColumns: by next kickoff). */
const DENSITY_LIVE_KICKOFF = "2026-09-02";

export type DensityCard = CardView & BandColumn;

/**
 * The cards for a size, in kickoff order: the live rows first in config order,
 * then the rest by opener (homeColumns' rule). Each carries a placeholder
 * line, the canvas's own, and no stamp; the href goes nowhere. The one
 * imminent card is found the way the page finds it, so the fixture can never
 * wear two purples.
 */
export function densityCards(size: DensitySize): DensityCard[] {
  const rows = densityConferences(size);
  const order = new Map(rows.map((c, i) => [c.key, i]));
  const columns = rows
    .map((c) => ({
      key: c.key,
      live: c.live,
      opensOn: c.opens,
      kickoff: c.live ? DENSITY_LIVE_KICKOFF : c.opens,
      row: c,
    }))
    .sort(
      (a, b) =>
        (a.kickoff ?? "9999-99-99").localeCompare(b.kickoff ?? "9999-99-99") ||
        (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0),
    );
  const imminent = mostImminentKey(columns);
  return columns.map(({ row: c, ...column }) => ({
    ...column,
    code: c.code,
    name: c.name,
    opens: opensLine(column),
    imminent: column.key === imminent && !column.live,
    played: c.played,
    total: c.total,
    line: c.live ? "First weekend of league play behind it." : "No league match played yet.",
    stamp: null,
    href: "#",
  }));
}

/**
 * Synthetic footprints for a size: one PLACEHOLDER point per programme,
 * scattered inside the row's box by a seeded generator (the coordinator's
 * canvas generator's LCG, so the two agree) and projected the way the live
 * map projects. These are never programme towns; they exist so the map's
 * region labels and key can be exercised at twelve and nineteen. A row's
 * `unplaced` names become unplaced members with a name and no town; `states`
 * stays empty and `widestGap` null, because a placeholder point holds no
 * fact worth measuring.
 */
export function densityFootprints(size: DensitySize): ConferenceFootprint[] {
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return densityConferences(size).map((c) => {
    const placed: ConferenceFootprint["placed"] = [];
    for (let i = 0; i < c.programmes; i++) {
      const lat = c.box.latMin + rnd() * (c.box.latMax - c.box.latMin);
      const lon = c.box.lonMin + rnd() * (c.box.lonMax - c.box.lonMin);
      const at = projectPoint(lon, lat);
      if (!at) continue;
      placed.push({
        slug: `${c.key}-placeholder-${i + 1}`,
        name: `[programme ${i + 1}]`,
        city: "[town]",
        at,
      });
    }
    return {
      key: c.key,
      code: c.code,
      name: c.name,
      placed,
      unplaced: (c.unplaced ?? []).map((name) => ({
        slug: `${c.key}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
      })),
      states: [],
      widestGap: null,
    };
  });
}
