// Ruling N1 (contract 2.3, ALGORITHM-2.3-rulings.md): the minutes of record.
//
// A third of programme-seasons do not print minutes in every box score, and
// minutes summed from box scores alone left regulars at "needs more minutes".
// For a collected programme-season, r is its records and m those in which the
// lines for its own side print minutes (lines taken as in R-A):
//
//   m = r                          box minutes, as 4.6 sums them; share over r
//   m < r, a stats row with minutes > 0
//                                  the larger of the row's minutes and his box
//                                  minutes [M1]; matches its games played
//                                  (else the records he has a line in); goals
//                                  and shots over every record; share over r
//   m < r, no such row, m/r ≥ 0.5  box minutes; share over m (box_partial),
//                                  but the U test below
//   otherwise                      incomplete, no_minutes
//
// [Phase 3] The bar is 0.5 (it was 0.9), and a box_partial player who falls
// short on box minutes but could reach the bar, were his programme's r − m
// records without box minutes full matches for him, is incomplete, reason
// no_minutes, not needs_minutes: couldReachBar. For everyone else the box
// minutes' status is certain.
//
// [IR-11, as M1 amends it] T is the larger of the minutes on his players-list
// row and on his keepers-list row, each joined as 4.6 joins it (a keeper who
// takes no shot appears in the keepers table alone, and a keeper's players-list
// row can carry fewer minutes than his keepers-list row). A missing row, or one
// with no minutes, counts 0; on a tie the players list's row is the one that
// gave T, for its games played.
//
// [M1, contract 2.4] Printed minutes are a floor. A printed minute was played,
// so his box minutes P can only be too low: the minutes of record are the
// larger of T and P.

import type { PositionGroup } from "../../src/lib/tiers.ts";
import {
  DEFENDER_MINUTES,
  DEFENDER_SHARE,
  isRegular,
  KEEPER_MINUTES,
  KEEPER_SHARE,
  share,
} from "./defence.ts";
import type { PlayerSeason } from "./players.ts";
import { isShootingGroup, shootingEligible } from "./shooting.ts";

export type MinutesMode = "box" | "stats" | "box_partial" | "none";

/** What a stats row carries for N1. */
export interface SeasonRow {
  minutes?: number;
  gp?: number;
}

export interface MinutesOfRecord {
  mode: MinutesMode;
  /** The record count a share is taken over: r, or m for box_partial. */
  denominator: number;
  /** The row the minutes came from, in stats mode. */
  row: SeasonRow | null;
  list: "players" | "keepers" | null;
}

const positive = (x: number | undefined): x is number =>
  typeof x === "number" && Number.isInteger(x) && x > 0;

/** N1's four cases, for one player of a programme-season with r records, m of
 *  them printing minutes. `players` and `keepers` are his joined rows. */
export function minutesOfRecord(
  r: number,
  m: number,
  players: SeasonRow | null,
  keepers: SeasonRow | null,
): MinutesOfRecord {
  const ts = positive(players?.minutes) ? players.minutes : 0;
  const tk = positive(keepers?.minutes) ? keepers.minutes : 0;
  // [M1] The row that gave T: the larger, the players list's on a tie.
  const [row, list] =
    ts === 0 && tk === 0
      ? [null, null]
      : ts >= tk
        ? [players, "players" as const]
        : [keepers, "keepers" as const];
  if (m === r) return { mode: "box", denominator: r, row: null, list: null };
  if (row !== null) return { mode: "stats", denominator: r, row, list };
  if (2 * m >= r) return { mode: "box_partial", denominator: m, row: null, list: null };
  return { mode: "none", denominator: m, row: null, list: null };
}

/** In stats mode, the player's sums become the season's: the larger of the
 *  row's minutes and his box minutes (`p.minutes` on entry) [M1], the row's
 *  games played (else his records), and the every-record goals and shots.
 *  Mutates `p`; any other mode leaves the box sums as they are. */
export function applyMinutesOfRecord(p: PlayerSeason, rec: MinutesOfRecord): void {
  if (rec.mode !== "stats" || rec.row === null) return;
  const gp = rec.row.gp;
  p.minutes = Math.max(rec.row.minutes as number, p.minutes);
  p.matches = typeof gp === "number" && Number.isInteger(gp) ? gp : p.records;
  p.starts = p.everyRecord.starts;
  p.G = p.everyRecord.G;
  p.S = p.everyRecord.S;
  p.adjG = p.everyRecord.adjG;
  p.adjS = p.everyRecord.adjS;
}

/**
 * [N1 (a)] The U test, for a box_partial player of a programme-season with r
 * records, m of them printing minutes: U = box minutes + 90 × (r − m).
 *
 *   F, M   not eligible on box minutes, but eligible were this season's
 *          minutes U (the season before judged as always: `previousCounts`)
 *   D, GK  not a regular on box minutes, but his share over m × 90 meets the
 *          share bar and U meets the minutes bar
 *
 * True means he could reach the bar: incomplete, reason no_minutes.
 */
export function couldReachBar(
  g: PositionGroup | null,
  minutes: number,
  r: number,
  m: number,
  previousCounts: boolean,
): boolean {
  const u = minutes + 90 * (r - m);
  if (isShootingGroup(g)) {
    return !shootingEligible(minutes, g, previousCounts) && shootingEligible(u, g, previousCounts);
  }
  if (g !== "D" && g !== "GK") return false;
  const [bar, shareBar] =
    g === "D" ? [DEFENDER_MINUTES, DEFENDER_SHARE] : [KEEPER_MINUTES, KEEPER_SHARE];
  return share(minutes, m) >= shareBar && !isRegular(g, minutes, m) && u >= bar;
}
