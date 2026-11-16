// ALGORITHM.md section 7: workload group, record and season score.
//
// Within one season and gender, over programme-seasons with n ≥ 12:
// workload = SA / n, cut into three groups at the linear-interpolation
// quantiles at 1/3 and 2/3 (a value equal to a boundary goes to the heavier
// group); record = −ln(max(GA, 0.5) / EGA); score = the record standardised
// inside its (season, gender, workload group) by the group's mean and
// population standard deviation.

import type { Workload } from "../../src/lib/tiers.ts";

export const MIN_MATCHES = 12;

/**
 * The linear-interpolation quantile (Hyndman and Fan type 7, numpy's
 * default): position h = (N − 1) × p on the sorted values, interpolated
 * between its neighbours. `numerator / denominator` is p, kept as a fraction
 * so that h is exact whenever it is whole.
 */
export function quantile(
  values: readonly number[],
  numerator: number,
  denominator: number,
): number {
  if (values.length === 0) throw new Error("quantile of nothing");
  const sorted = [...values].sort((a, b) => a - b);
  const h = ((sorted.length - 1) * numerator) / denominator;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const x = sorted[lo] as number;
  const y = sorted[hi] as number;
  return x + (h - lo) * (y - x);
}

export interface Boundaries {
  first: number;
  second: number;
}

export function workloadBoundaries(values: readonly number[]): Boundaries {
  return { first: quantile(values, 1, 3), second: quantile(values, 2, 3) };
}

/** Below the first boundary light; from it to below the second typical; from
 *  the second heavy. Equal to a boundary is the heavier group. */
export function workloadOf(value: number, b: Boundaries): Workload {
  if (value >= b.second) return "heavy";
  if (value >= b.first) return "typical";
  return "light";
}

export function record(goalsAgainst: number, expected: number): number {
  return -Math.log(Math.max(goalsAgainst, 0.5) / expected);
}

/** (x − mean) / population sd. A group of one, or of identical records, has
 *  sd 0; its scores are then 0 rather than a division by zero. */
export function standardise(values: readonly number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  let ss = 0;
  for (const v of values) ss += (v - mean) * (v - mean);
  const sd = Math.sqrt(ss / n);
  return values.map((v) => (sd > 0 ? (v - mean) / sd : 0));
}

export interface TeamTotals {
  slug: string;
  /** n */
  matches: number;
  /** GA */
  goalsAgainst: number;
  /** SA */
  shotsFaced: number;
  /** EGA */
  expected: number;
}

export interface TeamSeason extends TeamTotals {
  workload: Workload | null;
  /** SA / n, or null when n is 0. */
  load: number | null;
  record: number | null;
  score: number | null;
}

/** Sections 6 and 7 together for one season and gender. Teams under twelve
 *  matches get no workload group, no record and no score. */
export function scoreTeams(teams: readonly TeamTotals[]): {
  teams: TeamSeason[];
  boundaries: Boundaries | null;
} {
  const grouped = teams.filter((t) => t.matches >= MIN_MATCHES);
  const loads = grouped.map((t) => t.shotsFaced / t.matches);
  const boundaries = grouped.length > 0 ? workloadBoundaries(loads) : null;
  const out: TeamSeason[] = teams.map((t) => ({
    ...t,
    load: t.matches > 0 ? t.shotsFaced / t.matches : null,
    workload:
      boundaries !== null && t.matches >= MIN_MATCHES
        ? workloadOf(t.shotsFaced / t.matches, boundaries)
        : null,
    record: t.matches >= MIN_MATCHES ? record(t.goalsAgainst, t.expected) : null,
    score: null,
  }));
  for (const w of ["light", "typical", "heavy"] as const) {
    const members = out.filter((t) => t.workload === w);
    const scores = standardise(members.map((t) => t.record as number));
    members.forEach((t, i) => {
      t.score = scores[i] as number;
    });
  }
  return { teams: out, boundaries };
}
