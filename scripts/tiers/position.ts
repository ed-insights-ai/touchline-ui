// ALGORITHM.md section 3: a player-season's position group.
//
// The table is the contract's, closed: a label it does not list is not
// recognised, however obvious its meaning ("Center Back", "- MID", "Winger").
// Widening it is a change to the contract, not to this file.

import type { PositionGroup } from "../../src/lib/tiers.ts";

/** The groups in the order the contract's table lists them. That order also
 *  breaks a tie between box-score groups (see groupOf). */
export const GROUP_ORDER: readonly PositionGroup[] = ["GK", "D", "M", "F"];

export const GROUP_LABELS: Readonly<Record<PositionGroup, readonly string[]>> = {
  GK: ["GK", "G", "K", "GOALKEEPER", "GOALIE"],
  D: ["D", "DEF", "B", "DB", "CB", "LB", "RB", "DEFENDER", "DEFENSE", "BACK", "FB", "WB"],
  M: ["M", "MID", "MF", "MD", "CM", "DM", "AM", "MIDFIELDER", "MIDFIELD", "CDM", "CAM"],
  F: ["F", "FWD", "FW", "FOR", "ST", "S", "FORWARD", "W", "LW", "RW", "STRIKER", "WING"],
};

const BY_LABEL = new Map<string, PositionGroup>(
  GROUP_ORDER.flatMap((g) => GROUP_LABELS[g].map((label) => [label, g] as const)),
);

/** `group(label)`: upper-case, drop full stops, the part before the first
 *  `/`, trimmed, looked up in the table. Null when it is not there. */
export function group(label: string | undefined | null): PositionGroup | null {
  if (label === undefined || label === null) return null;
  const head = label.toUpperCase().replaceAll(".", "").split("/")[0] ?? "";
  return BY_LABEL.get(head.trim()) ?? null;
}

/**
 * The group of the roster label; else the most common group among the
 * box-score labels; else null (status incomplete, reason no_position).
 *
 * A tie between box-score groups is broken by the table's order (GK, D, M,
 * F). The contract does not say how to break it; the build log records this.
 */
export function groupOf(
  rosterLabel: string | undefined | null,
  boxLabels: readonly (string | undefined | null)[],
): PositionGroup | null {
  const fromRoster = group(rosterLabel);
  if (fromRoster !== null) return fromRoster;
  return mostCommonGroup(boxLabels);
}

export function mostCommonGroup(
  labels: readonly (string | undefined | null)[],
): PositionGroup | null {
  const counts = new Map<PositionGroup, number>();
  for (const label of labels) {
    const g = group(label);
    if (g !== null) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let best: PositionGroup | null = null;
  let bestCount = 0;
  for (const g of GROUP_ORDER) {
    const c = counts.get(g) ?? 0;
    if (c > bestCount) {
      best = g;
      bestCount = c;
    }
  }
  return best;
}

/** Whether the box-score labels tie for the most common group, so the table's
 *  order decided it. Counted for the build log. */
export function boxGroupTied(labels: readonly (string | undefined | null)[]): boolean {
  const counts = new Map<PositionGroup, number>();
  for (const label of labels) {
    const g = group(label);
    if (g !== null) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const top = Math.max(0, ...counts.values());
  return top > 0 && [...counts.values()].filter((c) => c === top).length > 1;
}
