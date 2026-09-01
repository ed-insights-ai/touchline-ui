/**
 * The standing line's date.
 *
 * The rule is small and the reason it exists is not: a wire that says the same
 * thing today as yesterday must show yesterday's date, or the tag stops being
 * a fact about the sentence and becomes a fact about the cadence — which every
 * reader can already infer from the footer's collect stamp.
 */

import { describe, expect, test } from "bun:test";
import { standingDate } from "./wire.ts";

describe("a line's date moves only when the line does", () => {
  test("an unchanged line keeps the date it already had", () => {
    expect(
      standingDate(
        "Ouachita Baptist have yet to concede.",
        {
          line: "Ouachita Baptist have yet to concede.",
          updated: "2026-08-27",
        },
        "2026-09-01",
      ),
    ).toBe("2026-08-27");
  });

  test("a changed line takes the collect date", () => {
    expect(
      standingDate(
        "Ouachita Baptist conceded at last.",
        {
          line: "Ouachita Baptist have yet to concede.",
          updated: "2026-08-27",
        },
        "2026-09-01",
      ),
    ).toBe("2026-09-01");
  });

  test("the first line ever written takes the collect date", () => {
    expect(standingDate("Anything at all.", undefined, "2026-09-01")).toBe("2026-09-01");
  });

  test("an unchanged line with no previous date gets none, not today", () => {
    // The first run after the field existed. The sentence is older than this
    // collect and the site cannot say how much older, so it says nothing —
    // stamping today would be the one answer that is certainly wrong.
    expect(standingDate("Anything at all.", { line: "Anything at all." }, "2026-09-01")).toBe(
      undefined,
    );
  });

  test("the comparison is exact, down to a trailing space", () => {
    // The comparison is the text itself, exactly. A model that re-emits its
    // own line re-emits it character for character; anything else is a
    // rewrite, and a rewrite is a displacement.
    expect(standingDate("A line.", { line: "A line. ", updated: "2026-08-27" }, "2026-09-01")).toBe(
      "2026-09-01",
    );
  });
});
