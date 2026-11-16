// ALGORITHM.md section 5: shooting and scoring, for forwards and midfielders.

import type { Gender } from "../../src/lib/model.ts";
import type { PositionGroup } from "../../src/lib/tiers.ts";
import { topWithTies } from "./cut.ts";

export const WEIGHTS: Readonly<Record<Gender, { wG: number; wS: number }>> = {
  men: { wG: 0.234, wS: 0.0885 },
  women: { wG: 0.238, wS: 0.0749 },
};

/** The estimate's blend: [this, average] for one season counted, [this,
 *  previous, average] for two. */
export const BLEND: Readonly<
  Record<Gender, { one: readonly [number, number]; two: readonly [number, number, number] }>
> = {
  men: { one: [0.79, 0.21], two: [0.59, 0.34, 0.07] },
  women: { one: [0.82, 0.18], two: [0.64, 0.3, 0.06] },
};

export const COUNTS_MINUTES = 600;
export const ELIGIBLE_MINUTES = 900;
export const TIER1_PERCENT = 5;
export const TIERS_PERCENT = 20;

export const isShootingGroup = (g: PositionGroup | null): boolean => g === "F" || g === "M";

/** threat = wG × adjG × 90 / minutes + wS × adjS × 90 / minutes; null at
 *  zero minutes, where it is undefined. */
export function threat(gender: Gender, adjG: number, adjS: number, minutes: number): number | null {
  if (minutes <= 0) return null;
  const { wG, wS } = WEIGHTS[gender];
  return (wG * adjG * 90) / minutes + (wS * adjS * 90) / minutes;
}

/** A season counts: at least 600 minutes in it at this programme, group F or M. */
export const seasonCounts = (minutes: number, g: PositionGroup | null): boolean =>
  isShootingGroup(g) && minutes >= COUNTS_MINUTES;

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
): number {
  const b = BLEND[gender];
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
