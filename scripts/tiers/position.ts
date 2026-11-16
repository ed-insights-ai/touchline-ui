// ALGORITHM.md section 3: a player-season's position group.
//
// [Ruling R-F, reconciliation] A label's group is whatever the site's own
// position parser, `positionLine` in src/lib/format.ts, returns: GK is GK,
// DEF is D, MID is M, FWD is F, and null is no group. It replaces the
// contract's `group(label)` normaliser and its word and phrase tables, for the
// roster label and the box-score labels alike, so the tier file and the team
// sheet beside it read one roster line the same way. The parser is called,
// never copied: a published form it learns is learned here too. Everything
// else in section 3 stands (below): the roster line first, else the most
// common box-score group, a tie to the group seen first in date order.
//
// [N3, contract 2.3] A roster label that names two or more groups is not read
// as its first: its parts (split on '/', '\' and ',', or on '-' when the label
// is hyphen-joined initials such as "F-M") are each read by positionLine, and
// the one most common among the player's box-score labels that season wins, a
// tie to the one seen first in date order. When none of them appears there,
// the label is read whole, as before.

import { type Line, positionLine } from "../../src/lib/format.ts";
import type { PositionGroup } from "../../src/lib/tiers.ts";

export const GROUP_ORDER: readonly PositionGroup[] = ["GK", "D", "M", "F"];

/** The site's four lines, as the contract's four groups. */
export const GROUP_OF_LINE: Readonly<Record<Line, PositionGroup>> = {
  GK: "GK",
  DEF: "D",
  MID: "M",
  FWD: "F",
};

/** A label's position group [R-F]: positionLine's line, mapped; null when
 *  positionLine places nobody. */
export function group(label: string | undefined | null): PositionGroup | null {
  const line = positionLine(label ?? undefined);
  return line === null ? null : GROUP_OF_LINE[line];
}

/** Hyphen-joined initials, trimmed and lower-cased: "f-m", "mf-d", "gk-d". */
const HYPHEN_INITIALS = /^(gk|mf|[a-z])(-(gk|mf|[a-z]))+$/;

/**
 * [N3] A roster label's group: positionLine of the whole label, unless its
 * parts name two or more different groups; then the part most common among
 * the box-score labels (in date order, a tie to the one seen first), or the
 * whole label's when none of them appears there. `byBox` says the box scores
 * decided it against the whole label's reading.
 */
export function rosterGroup(
  label: string | undefined | null,
  boxLabels: readonly (string | undefined | null)[],
): { group: PositionGroup | null; byBox: boolean } {
  const whole = group(label);
  if (typeof label !== "string" || label === "") return { group: whole, byBox: false };
  const pieces = HYPHEN_INITIALS.test(label.trim().toLowerCase())
    ? label.split("-")
    : label.split(/[/\\,]/);
  const parts: PositionGroup[] = [];
  for (const piece of pieces) {
    const g = group(piece);
    if (g !== null && !parts.includes(g)) parts.push(g);
  }
  if (parts.length < 2) return { group: whole, byBox: false };
  const box = boxLabels.map(group).filter((g): g is PositionGroup => g !== null);
  const counts = new Map<PositionGroup, number>();
  for (const g of box) counts.set(g, (counts.get(g) ?? 0) + 1);
  let best: PositionGroup | null = null;
  for (const g of box) {
    if (!parts.includes(g)) continue;
    if (best === null || (counts.get(g) as number) > (counts.get(best) as number)) best = g;
  }
  if (best === null) return { group: whole, byBox: false };
  return { group: best, byBox: best !== whole };
}

/**
 * The group of the roster line's label [N3: rosterGroup]; else the most
 * common group among the box-score labels, which come in date order, a tie
 * going to the tied group that appears first; else null (status incomplete,
 * reason no_position).
 */
export function groupOf(
  rosterLabel: string | undefined | null,
  boxLabels: readonly (string | undefined | null)[],
): PositionGroup | null {
  const fromRoster = rosterGroup(rosterLabel, boxLabels).group;
  if (fromRoster !== null) return fromRoster;
  return mostCommonGroup(boxLabels);
}

/** The most common group among labels in date order; a tie goes to the tied
 *  group seen first. */
export function mostCommonGroup(
  labels: readonly (string | undefined | null)[],
): PositionGroup | null {
  const counts = new Map<PositionGroup, number>();
  for (const label of labels) {
    const g = group(label);
    if (g !== null) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  // A Map iterates in insertion order, which is first appearance.
  let best: PositionGroup | null = null;
  let bestCount = 0;
  for (const [g, c] of counts) {
    if (c > bestCount) {
      best = g;
      bestCount = c;
    }
  }
  return best;
}

/** Whether the box-score labels tie for the most common group, so date order
 *  decided it. Counted for the build log. */
export function boxGroupTied(labels: readonly (string | undefined | null)[]): boolean {
  const counts = new Map<PositionGroup, number>();
  for (const label of labels) {
    const g = group(label);
    if (g !== null) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const top = Math.max(0, ...counts.values());
  return top > 0 && [...counts.values()].filter((c) => c === top).length > 1;
}
