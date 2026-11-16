// Ruling N1 (contract 2.3, ALGORITHM-2.3-rulings.md): the minutes of record.
//
// A third of programme-seasons do not print minutes in every box score, and
// minutes summed from box scores alone left regulars at "needs more minutes".
// For a collected programme-season, r is its records and m those in which the
// lines for its own side print minutes (lines taken as in R-A):
//
//   m = r                          box minutes, as 4.6 sums them; share over r
//   m < r, a stats row with minutes > 0
//                                  the row's minutes; matches its games played
//                                  (else the records he has a line in); goals
//                                  and shots over every record; share over r
//   m < r, no such row, m/r ≥ 0.9  box minutes; share over m
//   otherwise                      incomplete, no_minutes
//
// [IR-11, for approval] The stats row is the players list's, joined as 4.6
// joins it; failing that, the keepers list's by the same join, since a keeper
// who takes no shot appears in the keepers table alone.

import type { PlayerSeason } from "./players.ts";

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
  const [row, list] = positive(players?.minutes)
    ? [players, "players" as const]
    : positive(keepers?.minutes)
      ? [keepers, "keepers" as const]
      : [null, null];
  if (m === r) return { mode: "box", denominator: r, row: null, list: null };
  if (row !== null) return { mode: "stats", denominator: r, row, list };
  if (10 * m >= 9 * r) return { mode: "box_partial", denominator: m, row: null, list: null };
  return { mode: "none", denominator: m, row: null, list: null };
}

/** In stats mode, the player's sums become the season's: the row's minutes,
 *  its games played (else his records), and the every-record goals and shots.
 *  Mutates `p`; any other mode leaves the box sums as they are. */
export function applyMinutesOfRecord(p: PlayerSeason, rec: MinutesOfRecord): void {
  if (rec.mode !== "stats" || rec.row === null) return;
  const gp = rec.row.gp;
  p.minutes = rec.row.minutes as number;
  p.matches = typeof gp === "number" && Number.isInteger(gp) ? gp : p.records;
  p.starts = p.everyRecord.starts;
  p.G = p.everyRecord.G;
  p.S = p.everyRecord.S;
  p.adjG = p.everyRecord.adjG;
  p.adjS = p.everyRecord.adjS;
}
