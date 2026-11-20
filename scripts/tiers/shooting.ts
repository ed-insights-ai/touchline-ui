// ALGORITHM.md section 5: shooting and scoring, for forwards and midfielders.

import type { Gender } from "../../src/lib/model.ts";
import { CONSTANTS, type ShootingConstants } from "../../src/lib/tier-constants.ts";
import type { PositionGroup } from "../../src/lib/tiers.ts";
import { type NcaaDivisionKey, ncaaDivision } from "../../src/site.config.ts";
import { topWithTies } from "./cut.ts";

export { CONSTANTS };

/** The constants for a level and gender; a level or gender nothing was
 *  fitted for has none, and computing with it is an error, not a default. */
export function constantsFor(
  gender: Gender,
  level: NcaaDivisionKey = ncaaDivision,
): ShootingConstants {
  const c = CONSTANTS[level]?.[gender];
  if (!c) throw new Error(`tiers: no shooting constants are fitted for ${level} ${gender}`);
  return c;
}

export const COUNTS_MINUTES = 600;
export const ELIGIBLE_MINUTES = 900;
export const TIER1_PERCENT = 5;
export const TIERS_PERCENT = 20;

export const isShootingGroup = (g: PositionGroup | null): boolean => g === "F" || g === "M";

/** threat = wG × adjG × 90 / minutes + wS × adjS × 90 / minutes; null at
 *  zero minutes, where it is undefined. */
export function threat(
  gender: Gender,
  adjG: number,
  adjS: number,
  minutes: number,
  level: NcaaDivisionKey = ncaaDivision,
): number | null {
  if (minutes <= 0) return null;
  const { wG, wS } = constantsFor(gender, level).weights;
  return (wG * adjG * 90) / minutes + (wS * adjS * 90) / minutes;
}

/** A season counts: at least 600 minutes in it at this programme, group F or M. */
export const seasonCounts = (
  minutes: number,
  g: PositionGroup | null,
  incomplete = false,
): boolean => !incomplete && isShootingGroup(g) && minutes >= COUNTS_MINUTES;

/** [N1 (a)] The season before counts when it is not incomplete, or when only
 *  the U test made it incomplete: "A season the U test made `incomplete` still
 *  counts as the earlier season when its box minutes reach 600." Its box
 *  minutes are certain, whatever the missing box scores hold. */
export const earlierSeasonCounts = (
  minutes: number,
  g: PositionGroup | null,
  incomplete: boolean,
  uTest: boolean,
): boolean => seasonCounts(minutes, g, incomplete && !uTest);

/** Eligible: group F or M, and at least 900 minutes this season, or at least
 *  600 this season with the season before counting. */
export function shootingEligible(
  minutes: number,
  g: PositionGroup | null,
  previousCounts: boolean,
): boolean {
  if (!isShootingGroup(g)) return false;
  return minutes >= ELIGIBLE_MINUTES || (minutes >= COUNTS_MINUTES && previousCounts);
}

/** The estimate: this season blended with the group average, and with the
 *  previous season's own threat when that season counts and is linked. */
export function estimate(
  gender: Gender,
  current: number,
  average: number,
  previous: number | null,
  level: NcaaDivisionKey = ncaaDivision,
): number {
  const b = constantsFor(gender, level).blend;
  if (previous === null) return b.one[0] * current + b.one[1] * average;
  return b.two[0] * current + b.two[1] * previous + b.two[2] * average;
}

/** The mean threat over the given players (the caller passes one group,
 *  season and gender, each with at least 600 minutes). Null for none. */
export function groupAverage(threats: readonly number[]): number | null {
  if (threats.length === 0) return null;
  let sum = 0;
  for (const t of threats) sum += t;
  return sum / threats.length;
}

/** Tier 1 is the top 5% (rounded up) plus ties; Tier 2 is down to the top
 *  20% (rounded up) plus ties, less Tier 1. */
export function shootingTiers(
  eligible: readonly { id: string; value: number }[],
): Map<string, 1 | 2> {
  const one = topWithTies(eligible, TIER1_PERCENT);
  const both = topWithTies(eligible, TIERS_PERCENT);
  const out = new Map<string, 1 | 2>();
  for (const id of both) out.set(id, one.has(id) ? 1 : 2);
  for (const id of one) out.set(id, 1);
  return out;
}
