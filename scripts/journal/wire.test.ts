/**
 * The standing line's date.
 *
 * The rule is small and the reason it exists is not: a wire that says the same
 * thing today as yesterday must show yesterday's date, or the tag stops being
 * a fact about the sentence and becomes a fact about the cadence — which every
 * reader can already infer from the footer's collect stamp.
 */

import { describe, expect, test } from "bun:test";
import { standingDate, standingLede, standingNote } from "./wire.ts";

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

describe("the note names a displacement, and only a real one", () => {
  test("a changed line keeps the writer's reason", () => {
    expect(
      standingNote("New line.", { line: "Old line.", updated: "2026-08-27" }, "Harding lost."),
    ).toBe("Harding lost.");
  });

  test("an unchanged line has nothing to name, whatever the writer wrote", () => {
    // The line stood. A note here would describe a displacement that did not
    // happen, and it would go on describing it every day the line kept
    // standing. The CLI decides this, not the writer: it has just compared the
    // two lines, and asking the writer to agree would be a second place for
    // one fact to be wrong.
    expect(standingNote("A line.", { line: "A line.", updated: "2026-08-27" }, "Anything.")).toBe(
      undefined,
    );
  });

  test("a first line may carry one, and need not", () => {
    expect(standingNote("First ever.", undefined, "The season started.")).toBe(
      "The season started.",
    );
    expect(standingNote("First ever.", undefined, undefined)).toBe(undefined);
  });
});

describe("the lede is one standing line made of two fields", () => {
  const lede = {
    headline: "Harding have yet to concede.",
    dek: "Five matches, five clean sheets.",
  };
  const yesterday = { ...lede, updated: "2026-08-27" };

  test("a lede that comes back word for word keeps the date it had", () => {
    const out = standingLede(lede, yesterday, "2026-09-01");
    expect(out.updated).toBe("2026-08-27");
    expect(out.stood).toBe(true);
  });

  test("a changed headline restamps", () => {
    const out = standingLede({ ...lede, headline: "Harding conceded." }, yesterday, "2026-09-01");
    expect(out.updated).toBe("2026-09-01");
    expect(out.stood).toBe(false);
  });

  test("a changed dek restamps too, under a headline that did not move", () => {
    // The reader meets both at once. A dek rewritten beneath a standing
    // headline changes what the page says, and a tag keeping yesterday's date
    // over new prose would be the one thing this field exists to prevent.
    const out = standingLede(
      { ...lede, dek: "Six matches, six clean sheets." },
      yesterday,
      "2026-09-01",
    );
    expect(out.updated).toBe("2026-09-01");
    expect(out.stood).toBe(false);
  });

  test("losing the dek entirely is a change", () => {
    const out = standingLede({ headline: lede.headline }, yesterday, "2026-09-01");
    expect(out.updated).toBe("2026-09-01");
    expect(out.stood).toBe(false);
  });

  test("the first lede ever written takes the collect date", () => {
    const out = standingLede(lede, undefined, "2026-09-01");
    expect(out.updated).toBe("2026-09-01");
    expect(out.stood).toBe(false);
  });

  test("a standing lede with no previous date gets none, not today", () => {
    const out = standingLede(lede, { ...lede }, "2026-09-01");
    expect(out.updated).toBe(undefined);
    expect(out.stood).toBe(true);
  });

  test("the two fields cannot be confused for one another", () => {
    // Two different ledes whose fields, run together with a separator, spell
    // the same string. A key of `headline\ndek` calls them equal and carries
    // yesterday's date over a lede that changed; the JSON encoding does not.
    const a = { headline: "A", dek: "B\nC" };
    const b = { headline: "A\nB", dek: "C" };
    const naive = (l: { headline: string; dek?: string }) => `${l.headline}\n${l.dek ?? ""}`;
    // The test of the test: if these two stop colliding under the naive key,
    // this case has stopped standing for the defect and must be rechosen.
    expect(naive(a)).toBe(naive(b));
    const out = standingLede(a, { ...b, updated: "2026-08-27" }, "2026-09-01");
    expect(out.stood).toBe(false);
    expect(out.updated).toBe("2026-09-01");
  });

  test("a standing lede drops the writer's displacement note", () => {
    // It described a displacement that did not happen today, and left in place
    // it would go on describing it every day the lede kept standing.
    expect(
      standingLede({ ...lede, displaced_by: "Harding conceded." }, yesterday, "2026-09-01")
        .displaced_by,
    ).toBe(undefined);
  });

  test("a displaced lede keeps it", () => {
    expect(
      standingLede(
        { ...lede, headline: "Harding conceded.", displaced_by: "The clean-sheet run ended." },
        yesterday,
        "2026-09-01",
      ).displaced_by,
    ).toBe("The clean-sheet run ended.");
  });
});
