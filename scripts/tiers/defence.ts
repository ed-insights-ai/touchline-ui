// ALGORITHM.md section 8 (version 2): the team defence tier, for defenders and
// goalkeepers. No 2022 player can hold it: 2021 is out of scope (section 0).

import type { PositionGroup, Workload } from "../../src/lib/tiers.ts";
import { topWithTies } from "./cut.ts";

export const DEFENDER_MINUTES = 900;
export const DEFENDER_SHARE = 0.7;
export const KEEPER_MINUTES = 600;
export const KEEPER_SHARE = 0.5;
export const MAX_SEASONS = 3;
export const DEFENCE_PERCENT = 20;

export const isDefenceGroup = (g: PositionGroup | null): boolean => g === "D" || g === "GK";

/** [v2] share = player minutes / (m × 90), where m is the number of the
 *  programme's records that season in which its box score prints minutes for
 *  at least one player. Zero when m is zero. */
export const share = (minutes: number, m: number): number => (m > 0 ? minutes / (m * 90) : 0);

/** A regular: a defender with at least 900 minutes and share ≥ 0.70; a
 *  goalkeeper with at least 600 minutes and share ≥ 0.50; and not incomplete. */
export function isRegular(
  g: PositionGroup | null,
  minutes: number,
  m: number,
  incomplete = false,
): boolean {
  if (incomplete) return false;
  const s = share(minutes, m);
  if (g === "D") return minutes >= DEFENDER_MINUTES && s >= DEFENDER_SHARE;
  if (g === "GK") return minutes >= KEEPER_MINUTES && s >= KEEPER_SHARE;
  return false;
}

/** One player-season as the defence rule reads it. `previous` is the linked
 *  player-season of the season before at the same programme, or null when the
 *  cross-season link does not hold (or there is none). */
export interface DefenceSeason {
  season: number;
  group: PositionGroup | null;
  regular: boolean;
  workload: Workload | null;
  /** The programme's season score (section 7), when it has a workload group. */
  score: number | null;
  previous: DefenceSeason | null;
}

/**
 * The seasons counted, newest first: this season, then the one before, then
 * the one before that, for as long as the player was a regular at the same
 * programme in the same group, the link holds, and the programme-season has a
 * workload group. At most three. Empty when this season does not count.
 */
export function seasonsCounted(current: DefenceSeason): DefenceSeason[] {
  const out: DefenceSeason[] = [];
  let at: DefenceSeason | null = current;
  while (
    at !== null &&
    out.length < MAX_SEASONS &&
    at.regular &&
    at.group === current.group &&
    at.workload !== null &&
    at.season === current.season - out.length
  ) {
    out.push(at);
    at = at.previous;
  }
  return out;
}

/** The mean of the programme's score over the seasons counted, summed oldest
 *  first so that two players with the same seasons get the same bits. */
export function careerRecord(counted: readonly DefenceSeason[]): number | null {
  if (counted.length === 0) return null;
  let sum = 0;
  for (const s of [...counted].reverse()) sum += s.score as number;
  return sum / counted.length;
}

/** The tier: the top fifth (rounded up, ties included) of everyone with two
 *  or more seasons counted, defenders and goalkeepers together. */
export const defenceTier = (pool: readonly { id: string; value: number }[]): Set<string> =>
  topWithTies(pool, DEFENCE_PERCENT);
