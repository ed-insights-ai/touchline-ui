// ALGORITHM.md section 4: joining lines, stripping penalties, split spellings
// and the cross-season link.

import { describe, expect, test } from "bun:test";
import type { MatchDetail, Player } from "../../src/lib/model.ts";
import { readPenalties } from "./penalties.ts";
import {
  contradicts,
  mostCommon,
  nameParts,
  type PlayerSeason,
  playerSeasons,
  rosterEntryFor,
  type Sheet,
  type SheetLine,
  sameName,
  splitSpellingPairs,
} from "./players.ts";

const line = (over: Partial<SheetLine> & { name: string }): SheetLine => ({
  playerId: null,
  ref: null,
  number: null,
  position: null,
  started: false,
  minutes: 90,
  goals: 0,
  shots: 0,
  penGoals: 0,
  penAttempts: 0,
  ...over,
});

const sheet = (identity: string, lines: SheetLine[], over: Partial<Sheet> = {}): Sheet => ({
  identity,
  date: identity,
  opponent: "2026:opp",
  venue: "home",
  lines,
  ...over,
});

const unit = () => ({ goals: 1, shots: 1 });

describe("joining a person's lines inside a season", () => {
  test("player_ref, page id and folded name each join; the three together make one person", () => {
    const ps = playerSeasons(
      "x",
      2026,
      [
        // Own page: the page id and a page ref.
        sheet("m1", [
          line({ name: "Noé Coutiño", playerId: "11", ref: { id: "11", source: "page" } }),
        ]),
        // The opponent's page: no page id, the collector's twin ref, no accents.
        sheet("m2", [line({ name: "Noe Coutino", ref: { id: "11", source: "twin" } })]),
        // A legacy file: no ref at all, only the name.
        sheet("m3", [line({ name: "Noe Coutino" })]),
      ],
      unit,
    );
    expect(ps).toHaveLength(1);
    const p = ps[0] as PlayerSeason;
    expect(p.minutes).toBe(270);
    expect(p.matches).toBe(3);
    // The name the programme's own page prints, and its letters-only fold.
    expect(p.name).toBe("Noé Coutiño");
    expect(p.key).toBe("noecoutino");
    expect(p.playerId).toBe("11");
  });

  test("a synthetic key ref is its own namespace, not a page id", () => {
    const ps = playerSeasons(
      "x",
      2026,
      [
        sheet("m1", [line({ name: "Ann Lee", ref: { id: "x:annlee:4", source: "key" } })]),
        sheet("m2", [line({ name: "Bea Kim", playerId: "x:annlee:4" })]),
      ],
      unit,
    );
    expect(ps).toHaveLength(2);
  });

  test("a line without minutes is skipped whole, but still says who the person is", () => {
    const [p] = playerSeasons(
      "x",
      2026,
      [sheet("m1", [line({ name: "Ann Lee", minutes: null, goals: 3, shots: 5, started: true })])],
      unit,
    );
    expect(p?.minutes).toBe(0);
    expect(p?.matches).toBe(0);
    expect(p?.starts).toBe(0);
    expect(p?.adjG).toBe(0);
    expect(p?.printedMinutes).toBe(false);
    expect(p?.lineCount).toBe(1);
  });

  test("minutes > 0 is an appearance; started counts a start", () => {
    const [p] = playerSeasons(
      "x",
      2026,
      [
        sheet("m1", [line({ name: "Ann Lee", minutes: 0, started: false })]),
        sheet("m2", [line({ name: "Ann Lee", minutes: 30, started: true })]),
      ],
      unit,
    );
    expect(p?.minutes).toBe(30);
    expect(p?.matches).toBe(1);
    expect(p?.starts).toBe(1);
  });
});

describe("penalties stripped (g = max(goals − pen_goals, 0), s = max(shots − pen_attempts, 0))", () => {
  test("a penalty goal and its attempt come off goals and shots", () => {
    // 2 goals from 4 shots, one of each a penalty: g = 1, s = 3.
    const [p] = playerSeasons(
      "x",
      2026,
      [sheet("m1", [line({ name: "Ann Lee", goals: 2, shots: 4, penGoals: 1, penAttempts: 1 })])],
      () => ({ goals: 0.8, shots: 1.25 }),
    );
    // adjG = 1 / 0.8 = 1.25; adjS = 3 / 1.25 = 2.4.
    expect(p?.adjG).toBeCloseTo(1.25, 12);
    expect(p?.adjS).toBeCloseTo(2.4, 12);
  });

  test("more penalty attempts than shots floors at zero, never below", () => {
    // One shot printed, three penalty attempts logged (the stat crew did not
    // count the kicks as shots): s = max(1 − 3, 0) = 0. One goal, two penalty
    // goals: g = max(1 − 2, 0) = 0.
    const [p] = playerSeasons(
      "x",
      2026,
      [sheet("m1", [line({ name: "Ann Lee", goals: 1, shots: 1, penGoals: 2, penAttempts: 3 })])],
      unit,
    );
    expect(p?.adjG).toBe(0);
    expect(p?.adjS).toBe(0);
    expect(p?.penGoals).toBe(2);
    expect(p?.penAttempts).toBe(3);
  });

  test("the opponent's divisor is per sheet: dfn[opponent] × h", () => {
    // One non-penalty goal against each of two defences: 1/0.5 + 1/2 = 2.5.
    const [p] = playerSeasons(
      "x",
      2026,
      [
        sheet("m1", [line({ name: "Ann Lee", goals: 1 })], { opponent: "2026:tight" }),
        sheet("m2", [line({ name: "Ann Lee", goals: 1 })], { opponent: "2026:open" }),
      ],
      (s) => ({ goals: s.opponent === "2026:tight" ? 0.5 : 2, shots: 1 }),
    );
    expect(p?.adjG).toBeCloseTo(2.5, 12);
  });
});

describe("reading penalties off the play-by-play", () => {
  const detail = (plays: MatchDetail["plays"]): MatchDetail => ({
    source_url: "https://example.test/boxscore/1",
    teams: [
      {
        name: "Fort Hays St.",
        abbr: "FHSU",
        periods: [1, 0],
        players: [{ name: "Juan Linares" }, { name: "Rhys Laws" }],
      },
      {
        name: "Coker",
        abbr: "COKERM",
        periods: [0, 0],
        players: [{ name: "Celestin Blondel" }],
      },
    ],
    plays,
  });

  test("an attempt by the player it names; a goal when it says PENALTY KICK GOAL", () => {
    const r = readPenalties(
      detail([
        { period: "1", team: 0, type: "penalty", text: "FHSU Juan Linares PENALTY KICK GOAL." },
        { period: "2", team: 0, type: "penalty", text: "FHSU Juan Linares penalty kick goal." },
        {
          period: "2",
          team: 1,
          type: "penalty",
          text: "PENALTY KICK by COKERM Celestin Blondel WIDE.",
        },
      ]),
    );
    expect(r.unattributed).toHaveLength(0);
    expect(r.credits.map((c) => [c.side, c.line.name, c.goal])).toEqual([
      [0, "Juan Linares", true],
      [0, "Juan Linares", true],
      [1, "Celestin Blondel", false],
    ]);
  });

  test("a play that names no one on the sheet is nobody's attempt", () => {
    const r = readPenalties(
      detail([{ period: "1", team: 0, type: "penalty", text: "*penalty kick" }]),
    );
    expect(r.credits).toHaveLength(0);
    expect(r.unattributed).toHaveLength(1);
  });

  test("only type penalty counts: a shootout kick is not a penalty attempt", () => {
    const r = readPenalties(
      detail([
        { period: "SO", team: 0, type: "shootout", text: "Juan Linares PENALTY KICK GOAL." },
      ]),
    );
    expect(r.credits).toHaveLength(0);
    expect(r.unattributed).toHaveLength(0);
  });
});

describe("split spellings", () => {
  const two = (a: SheetLine, aSheets: string[], b: SheetLine, bSheets: string[]) =>
    playerSeasons(
      "x",
      2026,
      [
        ...aSheets.map((id) => sheet(id, [a])),
        ...bSheets.map((id) => sheet(`${id}b`, [b], { identity: id })),
      ],
      unit,
    );

  test("same number, surname and first initial, never on one sheet: an unresolved pair", () => {
    // "Juan Linares" and "Juanito Linares": folds juanlinares and juanitolinares,
    // both #7, initial j, surname linares, on m1/m2 and m3 only.
    const ps = two(
      line({ name: "Juan Linares", number: "7" }),
      ["m1", "m2"],
      line({ name: "Juanito Linares", number: "7" }),
      ["m3"],
    );
    expect(ps).toHaveLength(2);
    expect(splitSpellingPairs(ps)).toEqual([[0, 1]]);
  });

  test("they are not a pair when they share a sheet, a number is different, or the initial is", () => {
    const together = two(
      line({ name: "Juan Linares", number: "7" }),
      ["m1"],
      line({ name: "Juanito Linares", number: "7" }),
      ["m1"],
    );
    expect(splitSpellingPairs(together)).toEqual([]);
    const otherNumber = two(
      line({ name: "Juan Linares", number: "7" }),
      ["m1"],
      line({ name: "Juanito Linares", number: "8" }),
      ["m2"],
    );
    expect(splitSpellingPairs(otherNumber)).toEqual([]);
    const otherInitial = two(
      line({ name: "Juan Linares", number: "7" }),
      ["m1"],
      line({ name: "Pablo Linares", number: "7" }),
      ["m2"],
    );
    expect(splitSpellingPairs(otherInitial)).toEqual([]);
  });

  test("the surname is the last word, or what comes before a comma", () => {
    expect(nameParts("Juan Carlos Linares")).toEqual({ initial: "j", surname: "linares" });
    expect(nameParts("Linares, Juan")).toEqual({ initial: "j", surname: "linares" });
    expect(nameParts("Pelé")).toBeNull();
  });
});

describe("the roster entry and the cross-season link", () => {
  const roster = (over: Partial<Player> & { name: string }): Player => ({ ...over });
  const p = (name: string, over: Partial<PlayerSeason> = {}): PlayerSeason => {
    const [ps] = playerSeasons("x", 2026, [sheet("m1", [line({ name, number: "4" })])], unit);
    return { ...(ps as PlayerSeason), ...over };
  };

  test("the roster entry is found by page id first, then by folded name", () => {
    const me = p("Ann Lee", { ids: new Set(["77"]) });
    const byId = roster({ name: "Annie Lee", source_url: "https://x.test/roster/annie-lee/77" });
    expect(rosterEntryFor(me, [roster({ name: "Ann Lee" }), byId])).toBe(byId);
    const byName = roster({ name: "Ann  Lee" });
    expect(rosterEntryFor(p("Ann Lee"), [byName])).toBe(byName);
  });

  test("two roster entries of one name are settled by the shirt number, or by nothing", () => {
    const four = roster({ name: "Ann Lee", number: "4" });
    const nine = roster({ name: "Ann Lee", number: "9" });
    expect(rosterEntryFor(p("Ann Lee"), [nine, four])).toBe(four);
    expect(
      rosterEntryFor(p("Ann Lee"), [nine, roster({ name: "Ann Lee", number: "8" })]),
    ).toBeNull();
  });

  test("the same folded name the season before links; a contradicting roster breaks it", () => {
    const now = p("Ann Lee");
    const before = p("Ann Lee", { season: 2025 });
    expect(sameName(now, [p("Bea Kim"), before])).toBe(before);
    // Both rosters list a home town and the towns differ: no link.
    expect(
      contradicts(
        roster({ name: "Ann Lee", hometown: "Searcy, Ark." }),
        roster({ name: "Ann Lee", hometown: "Leeds, England" }),
      ),
    ).toBe(true);
    // The same town, spelled with other punctuation and case, is the same town.
    expect(
      contradicts(
        roster({ name: "Ann Lee", hometown: "Searcy, Ark." }),
        roster({ name: "Ann Lee", hometown: "searcy ark" }),
      ),
    ).toBe(false);
    // Only one roster lists a town: nothing to contradict.
    expect(
      contradicts(
        roster({ name: "Ann Lee", hometown: "Searcy, Ark." }),
        roster({ name: "Ann Lee" }),
      ),
    ).toBe(false);
    // The class year goes backwards: Junior, then Sophomore.
    expect(
      contradicts(
        roster({ name: "Ann Lee", class_year: "Junior" }),
        roster({ name: "Ann Lee", class_year: "Sophomore" }),
      ),
    ).toBe(true);
    // A redshirt year repeats the class: not backwards.
    expect(
      contradicts(
        roster({ name: "Ann Lee", class_year: "Freshman" }),
        roster({ name: "Ann Lee", class_year: "Redshirt Freshman" }),
      ),
    ).toBe(false);
  });

  test("two of one name the season before are settled by a shared number, or not linked", () => {
    const now = p("Ann Lee", { numbers: new Set(["4"]) });
    const a = p("Ann Lee", { numbers: new Set(["4"]) });
    const b = p("Ann Lee", { numbers: new Set(["9"]) });
    expect(sameName(now, [a, b])).toBe(a);
    expect(sameName(now, [b, p("Ann Lee", { numbers: new Set(["8"]) })])).toBeNull();
  });

  test("mostCommon breaks a tie in code-unit order", () => {
    expect(mostCommon(["b", "a", "b", "a"])).toBe("a");
    expect(mostCommon([])).toBeNull();
  });
});
