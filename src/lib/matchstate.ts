// What the match page says about a match it cannot fully show.
//
// Six states come off the same fixture, and the page prints a footnote for
// each placing this match among the conference's silences. It was composed
// inline in the page's frontmatter, where it could not be read at a count of
// one or tested at all — and a figure interpolated in front of a hardcoded
// plural reads correctly for every count except the one a reader is most
// likely to meet. "1 box-score gaps across the conference" is what a good
// collect prints.

import { plural } from "./format.ts";

/** The six readings the page renders from one fixture. Named here because the
 *  copy below is keyed to them and the page and the copy must not drift. */
export type MatchState =
  | "played"
  | "score-only"
  | "silent-final"
  | "silent-past"
  | "preview"
  | "off";

export interface FootNoteCounts {
  /** Matches the schedule marks finished with no score ever entered. */
  finalsWithoutScore: number;
  /** Dates gone by that the schedule still lists as scheduled. */
  pastDateNoResult: number;
  /** Results published whose box score the collect could not reach. */
  gaps: number;
}

/**
 * Where this match sits among the conference's unresolved ones.
 *
 * "One of n" is the house form and stays, but at n === 1 this match is not one
 * of a set — it is the set, and saying so is both shorter and true.
 */
export function footNote(state: MatchState, counts: FootNoteCounts): string {
  const gaps = `${counts.gaps} box-score ${plural(counts.gaps, "gap", "gaps")} across the conference`;
  if (state === "silent-final") {
    const n = counts.finalsWithoutScore;
    const head =
      n === 1
        ? "The only final without a published score"
        : `One of ${n} finals without a published score`;
    return `${head} · ${gaps}`;
  }
  if (state === "silent-past") {
    const n = counts.pastDateNoResult;
    const head =
      n === 1
        ? "The only past date with no published result"
        : `One of ${n} past dates with no published result`;
    return `${head} · ${gaps}`;
  }
  return gaps;
}
