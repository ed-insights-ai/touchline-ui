// ALGORITHM.md section 3 (version 2): a player-season's position group.
//
// `group(label)` is the contract's normaliser, step for step, over its word
// and phrase tables. The tables are the contract's and closed: a label they do
// not reach has no group. Widening them is a change to the contract, not to
// this file.

import type { PositionGroup } from "../../src/lib/tiers.ts";

export const GROUP_ORDER: readonly PositionGroup[] = ["GK", "D", "M", "F"];

export const GROUP_WORDS: Readonly<Record<PositionGroup, readonly string[]>> = {
  GK: ["GK", "G", "K", "GOALKEEPER", "GOALIE"],
  D: [
    "D",
    "DEF",
    "B",
    "DB",
    "CB",
    "LB",
    "RB",
    "DEFENDER",
    "DEFENSE",
    "BACK",
    "FB",
    "WB",
    "DF",
    "OB",
    "DEFENSEMAN",
    "CENTERBACK",
    "CENTREBACK",
    "WINGBACK",
    "FULLBACK",
  ],
  M: ["M", "MID", "MF", "MD", "CM", "DM", "AM", "MIDFIELDER", "MIDFIELD", "CDM", "CAM", "HCM"],
  F: [
    "F",
    "FWD",
    "FW",
    "FOR",
    "ST",
    "S",
    "FORWARD",
    "W",
    "LW",
    "RW",
    "STRIKER",
    "WING",
    "WINGER",
    "FOWARD",
    "ATTACKER",
  ],
};

export const GROUP_PHRASES: Readonly<Record<PositionGroup, readonly string[]>> = {
  GK: ["GOAL KEEPER"],
  D: [
    "CENTER BACK",
    "CENTRE BACK",
    "OUTSIDE BACK",
    "RIGHT BACK",
    "LEFT BACK",
    "WING BACK",
    "FULL BACK",
  ],
  M: [
    "CENTER MIDFIELDER",
    "CENTRAL MIDFIELDER",
    "CENTER MIDFIELD",
    "CENTER MID",
    "MID FIELDER",
    "OUTSIDE MIDFIELDER",
    "DEFENSIVE MIDFIELDER",
    "ATTACKING MIDFIELDER",
    "CENTER ATTACKING MIDFIELDER",
  ],
  F: [],
};

const table = (t: Readonly<Record<PositionGroup, readonly string[]>>) =>
  new Map<string, PositionGroup>(GROUP_ORDER.flatMap((g) => t[g].map((x) => [x, g] as const)));
const WORDS = table(GROUP_WORDS);
const PHRASES = table(GROUP_PHRASES);

/** Every run of spaces and hyphens as one space. */
const collapse = (s: string): string => s.replace(/[\s-]+/g, " ");

/**
 * `group(label)`, in the contract's four steps:
 *
 * 1. upper-case, remove full stops, strip leading and trailing characters
 *    that are not letters ("- MID" is "MID"); empty has no group;
 * 2. spaces and hyphens collapsed: a phrase is the group;
 * 3. else the first non-empty piece of the step-1 string split on `/`, `\`
 *    and `-`, trimmed: a word, or (collapsed) a phrase, is the group;
 * 4. else the first word of that piece, if it is a word.
 */
export function group(label: string | undefined | null): PositionGroup | null {
  if (label === undefined || label === null) return null;
  const s = label
    .toUpperCase()
    .replaceAll(".", "")
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  if (s === "") return null;
  const phrase = PHRASES.get(collapse(s));
  if (phrase) return phrase;
  const piece =
    s
      .split(/[/\\-]/)
      .map((p) => p.trim())
      .find((p) => p !== "") ?? "";
  const fromPiece = WORDS.get(piece) ?? PHRASES.get(collapse(piece));
  if (fromPiece) return fromPiece;
  const first = piece.split(/\s+/)[0] ?? "";
  return WORDS.get(first) ?? null;
}

/**
 * The group of the roster line's label; else the most common group among the
 * box-score labels, which come in date order, a tie going to the tied group
 * that appears first; else null (status incomplete, reason no_position).
 */
export function groupOf(
  rosterLabel: string | undefined | null,
  boxLabels: readonly (string | undefined | null)[],
): PositionGroup | null {
  const fromRoster = group(rosterLabel);
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
