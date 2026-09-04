// What the match page is allowed to say about a match, and where it says it
// got it.
//
// Six states come off the same fixture, and the page prints two sentences for
// each: a footnote placing this match among the conference's silences, and a
// provenance line naming the source the page is reading. Both used to be
// composed inline in the page's frontmatter, where neither could be read at a
// count of one or tested at all. Both had shipped a defect that was invisible
// at the sizes a season usually produces.
//
// The footnote interpolated a figure in front of a hardcoded plural, so the
// only gap left after a good collect read "1 box-score gaps across the
// conference".
//
// The provenance line was worse, because it was wrong rather than untidy: one
// sentence served every state that was not a box score, and it ended "result
// withheld by the source". Withheld asserts an intention. The page cannot know
// whether a programme decided anything; it knows only what the collect found.
// On a preview there is no result to withhold — the match has not been played.
// On a score-only page the result is right there on the screen. So the line is
// drawn per state, and the three intent words — withheld, refused, declined —
// are barred from all of them. A state says what exists and what does not.

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
  // A preview has nothing to be placed among: the match has not been played,
  // and the conference's gaps are another page's business (owner, 2026-09-01).
  if (state === "preview") return "";
  const gaps = `${counts.gaps} box score ${plural(counts.gaps, "gap", "gaps")} across the conference`;
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

/**
 * The note a match page carries when its score rests on one source.
 *
 * A match between two of the conferences the site follows is in two files,
 * and for a night one of them has the score and the other still lists the
 * match as scheduled (lib/division.ts foldToMatches). The page on the side
 * that posted says which page has not; the page on the side that has not
 * posted says where the score stands. Neither says why: the site knows what
 * the collect found, and "not yet" is the whole of it.
 */
export function oneSourceNote(
  side: "posted" | "unposted",
  names: { posted: string; unposted: string },
): string {
  return side === "posted"
    ? `Score from one source; ${names.unposted}'s page has not posted it.`
    : `Score from one source: ${names.posted}'s page has posted it; ${names.unposted}'s has not.`;
}

/**
 * The page's own description, for an unfurl card and a search result.
 *
 * Composed from what was collected and nothing else: the two names, the score
 * if one was published, the date, the conference, and the same state sentence
 * the page itself shows. A description is the one piece of copy nobody
 * proof-reads against the page, which is exactly why it may not say anything
 * the page does not — no predicted result, no "don't miss", no embellishment.
 */
export function metaDescription(
  state: MatchState,
  m: {
    home: string;
    away: string;
    /** "4–1" where a score was published, else null. */
    score: string | null;
    date: string;
    conference: string;
    hasPlays: boolean;
    status: string;
  },
): string {
  const teams = m.score ? `${m.home} ${m.score} ${m.away}` : `${m.home} v ${m.away}`;
  const head = `${teams}, ${m.date}. ${m.conference}.`;
  switch (state) {
    case "played":
      return `${head} Box score${m.hasPlays ? " and play-by-play" : ""}, as published.`;
    case "score-only":
      return `${head} The result as published; no box score was collected.`;
    case "silent-final":
      return `${head} The schedule marks this match final; no score was published.`;
    case "silent-past":
      return `${head} The date has passed with no result published.`;
    case "off":
      return `${head} The programme marks this match ${m.status}.`;
    default:
      return `${head} Not played yet.`;
  }
}

/**
 * What the page read to build itself.
 *
 * Each line names a source and, where something is absent, names the absence
 * as an absence. "Final" is claimed only in the state where the source itself
 * marks the match finished; everywhere else it is a match.
 */
export function provenance(
  state: MatchState,
  source: { hasPlays: boolean; status: string },
): string {
  switch (state) {
    case "played":
      return source.hasPlays
        ? "From the programme's published box score and play-by-play."
        : "From the programme's published box score.";
    case "score-only":
      return "Result from the programme's published schedule; no box score was published.";
    case "silent-final":
      return "The programme's schedule marks this match final; no score was published.";
    case "silent-past":
      return "From the programme's published schedule; the date has passed with no result published.";
    case "off":
      return `From the programme's published schedule, which marks this match ${source.status}.`;
    default:
      return "From the programme's published schedule.";
  }
}
