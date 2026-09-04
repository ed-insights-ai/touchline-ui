/**
 * The two sentences the match page composes about a match it cannot fully
 * show, and the two ways they were wrong.
 *
 *   • Agreement. A figure interpolated in front of a fixed plural reads
 *     correctly for every count but the one a reader is most likely to meet:
 *     "1 box score gaps across the conference" is what a good collect prints.
 *   • Intent. One provenance line served every state that was not a box score,
 *     and it ended "result withheld by the source". The page has no way to
 *     know whether a programme withheld anything; it knows what the collect
 *     found. On a preview there is no result yet to withhold, and on a
 *     score-only page the result is on the screen.
 *
 * The second is the honesty failure, and it is the one that cannot be allowed
 * back in by a rewording, so it is tested as a rule over every state rather
 * than as a string per state.
 */

import { describe, expect, test } from "bun:test";
import {
  disputedNote,
  footNote,
  forfeitNote,
  type MatchState,
  metaDescription,
  provenance,
} from "./matchstate.ts";

const STATES: MatchState[] = [
  "played",
  "score-only",
  "silent-final",
  "silent-past",
  "preview",
  "off",
];

describe("the footnote agrees with its own figures", () => {
  test("one gap is a gap", () => {
    expect(footNote("score-only", { finalsWithoutScore: 0, pastDateNoResult: 0, gaps: 1 })).toBe(
      "1 box score gap across the conference",
    );
  });

  test("none and many stay plural", () => {
    expect(footNote("played", { finalsWithoutScore: 0, pastDateNoResult: 0, gaps: 0 })).toBe(
      "0 box score gaps across the conference",
    );
    expect(footNote("score-only", { finalsWithoutScore: 0, pastDateNoResult: 0, gaps: 7 })).toBe(
      "7 box score gaps across the conference",
    );
  });

  test("a lone silence is not one of a set", () => {
    expect(footNote("silent-final", { finalsWithoutScore: 1, pastDateNoResult: 0, gaps: 3 })).toBe(
      "The only final without a published score · 3 box score gaps across the conference",
    );
    expect(footNote("silent-past", { finalsWithoutScore: 0, pastDateNoResult: 1, gaps: 1 })).toBe(
      "The only past date with no published result · 1 box score gap across the conference",
    );
  });

  test("the house form returns above one", () => {
    expect(footNote("silent-final", { finalsWithoutScore: 4, pastDateNoResult: 0, gaps: 2 })).toBe(
      "One of 4 finals without a published score · 2 box score gaps across the conference",
    );
    expect(footNote("silent-past", { finalsWithoutScore: 0, pastDateNoResult: 9, gaps: 2 })).toBe(
      "One of 9 past dates with no published result · 2 box score gaps across the conference",
    );
  });
});

describe("provenance names a source, never an intention", () => {
  const lines = STATES.map((state) => ({
    state,
    text: provenance(state, { hasPlays: false, status: "postponed" }),
  }));

  test("no state claims the publisher decided anything", () => {
    for (const { state, text } of lines) {
      expect(`${state}: ${text}`).not.toMatch(/withheld|refused|declined|refuses|withholds/i);
    }
  });

  test("the preview says nothing about a result", () => {
    // Nothing is missing from a match that has not been played. The line names
    // the schedule it read and stops there.
    const text = provenance("preview", { hasPlays: false, status: "scheduled" });
    expect(text).toBe("From the programme's published schedule.");
    expect(text.toLowerCase()).not.toContain("result");
    expect(text.toLowerCase()).not.toContain("score");
  });

  test("a final is claimed only where the source marks one", () => {
    for (const { state, text } of lines) {
      if (state === "silent-final") expect(text).toContain("final");
      else expect(text.toLowerCase()).not.toContain("final");
    }
  });

  test("score-only says the result exists and the detail does not", () => {
    const text = provenance("score-only", { hasPlays: false, status: "final" });
    expect(text).toContain("Result from the programme's published schedule");
    expect(text).toContain("no box score was published");
  });

  test("a played match names what it actually read", () => {
    expect(provenance("played", { hasPlays: false, status: "final" })).toBe(
      "From the programme's published box score.",
    );
    expect(provenance("played", { hasPlays: true, status: "final" })).toBe(
      "From the programme's published box score and play-by-play.",
    );
  });

  test("an off match repeats the programme's own word for it", () => {
    expect(provenance("off", { hasPlays: false, status: "cancelled" })).toContain(
      "marks this match cancelled",
    );
  });
});

describe("a score that is not the whole result says so in the reader's words", () => {
  // The two words are "by forfeit" and "disputed", lower case in running
  // text; a scoreline in prose is set with an en dash; nothing here uses an
  // em dash, which the copy properties reject.
  const em = "\u2014";
  const hyphenScore = /\d\s?-\s?\d/;

  test("a forfeit names the side awarded the match, and that the goals count for nothing", () => {
    const text = forfeitNote("Upper Iowa");
    expect(text).toContain("Awarded to Upper Iowa by forfeit");
    expect(text).toContain("count toward no tally");
    expect(text).not.toContain(em);
    expect(text).not.toMatch(hyphenScore);
    expect(text).not.toMatch(/withheld|refused|declined/i);
  });

  test("a disputed match names both scores with their sources, and counts neither", () => {
    const text = disputedNote({ home: "Upper Iowa", away: "Roosevelt" }, [
      { source: "uiupeacocks.com", code: "GLVC", home_score: 3, away_score: 2 },
      { source: "rooseveltlakers.com", code: "GLIAC", home_score: 2, away_score: 2 },
    ]);
    expect(text).toContain("uiupeacocks.com (GLVC file) has Upper Iowa 3\u20132 Roosevelt");
    expect(text).toContain("rooseveltlakers.com (GLIAC file) has Upper Iowa 2\u20132 Roosevelt");
    expect(text).toContain("neither is counted");
    expect(text).not.toContain(em);
    expect(text).not.toMatch(hyphenScore);
  });

  test("the description carries the mark beside the score", () => {
    const base = {
      home: "Upper Iowa",
      away: "Roosevelt",
      score: "2\u20132",
      date: "September 5, 2024",
      conference: "Great Lakes Valley Conference",
      hasPlays: false,
      status: "final",
    };
    expect(metaDescription("score-only", { ...base, mark: "by forfeit" })).toStartWith(
      "Upper Iowa 2\u20132 Roosevelt (by forfeit), September 5, 2024.",
    );
    expect(metaDescription("score-only", { ...base, mark: "disputed" })).toContain("(disputed)");
    expect(metaDescription("score-only", base)).not.toContain("(");
  });

  test("provenance names the forfeit and still claims no final", () => {
    const text = provenance("score-only", { hasPlays: false, status: "final", forfeit: true });
    expect(text).toContain("by forfeit");
    expect(text.toLowerCase()).not.toContain("final");
    expect(text).not.toMatch(/withheld|refused|declined/i);
    expect(provenance("score-only", { hasPlays: false, status: "final" })).not.toContain("forfeit");
  });
});
