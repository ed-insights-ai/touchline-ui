import { describe, expect, test } from "bun:test";
import type { TableRow } from "./derive.ts";
import { regularChampion, titleMarks } from "./titles.ts";

const row = (slug: string, points: number): TableRow => ({
  slug,
  name: slug,
  played: 10,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDiff: 0,
  points,
});

describe("the regular-season title", () => {
  const rows = [row("florida-tech", 23), row("embry-riddle", 19)];

  test("goes to the top of a final table that stands alone on points", () => {
    expect(regularChampion(rows, true, false)).toBe("florida-tech");
  });

  test("is not named while the table is still the regular season's in play", () => {
    expect(regularChampion(rows, false, false)).toBeNull();
  });

  test("is not named where two finish level: the conference's tiebreak decides", () => {
    expect(regularChampion([row("trevecca", 20), row("aum", 20)], true, false)).toBeNull();
  });

  test("is not named for a conference that prints its standings in divisions", () => {
    expect(regularChampion(rows, true, true)).toBeNull();
  });

  test("is not named for an empty table", () => {
    expect(regularChampion([], true, false)).toBeNull();
  });
});

describe("a team's title marks", () => {
  const none = { regular: null, tournament: null, national: null };

  test("a double is one ribbon with both titles in words", () => {
    const t = { ...none, regular: "fort-hays-state", tournament: "fort-hays-state" };
    expect(titleMarks(t, "fort-hays-state")).toEqual([
      {
        kind: "ribbon",
        words: "Regular-season and tournament champion",
        short: "SEASON & TOURNAMENT",
      },
    ]);
  });

  test("split titles give each team its own ribbon", () => {
    const t = { ...none, regular: "florida-tech", tournament: "lynn" };
    expect(titleMarks(t, "florida-tech").map((m) => m.short)).toEqual(["SEASON CHAMPION"]);
    expect(titleMarks(t, "lynn").map((m) => m.short)).toEqual(["TOURNAMENT CHAMPION"]);
    expect(titleMarks(t, "barry")).toEqual([]);
  });

  test("the national champion wears the trophy after its ribbon", () => {
    const t = { regular: null, tournament: "lynn", national: "lynn" };
    expect(titleMarks(t, "lynn").map((m) => m.kind)).toEqual(["ribbon", "trophy"]);
  });

  test("nothing is drawn before a title is decided", () => {
    expect(titleMarks(none, "lynn")).toEqual([]);
  });
});
