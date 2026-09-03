// Synthetic conference sets, for tests only.
//
// The density design was approved at twelve and nineteen conferences before
// the site follows more than six. These sets let the map, the home page and
// the masthead be exercised at those sizes now, driving the same helpers
// (lib/regions.ts) the live config drives. Nothing in src/ outside a test
// and this file may import this module; density.test.ts holds that line.
//
// The rows are the coordinator's canvas generator's, copied: key, code, name,
// region, programme count and a lat/lon box. The box is a PLACEHOLDER extent
// inside the conference's states for the map to scatter dots in; it is never
// a programme town, and nothing here is a fact about any programme.

import type { SiteConfig } from "../../site.config.ts";
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
  /** Members the box cannot hold (Hawaii, Canada), by name. */
  unplaced?: string[];
};

export type DensitySize = 12 | 19;

/** The same six rows as site.regions, in the same order. */
export const DENSITY_REGIONS: readonly Region[] = [
  { key: "northeast", name: "Northeast" },
  { key: "mid-atlantic", name: "Mid-Atlantic" },
  { key: "midwest", name: "Midwest" },
  { key: "southeast", name: "Southeast" },
  { key: "south-central", name: "South Central" },
  { key: "west", name: "West" },
];

const row = (
  key: string,
  code: string,
  name: string,
  region: string,
  programmes: number,
  [latMin, latMax, lonMin, lonMax]: [number, number, number, number],
  unplaced?: string[],
): DensityConference => ({
  key,
  code,
  name,
  region,
  programmes,
  box: { latMin, latMax, lonMin, lonMax },
  ...(unplaced ? { unplaced } : {}),
});

/** The nineteen, in the generator's config order. */
export const DENSITY_CONFERENCES: readonly DensityConference[] = [
  row("ne10", "NE10", "Northeast-10 Conference", "northeast", 10, [41.2, 44.6, -73.6, -70.8]),
  row(
    "cacc",
    "CACC",
    "Central Atlantic Collegiate Conference",
    "northeast",
    11,
    [39.4, 41.4, -75.6, -73.0],
  ),
  row("ecc", "ECC", "East Coast Conference", "northeast", 9, [40.6, 43.1, -78.9, -73.4]),
  row(
    "psac",
    "PSAC",
    "Pennsylvania State Athletic Conference",
    "mid-atlantic",
    12,
    [39.7, 42.1, -80.2, -75.3],
  ),
  row("mec", "MEC", "Mountain East Conference", "mid-atlantic", 10, [37.9, 40.4, -82.6, -78.5]),
  row(
    "gmac",
    "G-MAC",
    "Great Midwest Athletic Conference",
    "mid-atlantic",
    11,
    [37.8, 43.7, -85.2, -80.9],
  ),
  row(
    "gliac",
    "GLIAC",
    "Great Lakes Intercollegiate Athletic Conference",
    "midwest",
    6,
    [41.3, 46.6, -94.2, -83.0],
  ),
  row("glvc", "GLVC", "Great Lakes Valley Conference", "midwest", 13, [37.4, 41.9, -92.4, -85.4]),
  row("sac", "SAC", "South Atlantic Conference", "southeast", 11, [34.2, 36.9, -84.1, -80.2]),
  row("cc", "CC", "Conference Carolinas", "southeast", 15, [34.3, 37.3, -83.6, -76.9]),
  row("pbc", "PBC", "Peach Belt Conference", "southeast", 7, [29.9, 34.6, -84.5, -81.2]),
  row("gsc", "GSC", "Gulf South Conference", "southeast", 12, [30.6, 36.2, -90.2, -85.3]),
  row("ssc", "SSC", "Sunshine State Conference", "southeast", 9, [26.1, 30.3, -82.7, -80.1]),
  row("gac", "GAC", "Great American Conference", "south-central", 10, [33.5, 36.4, -97.6, -91.2]),
  row("lsc", "LSC", "Lone Star Conference", "south-central", 12, [29.5, 34.9, -102.4, -95.4]),
  row(
    "rmac",
    "RMAC",
    "Rocky Mountain Athletic Conference",
    "west",
    10,
    [35.1, 41.2, -108.9, -102.9],
  ),
  row(
    "ccaa",
    "CCAA",
    "California Collegiate Athletic Association",
    "west",
    13,
    [33.8, 40.9, -122.5, -117.0],
  ),
  row(
    "pacwest",
    "PACWEST",
    "Pacific West Conference",
    "west",
    7,
    [33.6, 38.2, -122.4, -117.6],
    ["Chaminade", "Hawaii Hilo", "Hawaii Pacific"],
  ),
  row(
    "gnac",
    "GNAC",
    "Great Northwest Athletic Conference",
    "west",
    5,
    [43.6, 48.7, -123.2, -116.4],
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

export type DensityConfig = RegionConfig & Pick<SiteConfig, "conferences" | "conferenceNames">;

/** A site-config-shaped set of that size, for driving the region helpers. */
export function densityConfig(size: DensitySize): DensityConfig {
  const rows = densityConferences(size);
  return {
    regions: DENSITY_REGIONS,
    conferences: rows.map((c) => c.key),
    conferenceNames: Object.fromEntries(rows.map((c) => [c.key, c.name])),
    conferenceRegions: Object.fromEntries(rows.map((c) => [c.key, c.region])),
  };
}
