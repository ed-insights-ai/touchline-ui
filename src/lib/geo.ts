// Where a programme plays, as a point on the national map.
//
// Two rules hold this file together:
//
//   1. Coordinates are DATA, read from the programmes reference: resolved in
//      the rib against the 2023 Census Gazetteer and mirrored into the data
//      home with every collect (see programmes.ts). Nothing is geocoded at
//      build time and no location is ever inferred from a slug. A followed
//      member with no row fails the build there, by name; a stranger is named
//      and left unplotted — never dropped, never guessed at.
//   2. Screen positions are DERIVED, never stored. The basemap ships already
//      projected (see basemap.ts), so if a coordinate file also carried screen
//      positions the two could drift apart silently. There is one projection,
//      written down once, below.

import { site } from "../site.config.ts";
import { BASEMAP_VIEWBOX } from "./basemap.ts";
import { programmeOf } from "./programmes.ts";
import { byRegion, type Region, type RegionConfig } from "./regions.ts";

export interface ProgrammePoint {
  city: string;
  lat: number;
  lon: number;
  /** USPS code of the Gazetteer place, when the row names one. */
  state: string | null;
}

/** The town's point for a programme with a row, or null for a stranger. */
export function pointOf(slug: string): ProgrammePoint | null {
  const row = programmeOf(slug);
  if (!row) return null;
  return {
    city: row.city,
    lat: row.point.lat,
    lon: row.point.lon,
    state: row.provenance.point.state ?? null,
  };
}

// ── The projection ─────────────────────────────────────────────────────────
//
// Albers conic equal area with the parameters d3-geo's geoAlbersUsa() uses for
// the lower 48, at the scale and translate that produced basemap.ts. Written
// out rather than imported so the site keeps no runtime map dependency.
//
// Verified two ways, and both are asserted in geo.test.ts:
//   • against d3-geo itself — agreement to 8.9e-13px over a 372-point grid
//     across the lower 48, and over all collected programmes;
//   • against the shipped basemap — every programme lands inside the outline of
//     the state its own Gazetteer row names.

const RAD = Math.PI / 180;
const PARALLEL_1 = 29.5 * RAD;
const PARALLEL_2 = 45.5 * RAD;
const ORIGIN_LON = -96 * RAD;
/** The frame's centre, in the projection's own terms. */
const CENTER: readonly [number, number] = [-96.6, 38.7];
const SCALE = 1300;
const TRANSLATE: readonly [number, number] = [487.5, 305];

const CONE_N = (Math.sin(PARALLEL_1) + Math.sin(PARALLEL_2)) / 2;
const CONE_C = Math.cos(PARALLEL_1) ** 2 + 2 * CONE_N * Math.sin(PARALLEL_1);
const RHO_0 = Math.sqrt(CONE_C) / CONE_N;

function raw(lon: number, lat: number): [number, number] {
  const theta = (lon * RAD - ORIGIN_LON) * CONE_N;
  const rho = Math.sqrt(CONE_C - 2 * CONE_N * Math.sin(lat * RAD)) / CONE_N;
  return [rho * Math.sin(theta), RHO_0 - rho * Math.cos(theta)];
}

const RAW_CENTER = raw(CENTER[0], CENTER[1]);

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Project a coordinate into the basemap's frame, or null if it falls outside
 * the drawn map. The frame is the lower 48 — Alaska and Hawaii are not drawn —
 * so a programme there is honestly unplottable here rather than misplaced, and
 * the band names it instead.
 */
export function projectPoint(lon: number, lat: number): ScreenPoint | null {
  const [rx, ry] = raw(lon, lat);
  const x = TRANSLATE[0] + SCALE * (rx - RAW_CENTER[0]);
  // Screen y grows downward; the projection's does not.
  const y = TRANSLATE[1] - SCALE * (ry - RAW_CENTER[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const { x: vx, y: vy, w, h } = BASEMAP_VIEWBOX;
  if (x < vx || x > vx + w || y < vy || y > vy + h) return null;
  return { x, y };
}

// ── What the band draws ────────────────────────────────────────────────────

export interface PlacedProgramme {
  slug: string;
  name: string;
  city: string;
  at: ScreenPoint;
}

export interface ConferenceFootprint {
  key: string;
  code: string;
  name: string;
  /** Members with a coordinate row, in the order the fixtures file lists them. */
  placed: PlacedProgramme[];
  /** Members this site holds no point for. Named, never silently dropped. */
  unplaced: { slug: string; name: string }[];
  /** Postal codes of the states its placed members play in, alphabetical. */
  states: string[];
  /** Greatest distance in miles between any two placed members, or null. */
  widestGap: number | null;
}

const EARTH_MILES = 3958.8;

/** Great-circle miles between two coordinates. */
export function milesBetween(a: ProgrammePoint, b: ProgrammePoint): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
}

export function footprintOf(
  key: string,
  code: string,
  name: string,
  members: readonly { slug: string; name: string }[],
): ConferenceFootprint {
  const placed: PlacedProgramme[] = [];
  const unplaced: { slug: string; name: string }[] = [];
  const points: ProgrammePoint[] = [];
  for (const m of members) {
    const p = pointOf(m.slug);
    const at = p ? projectPoint(p.lon, p.lat) : null;
    if (p && at) {
      placed.push({ slug: m.slug, name: m.name, city: p.city, at });
      points.push(p);
    } else {
      unplaced.push({ slug: m.slug, name: m.name });
    }
  }
  let widest = 0;
  for (const [i, a] of points.entries()) {
    for (const b of points.slice(i + 1)) widest = Math.max(widest, milesBetween(a, b));
  }
  const states = [
    ...new Set(placed.map((p) => pointOf(p.slug)?.state).filter((s): s is string => !!s)),
  ].sort();
  return {
    key,
    code,
    name,
    placed,
    unplaced,
    states,
    widestGap: points.length > 1 ? Math.round(widest) : null,
  };
}

// ── Region labels ──────────────────────────────────────────────────────────

export interface RegionLabel {
  region: Region;
  /** Where the label sits, in basemap viewBox units, to one decimal. */
  x: number;
  y: number;
  /** How many conferences the region holds on this map. */
  conferences: number;
  /** How many programmes those conferences place on it. */
  programmes: number;
}

/**
 * One label per region with a placed dot: at the centroid of every placed
 * point in the region's conferences, moved by the region's configured `label`
 * offset so the word clears its own dots. Grouping is `byRegion`'s, in table
 * order; a region whose members are all unplaced has no ground to label and
 * gets none. Nothing here is inferred from a slug: the region a conference
 * belongs to is config, and the points are the footprints' own.
 */
export function regionLabels(
  footprints: readonly ConferenceFootprint[],
  cfg: RegionConfig = site,
): RegionLabel[] {
  const out: RegionLabel[] = [];
  for (const { region, items } of byRegion(footprints, cfg)) {
    const points = items.flatMap((f) => f.placed.map((p) => p.at));
    if (points.length === 0) continue;
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const dx = region.label?.dx ?? 0;
    const dy = region.label?.dy ?? 0;
    out.push({
      region,
      x: Math.round((cx + dx) * 10) / 10,
      y: Math.round((cy + dy) * 10) / 10,
      conferences: items.length,
      programmes: points.length,
    });
  }
  return out;
}

/**
 * The closest two programmes that play in different conferences. This is why the
 * map draws no conference territories: the leagues interleave on the ground, so
 * any shaded region would claim ground its conference does not hold.
 */
export function closestCrossConference(
  footprints: readonly ConferenceFootprint[],
): { a: PlacedProgramme; b: PlacedProgramme; miles: number } | null {
  let best: { a: PlacedProgramme; b: PlacedProgramme; miles: number } | null = null;
  for (const [i, left] of footprints.entries()) {
    for (const right of footprints.slice(i + 1)) {
      for (const a of left.placed) {
        for (const b of right.placed) {
          const pa = pointOf(a.slug);
          const pb = pointOf(b.slug);
          if (!pa || !pb) continue;
          const miles = milesBetween(pa, pb);
          if (!best || miles < best.miles) best = { a, b, miles };
        }
      }
    }
  }
  return best;
}
