/**
 * The table before conference play opens ranks every countable match a member
 * has played, against anyone, and says so; the conference table is untouched
 * by it. Owner's ruling 2026-09-01: a table has a top and a bottom to read.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeOverallTable, computeTable, type FixturesFile } from "./model.ts";

const file: FixturesFile = {
  schema: "touchline.fixtures/2",
  season: 2026,
  gender: "men",
  conference: "tst",
  collected_at: "2026-09-01T00:00:00Z",
  programmes: [
    { slug: "alpha", name: "Alpha", conference: "tst" },
    { slug: "bravo", name: "Bravo", conference: "tst" },
    { slug: "charlie", name: "Charlie", conference: "tst" },
  ],
  fixtures: [
    // A win against a non-member: counts for the member alone.
    {
      id: "1",
      date: "2026-08-20",
      home: "alpha",
      away: "xray",
      status: "final",
      home_score: 2,
      away_score: 0,
      conference_game: false,
    },
    // A narrower win: the same points, a worse goal difference.
    {
      id: "2",
      date: "2026-08-21",
      home: "yankee",
      away: "charlie",
      status: "final",
      home_score: 0,
      away_score: 1,
      conference_game: false,
    },
    // A draw.
    {
      id: "3",
      date: "2026-08-22",
      home: "bravo",
      away: "xray",
      status: "final",
      home_score: 1,
      away_score: 1,
      conference_game: false,
    },
    // A friendly counts nowhere, however lopsided.
    {
      id: "4",
      date: "2026-08-23",
      home: "bravo",
      away: "xray",
      status: "final",
      home_score: 9,
      away_score: 0,
      conference_game: false,
      match_type: "exhibition",
    },
    // A score gap rests on nothing.
    {
      id: "5",
      date: "2026-08-24",
      home: "bravo",
      away: "zulu",
      status: "final",
      conference_game: false,
    },
    // The conference opener, still to come.
    {
      id: "6",
      date: "2026-09-23",
      home: "alpha",
      away: "bravo",
      status: "scheduled",
      conference_game: true,
    },
  ],
};

describe("the table before conference play opens", () => {
  const rows = computeOverallTable(file);

  test("ranks members on every countable match, points then goal difference", () => {
    expect(rows.map((r) => r.slug)).toEqual(["alpha", "charlie", "bravo"]);
    expect(rows[0]).toMatchObject({
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 2,
      goalsAgainst: 0,
      points: 3,
    });
    expect(rows[1]).toMatchObject({ won: 1, drawn: 0, lost: 0, goalDiff: 1, points: 3 });
    expect(rows[2]).toMatchObject({ won: 0, drawn: 1, lost: 0, played: 1, points: 1 });
  });

  test("a non-member never gets a row, and a friendly or a score gap counts nowhere", () => {
    expect(rows.some((r) => r.slug === "xray" || r.slug === "yankee" || r.slug === "zulu")).toBe(
      false,
    );
    const bravo = rows.find((r) => r.slug === "bravo");
    expect(bravo?.goalsFor).toBe(1);
    expect(bravo?.played).toBe(1);
  });

  test("the conference table is untouched: all zeros until a conference result", () => {
    for (const r of computeTable(file)) expect(r).toMatchObject({ played: 0, points: 0 });
  });
});

describe("the season page's middle, by the numbers", () => {
  const root = join(import.meta.dir, "..");
  const page = readFileSync(join(root, "pages/[conference]/index.astro"), "utf8");
  const table = readFileSync(join(root, "components/ConferenceTable.astro"), "utf8");

  test("the section is BY THE NUMBERS and wears no evidence chips", () => {
    expect(page).toContain("BY THE NUMBERS");
    expect(page).not.toContain("THE PATTERN");
    expect(page).not.toContain("EvidenceChip");
    expect(page).not.toContain("pat-key");
  });

  test("every line still opens on its figures, marked by a caret", () => {
    expect(page).toContain('<i class="caret" aria-hidden="true"></i>');
    expect(page).toContain('<details class="disclosure finding">');
    expect(page).toContain('<details class="disclosure chart-basis">');
  });

  test("the table ranks all matches until conference play opens, and says so", () => {
    expect(page).toContain("live ? table(season) : overallTable(season)");
    expect(page).toContain("opens={opens}");
    expect(table).toContain("ALL MATCHES UNTIL CONFERENCE PLAY OPENS");
    expect(table).toContain("CONFERENCE MATCHES ONLY");
    expect(table).toContain("3–1–0 POINTS");
    expect(table).not.toContain("table-state");
    expect(table).not.toContain("statement");
  });

  test("no reader surface prints an evidence chip any more", () => {
    for (const rel of [
      "pages/about.astro",
      "pages/[conference]/team/[slug].astro",
      "components/PlayerSheet.astro",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).not.toContain("EvidenceChip");
      expect(src, rel).not.toContain("chip-observed");
    }
  });
});
