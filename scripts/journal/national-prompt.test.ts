/**
 * The national headline's persistence, as data.
 *
 * The Southwest Baptist run (tl-bb4r): one subject stood at the top of the
 * site from 2026-09-03 to 09-05, and when its line went false on 09-06 the
 * replacement was the same subject's next fact. The prompt had asked the
 * writer to displace a line only for "something more newsworthy" and had put
 * nothing else in front of it, so the fact in front of it won every day.
 *
 * These hold the brief and the prompt to the three rules that replaced that:
 * a displacement re-ranks every conference on equal footing, a results night
 * outranks a standing line, and a line ages out at three days. The age and the
 * night's kind are the brief's arithmetic, never the model's, so they are
 * tested as functions.
 */

import { describe, expect, test } from "bun:test";
import { homeSeasons } from "../../src/lib/home.ts";
import type { NationalJournalFile } from "../../src/lib/journal.ts";
import {
  buildNationalBrief,
  type NightResult,
  nightKind,
  rankCandidates,
  STANDING_MAX_AGE_DAYS,
  sideMeaning,
  standingAge,
  standingLine,
} from "./national.ts";
import { buildNationalPrompt, PERSISTENCE } from "./national-prompt.ts";

const tally = (wins: number, draws: number, losses: number) => ({ wins, draws, losses });

const results: NightResult[] = [
  {
    match: "2026-09-05 lewis v drury  ·  1-1",
    codes: ["GLVC"],
    sides: [
      { programme: "lewis", conference: "GLVC", before: tally(1, 1, 1), after: tally(1, 2, 1) },
      { programme: "drury", conference: "GLVC", before: tally(2, 0, 1), after: tally(2, 1, 1) },
    ],
  },
  {
    match: "2026-09-05 west-alabama v texas-a-m-international  ·  0-2",
    codes: ["GSC", "LSC"],
    sides: [
      {
        programme: "west-alabama",
        conference: "GSC",
        before: tally(3, 0, 0),
        after: tally(3, 0, 1),
      },
      {
        programme: "texas-a-m-international",
        conference: "LSC",
        before: tally(0, 1, 2),
        after: tally(1, 1, 2),
      },
    ],
  },
];

const conferences = [
  { code: "LSC", stories: ["LSC card line", "LSC journal headline"] },
  { code: "GSC", stories: ["GSC card line"] },
  { code: "GLVC", stories: ["GLVC card line", "GLVC journal headline"] },
];

describe("the brief's candidates on a results night", () => {
  const ranked = rankCandidates(results, conferences);

  test("the night is a results night", () => {
    expect(nightKind(results.length)).toBe("results");
  });

  test("every result comes before any conference's line", () => {
    const kinds = ranked.map((c) => c.kind);
    const lastResult = kinds.lastIndexOf("result");
    const firstCard = kinds.indexOf("card");
    expect(lastResult).toBeLessThan(firstCard);
    expect(ranked.map((c) => c.rank)).toEqual(ranked.map((_, i) => i + 1));
  });

  test("a result that changed a season-level fact ranks ahead of one that did not", () => {
    // West Alabama's unbeaten start ended and TAMIU won for the first time;
    // Lewis and Drury drew and nothing about either season changed.
    expect(ranked[0]?.story).toContain("west-alabama v texas-a-m-international");
    expect(ranked[0]?.meaning).toEqual([
      "west-alabama: unbeaten start over",
      "texas-a-m-international: first win",
    ]);
    expect(ranked[1]?.story).toContain("lewis v drury");
    expect(ranked[1]?.meaning).toEqual([]);
  });

  test("each conference's card line comes before any conference's second story", () => {
    const lines = ranked.filter((c) => c.kind !== "result");
    expect(lines.map((c) => c.story)).toEqual([
      "LSC card line",
      "GSC card line",
      "GLVC card line",
      "LSC journal headline",
      "GLVC journal headline",
    ]);
    expect(lines.map((c) => c.kind)).toEqual(["card", "card", "card", "headline", "headline"]);
  });
});

describe("the brief's candidates on a quiet day", () => {
  const ranked = rankCandidates([], conferences);

  test("the night is quiet", () => {
    expect(nightKind(0)).toBe("quiet");
  });

  test("there is no result to lead with, and the cards keep their round-robin order", () => {
    expect(ranked.some((c) => c.kind === "result")).toBe(false);
    expect(ranked.map((c) => c.story)).toEqual([
      "LSC card line",
      "GSC card line",
      "GLVC card line",
      "LSC journal headline",
      "GLVC journal headline",
    ]);
  });
});

describe("what a result meant is read off the record, not the score", () => {
  test("a first defeat with no result before it is a first defeat, not a run ended", () => {
    expect(
      sideMeaning({
        programme: "x",
        conference: "LSC",
        before: tally(0, 0, 0),
        after: tally(0, 0, 1),
      }),
    ).toEqual(["x: first result of the season", "x: first defeat"]);
  });

  test("a side that has done this before means nothing new", () => {
    expect(
      sideMeaning({
        programme: "x",
        conference: "LSC",
        before: tally(2, 1, 2),
        after: tally(2, 1, 3),
      }),
    ).toEqual([]);
  });
});

describe("the standing line ages out at three days, and not at two", () => {
  test("the threshold is three", () => {
    expect(STANDING_MAX_AGE_DAYS).toBe(3);
  });

  test("two days old stands", () => {
    expect(standingAge("2026-09-04", "2026-09-06")).toEqual({
      updated: "2026-09-04",
      age_days: 2,
      aged_out: false,
    });
  });

  test("three days old has aged out", () => {
    // The Southwest Baptist line: stamped 09-03, still standing 09-06.
    expect(standingAge("2026-09-03", "2026-09-06")).toEqual({
      updated: "2026-09-03",
      age_days: 3,
      aged_out: true,
    });
  });

  test("the day it changed it is not old at all", () => {
    expect(standingAge("2026-09-06", "2026-09-06").aged_out).toBe(false);
  });

  test("a line with no stamp has no age and does not age out", () => {
    // The first run after the field existed: the site does not know how old
    // the sentence is, and a rule that guessed would be a rule the data did
    // not drive.
    expect(standingAge(undefined, "2026-09-06")).toEqual({
      updated: null,
      age_days: null,
      aged_out: false,
    });
  });
});

describe("the standing line knows whether it is about last night", () => {
  const previous = {
    headline: "Southwest Baptist drop first points, still outscore the division",
    dek: "A dek.",
    updated: "2026-09-06",
    fixture_ref: "2026-09-05 southwest-baptist v missouri-st-louis",
  };

  test("its fixture_ref among last night's matches makes it about that night", () => {
    const line = standingLine(previous, "2026-09-06", [
      { match: "2026-09-05 southwest-baptist v missouri-st-louis  ·  1-1" },
    ]);
    expect(line?.about_last_night).toBe(true);
    expect(line?.aged_out).toBe(false);
    expect(line?.max_age_days).toBe(3);
  });

  test("a fixture_ref from another night, or none, does not", () => {
    expect(
      standingLine(previous, "2026-09-07", [{ match: "2026-09-06 lewis v drury  ·  1-1" }])
        ?.about_last_night,
    ).toBe(false);
    expect(
      standingLine({ ...previous, fixture_ref: undefined }, "2026-09-06", [
        { match: "2026-09-05 southwest-baptist v missouri-st-louis  ·  1-1" },
      ])?.about_last_night,
    ).toBe(false);
  });

  test("no previous journal, no standing line", () => {
    expect(standingLine(null, "2026-09-06", [])).toBeNull();
  });
});

describe("the live brief carries the night, the standing line and the candidates", () => {
  const seasons = homeSeasons();

  test("without a previous journal the standing line is null", () => {
    const brief = buildNationalBrief(seasons);
    expect(brief.standing).toBeNull();
    expect(brief.night.results).toBe(brief.last_night.results.length);
    expect(brief.night.kind).toBe(brief.last_night.results.length > 0 ? "results" : "quiet");
    // Every result is a candidate, and every conference's card line is one.
    expect(brief.candidates.filter((c) => c.kind === "result").length).toBe(brief.night.results);
    const cards = brief.candidates.filter((c) => c.kind === "card").map((c) => c.story);
    expect(cards).toEqual(brief.surfaces.cards.map((c) => c.line));
  });

  test("with one, its age is computed against the page's as-of", () => {
    const previous: NationalJournalFile = {
      schema: "touchline.national/1",
      season: seasons[0]?.fixtures.season ?? 2026,
      gender: "men",
      generated_at: "x",
      data_collected_at: "x",
      headline: "A line",
      updated: "2026-01-01",
    };
    const brief = buildNationalBrief(seasons, previous);
    expect(brief.standing?.headline).toBe("A line");
    expect(brief.standing?.age_days).toBeGreaterThan(3);
    expect(brief.standing?.aged_out).toBe(true);
  });
});

describe("the prompt carries the three rules", () => {
  test("displacement re-ranks every conference, and the falsified subject has no priority", () => {
    expect(PERSISTENCE).toContain("DISPLACEMENT IS A FRESH RANKING, ON EQUAL FOOTING");
    expect(PERSISTENCE).toContain("THE FALSIFIED SUBJECT HAS NO PRIORITY");
  });

  test("a results night outranks a standing line, unless the line is about that night", () => {
    expect(PERSISTENCE).toContain("A RESULTS NIGHT OUTRANKS A STANDING LINE");
    expect(PERSISTENCE).toContain('"standing.about_last_night"');
  });

  test("a standing line ages out, and displaced_by then says age", () => {
    expect(PERSISTENCE).toContain(`AGES OUT AT ${STANDING_MAX_AGE_DAYS} DAYS`);
    expect(PERSISTENCE).toContain('"displaced_by" is the single word "age"');
    expect(PERSISTENCE).toContain("do not work it out yourself");
  });

  test("and a quiet day keeps the line verbatim", () => {
    expect(PERSISTENCE).toContain("VERBATIM");
    expect(PERSISTENCE).toContain("QUIET DAY");
  });

  test("the rendered prompt tells the writer the night's kind and the line's age", () => {
    const seasons = homeSeasons();
    const previous: NationalJournalFile = {
      schema: "touchline.national/1",
      season: 2026,
      gender: "men",
      generated_at: "x",
      data_collected_at: "x",
      headline: "A line",
      updated: "2026-01-01",
    };
    const brief = buildNationalBrief(seasons, previous);
    const prompt = buildNationalPrompt({ brief, fixtures: [], previous });
    expect(prompt).toContain("AGES OUT AT 3 DAYS");
    expect(prompt).toContain(brief.night.kind === "results" ? "RESULTS NIGHT" : "QUIET DAY —");
    expect(prompt).toContain('aged out          YES — it yields today, "displaced_by": "age"');
    expect(prompt).toContain("CANDIDATES — every story the headline may be chosen from");
  });
});
