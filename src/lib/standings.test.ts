/**
 * A conference that prints its standings in divisions gets its table grouped
 * the way it prints them; every other conference gets the table it always had.
 * The coordinator's ruling, bead tl-4sg.40: `programmes[].division` on the
 * fixtures file, all-or-none per conference-season, spelled as the conference
 * prints it (touchline.fixtures/2, contract changelog 2026-09-04, rib 51dc0d2).
 *
 * The fixtures file is synthetic and lives in a data home of its own under a
 * temporary directory, so nothing here depends on any conference existing in
 * the real data home, and the file goes through the same loader and schema
 * every real season file does.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataHome, dataRoot, loadFixtures } from "./data.ts";
import { type FixturesFile, type Season, table } from "./derive.ts";
import { nameBookFor } from "./names.ts";
import {
  CONFERENCE_WIDE_TITLE,
  divisionalTables,
  groupByDivision,
  printedDivisions,
} from "./standings.ts";

// Membership order, as the rib writes programmes[]: the first division the
// conference prints is "Valley", then "Coast". Alphabetical order would put
// Coast first, so a grouping in the wrong order fails here by name.
const divisional: FixturesFile = {
  schema: "touchline.fixtures/2",
  season: 2026,
  gender: "men",
  conference: "TST",
  collected_at: "2026-09-10T00:00:00Z",
  programmes: [
    { slug: "alpha", name: "Alpha", conference: "TST", division: "Valley" },
    { slug: "bravo", name: "Bravo", conference: "TST", division: "Coast" },
    { slug: "charlie", name: "Charlie", conference: "TST", division: "Valley" },
    { slug: "delta", name: "Delta", conference: "TST", division: "Coast" },
  ],
  fixtures: [
    // alpha 6 points, bravo 3, delta 1 on -1, charlie 1 on -3 — so the
    // conference-wide order is alpha, bravo, delta, charlie, and each
    // division's table interleaves with the other's.
    {
      id: "1",
      date: "2026-09-01",
      home: "bravo",
      away: "charlie",
      status: "final",
      home_score: 3,
      away_score: 0,
      conference_game: true,
    },
    {
      id: "2",
      date: "2026-09-02",
      home: "alpha",
      away: "delta",
      status: "final",
      home_score: 2,
      away_score: 1,
      conference_game: true,
    },
    {
      id: "3",
      date: "2026-09-03",
      home: "delta",
      away: "charlie",
      status: "final",
      home_score: 1,
      away_score: 1,
      conference_game: true,
    },
    {
      id: "4",
      date: "2026-09-04",
      home: "alpha",
      away: "charlie",
      status: "final",
      home_score: 1,
      away_score: 0,
      conference_game: true,
    },
  ],
};

/** The same season with no division on any programme: a one-table conference. */
const plain: FixturesFile = {
  ...divisional,
  programmes: divisional.programmes.map(({ division: _, ...p }) => p),
};

/** The same season with one division missing — a file the rib never writes. */
const mixed: FixturesFile = {
  ...divisional,
  programmes: divisional.programmes.map((p, i) => {
    if (i !== 2) return p;
    const { division: _, ...rest } = p;
    return rest;
  }),
};

function seasonOf(fixtures: FixturesFile): Season {
  return {
    key: fixtures.conference.toLowerCase(),
    fixtures,
    rosters: null,
    stats: null,
    matches: null,
    coverage: null,
    names: nameBookFor(fixtures),
    asOf: "2026-09-10",
    collectedAt: fixtures.collected_at,
  };
}

const slugs = (rows: readonly { slug: string }[]): string[] => rows.map((r) => r.slug);

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "touchline-standings-"));
  mkdirSync(join(root, "data", "fixtures"), { recursive: true });
  writeFileSync(join(root, "data", "fixtures", "2026-men-tst.json"), JSON.stringify(divisional));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("a fixtures file that names divisions", () => {
  test("reads under the contract, through the data home TOUCHLINE_DATA_DIR names", () => {
    const before = process.env.TOUCHLINE_DATA_DIR;
    process.env.TOUCHLINE_DATA_DIR = root;
    try {
      expect(dataRoot()).toBe(root);
      const file = loadFixtures(2026, "men", "tst", dataHome(dataRoot()));
      expect(file.programmes.map((p) => p.division)).toEqual([
        "Valley",
        "Coast",
        "Valley",
        "Coast",
      ]);
      expect(file).toEqual(divisional);
    } finally {
      if (before === undefined) delete process.env.TOUCHLINE_DATA_DIR;
      else process.env.TOUCHLINE_DATA_DIR = before;
    }
  });

  test("groups the conference table by division, in the order the conference prints them", () => {
    const s = seasonOf(divisional);
    const rows = table(s);
    expect(slugs(rows)).toEqual(["alpha", "bravo", "delta", "charlie"]);
    const groups = divisionalTables(s, rows);
    expect(groups).not.toBeNull();
    // First appearance in programmes[], not the alphabet.
    expect(groups?.map((g) => g.division)).toEqual(["Valley", "Coast"]);
    // Each division's rows in the conference-wide order, figures untouched.
    expect(groups?.map((g) => slugs(g.rows))).toEqual([
      ["alpha", "charlie"],
      ["bravo", "delta"],
    ]);
    for (const g of groups ?? []) {
      for (const r of g.rows) expect(rows.find((x) => x.slug === r.slug)).toEqual(r);
    }
    // Every row lands in exactly one division.
    expect((groups ?? []).flatMap((g) => slugs(g.rows)).sort()).toEqual(slugs(rows).sort());
  });

  test("keeps the conference-wide table beneath, under its own head", () => {
    const s = seasonOf(divisional);
    // The page renders the same rows once more after the divisional tables;
    // grouping does not consume or reorder them.
    const rows = table(s);
    divisionalTables(s, rows);
    expect(slugs(rows)).toEqual(["alpha", "bravo", "delta", "charlie"]);
    expect(table(s)).toEqual(rows);
    expect(CONFERENCE_WIDE_TITLE).toBe("THE CONFERENCE TABLE");
  });
});

describe("a conference that publishes one table", () => {
  test("has no divisions and the table it always had", () => {
    const s = seasonOf(plain);
    expect(printedDivisions(plain)).toBeNull();
    expect(divisionalTables(s, table(s))).toBeNull();
    // The rows are the same rows the divisional file yields: a division is a
    // grouping, never an input to the table.
    expect(table(s)).toEqual(table(seasonOf(divisional)));
  });

  test("an empty membership is one table too", () => {
    expect(printedDivisions({ ...plain, programmes: [] })).toBeNull();
  });
});

describe("a mixed file, which the rib's check refuses", () => {
  test("falls back to one table and says so in the build log, naming the odd programme", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const s = seasonOf(mixed);
      expect(groupByDivision(mixed, table(s))).toBeNull();
      expect(divisionalTables(s, table(s))).toBeNull();
      expect(warn).toHaveBeenCalledTimes(2);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain("[touchline] TST men 2026 mixes divisions");
      expect(message).toContain("charlie");
      expect(message).not.toContain("alpha");
    } finally {
      warn.mockRestore();
    }
  });
});
