/**
 * The footnote the match page composes about a match it cannot fully show.
 *
 * A figure interpolated in front of a fixed plural reads correctly for every
 * count but the one a reader is most likely to meet: "1 box-score gaps across
 * the conference" is what a good collect prints.
 */

import { describe, expect, test } from "bun:test";
import { footNote } from "./matchstate.ts";

describe("the footnote agrees with its own figures", () => {
  test("one gap is a gap", () => {
    expect(footNote("preview", { finalsWithoutScore: 0, pastDateNoResult: 0, gaps: 1 })).toBe(
      "1 box-score gap across the conference",
    );
  });

  test("none and many stay plural", () => {
    expect(footNote("preview", { finalsWithoutScore: 0, pastDateNoResult: 0, gaps: 0 })).toBe(
      "0 box-score gaps across the conference",
    );
    expect(footNote("preview", { finalsWithoutScore: 0, pastDateNoResult: 0, gaps: 7 })).toBe(
      "7 box-score gaps across the conference",
    );
  });

  test("a lone silence is not one of a set", () => {
    expect(footNote("silent-final", { finalsWithoutScore: 1, pastDateNoResult: 0, gaps: 3 })).toBe(
      "The only final without a published score · 3 box-score gaps across the conference",
    );
    expect(footNote("silent-past", { finalsWithoutScore: 0, pastDateNoResult: 1, gaps: 1 })).toBe(
      "The only past date with no published result · 1 box-score gap across the conference",
    );
  });

  test("the house form returns above one", () => {
    expect(footNote("silent-final", { finalsWithoutScore: 4, pastDateNoResult: 0, gaps: 2 })).toBe(
      "One of 4 finals without a published score · 2 box-score gaps across the conference",
    );
    expect(footNote("silent-past", { finalsWithoutScore: 0, pastDateNoResult: 9, gaps: 2 })).toBe(
      "One of 9 past dates with no published result · 2 box-score gaps across the conference",
    );
  });
});
