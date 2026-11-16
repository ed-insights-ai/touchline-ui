// ALGORITHM.md section 4 (version 2.2): joining lines (with the roster pass),
// the values an entry prints, the sums with a doubled line and penalties, the
// second penalty source, split spellings and the cross-season link.

import { describe, expect, test } from "bun:test";
import type { Player, PlayerStats } from "../../src/lib/model.ts";
import {
  applyStatsPenalties,
  classStep,
  contradicts,
  type JoinMeasures,
  mostCommon,
  type PlayerSeason,
  playerSeasons,
  rosterBioId,
  rosterIndex,
  rosterLookup,
  type Sheet,
  type SheetLine,
  sameName,
  splitSpellingPairs,
  statsRowFor,
  townsDiffer,
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
  ...over,
});

const sheet = (identity: string, lines: SheetLine[], over: Partial<Sheet> = {}): Sheet => ({
  identity,
  date: identity,
  opponent: "2026:opp",
  venue: "home",
  lines,
  credits: [],
  ...over,
});

const unit = () => ({ goals: 1, shots: 1 });

const roster = (over: Partial<Player> & { name: string }): Player => ({ ...over });
/** A roster row with a bio id (the trailing number of its URL). */
const bio = (id: string, over: Partial<Player> & { name: string }): Player =>
  roster({ source_url: `https://x.test/roster/${id}`, ...over });

const measures = (): JoinMeasures => ({ blocked: 0, rosterFound: 0, rosterConflicts: 0 });

const join = (sheets: Sheet[], players: Player[] = [], rosterPass = true, m = measures()) =>
  playerSeasons("x", 2026, sheets, players, unit, { rosterPass }, m);

describe("4.2, passes 1, 2 and 4: player_ref, page id, folded name", () => {
  test("player_ref, page id and folded name each join; the three together make one person", () => {
    const ps = join([
      // Own page: the page id and a page ref.
      sheet("m1", [
        line({ name: "Noé Coutiño", playerId: "11", ref: { id: "11", source: "page" } }),
      ]),
      // The opponent's page: no page id, the collector's twin ref, no accents.
      sheet("m2", [line({ name: "Noe Coutino", ref: { id: "11", source: "twin" } })]),
      // A legacy file: no ref at all, only the name, given name last.
      sheet("m3", [line({ name: "Coutino, Noe" })]),
    ]);
    expect(ps).toHaveLength(1);
    const p = ps[0] as PlayerSeason;
    expect(p.minutes).toBe(270);
    expect(p.matches).toBe(3);
    expect(p.key).toBe("noecoutino");
    expect(p.playerId).toBe("11");
  });

  test("a synthetic key ref is its own namespace, not a page id", () => {
    const ps = join([
      sheet("m1", [line({ name: "Ann Lee", ref: { id: "x:annlee:4", source: "key" } })]),
      sheet("m2", [line({ name: "Bea Kim", playerId: "x:annlee:4" })]),
    ]);
    expect(ps).toHaveLength(2);
  });

  test("a pass never merges two groups that hold different page ids", () => {
    const m = measures();
    const ps = join(
      [
        sheet("m1", [line({ name: "Ann Lee", playerId: "11" })]),
        sheet("m2", [line({ name: "Ann Lee", playerId: "12" })]),
        // Folds alike, no id: pass 4 joins it to the first group that takes it.
        sheet("m3", [line({ name: "Lee, Ann" })]),
      ],
      [],
      true,
      m,
    );
    expect(ps.map((p) => [p.playerId, p.minutes])).toEqual([
      ["11", 180],
      ["12", 90],
    ]);
    // Pass 4 wanted 12 with 11, and was refused.
    expect(m.blocked).toBe(1);
  });
});

describe("4.2, pass 3: the roster pass", () => {
  const rows = [
    bio("101", { name: "Ann Lee", number: "4", position: "D" }),
    bio("102", { name: "Bea Kim", number: "9", position: "F" }),
  ];

  test("a line finds its entry by folded full name, else by number and surname; both join", () => {
    // "A. Lee" #04 folds to alee: no name match; #4 and surname lee give 101.
    const sheets = [
      sheet("m1", [line({ name: "Ann Lee", number: "4" })]),
      sheet("m2", [line({ name: "A. Lee", number: "04" })]),
    ];
    const m = measures();
    const ps = join(sheets, rows, true, m);
    expect(ps).toHaveLength(1);
    expect(ps[0]?.roster).toBe(rows[0] as Player);
    expect(ps[0]?.rosterEntry).toBe("bio:101");
    expect(ps[0]?.minutes).toBe(180);
    expect(m.rosterFound).toBe(2);
    // Without the pass the two spellings are two people.
    const off = join(sheets, rows, false);
    expect(off.map((p) => p.key).sort()).toEqual(["alee", "annlee"]);
    expect(off.every((p) => p.roster === null)).toBe(true);
  });

  test("it joins a group already tied by a roster-sourced ref or by a page id equal to the bio id", () => {
    const byRef = join(
      [
        sheet("m1", [line({ name: "Annie Lee", ref: { id: "101", source: "roster" } })]),
        sheet("m2", [line({ name: "A Lee", number: "4" })]),
      ],
      rows,
    );
    expect(byRef).toHaveLength(1);
    expect(byRef[0]?.rosterEntry).toBe("bio:101");
    const byPage = join(
      [
        sheet("m1", [line({ name: "Annie Lee", playerId: "101" })]),
        sheet("m2", [line({ name: "A Lee", number: "4" })]),
      ],
      rows,
    );
    expect(byPage).toHaveLength(1);
    expect(byPage[0]?.playerId).toBe("101");
  });

  test("every group tied to one roster entry is one player (Concord 2022, Garret Boucher)", () => {
    // Roster: Garret Boucher, #3, bio 7619. Concord's own copies print him as
    // "Garret Boucher" with page id 7619 and no minutes. King's copy prints
    // "Garrett Boucher" with a twin ref 7619; Charleston's prints "Garrett
    // Boucher" with neither. Pass 1 groups the twin line, pass 2 the page-id
    // lines: two groups, both tied to bio 7619. Charleston's lines find the
    // entry by number and surname. All three are one player: 3 × 90 minutes.
    const players = [bio("7619", { name: "Garret Boucher", number: "3" })];
    const ps = join(
      [
        sheet("m1", [
          line({ name: "Garret Boucher", number: "3", playerId: "7619", minutes: null }),
        ]),
        sheet("m2", [
          line({ name: "Garrett Boucher", number: "3", ref: { id: "7619", source: "twin" } }),
        ]),
        sheet("m3", [line({ name: "Garrett Boucher", number: "3" })]),
        sheet("m4", [line({ name: "Garrett Boucher", number: "3" })]),
      ],
      players,
    );
    expect(ps.map((p) => [p.name, p.playerId, p.minutes, p.lineCount])).toEqual([
      ["Garrett Boucher", "7619", 270, 4],
    ]);
    // Without the lookup the two bio-tied groups still join: one roster line,
    // one person.
    const tiedOnly = join(
      [
        sheet("m1", [line({ name: "Garret Boucher", number: "3", playerId: "7619" })]),
        sheet("m2", [
          line({ name: "Garrett Boucher", number: "3", ref: { id: "7619", source: "twin" } }),
        ]),
      ],
      players,
    );
    expect(tiedOnly.length).toBe(1);
  });

  test("a line with a page or twin ref is not looked up", () => {
    const ps = join(
      [
        sheet("m1", [line({ name: "Ann Lee", number: "4" })]),
        sheet("m2", [line({ name: "A. Lee", number: "4", ref: { id: "55", source: "twin" } })]),
      ],
      rows,
    );
    expect(ps).toHaveLength(2);
  });

  test("two lines that find one entry but hold different page ids stay apart", () => {
    const m = measures();
    const ps = join(
      [
        sheet("m1", [line({ name: "Ann Lee", number: "4", playerId: "7001" })]),
        sheet("m2", [line({ name: "Ann Lee", number: "4", playerId: "7002" })]),
      ],
      rows,
      true,
      m,
    );
    expect(ps).toHaveLength(2);
    expect(m.blocked).toBeGreaterThanOrEqual(1);
  });

  test("[v2.2] a twin or page ref equal to a bio id ties the group to that roster line", () => {
    // The kept copy is the opponent's: a twin ref and no page id. It ties to
    // 101 all the same, and the roster line gives the position.
    const twin = join(
      [sheet("m1", [line({ name: "Ann Lee", ref: { id: "101", source: "twin" } })])],
      rows,
    );
    expect(twin[0]?.roster).toBe(rows[0] as Player);
    const page = join(
      [sheet("m1", [line({ name: "Annie Lee", ref: { id: "102", source: "page" } })])],
      rows,
    );
    expect(page[0]?.rosterEntry).toBe("bio:102");
    // A twin-tied group takes in the lines pass 3 sends to the same entry.
    const both = join(
      [
        sheet("m1", [line({ name: "Annie Lee", ref: { id: "101", source: "twin" } })]),
        sheet("m2", [line({ name: "A. Lee", number: "4" })]),
      ],
      rows,
    );
    expect(both).toHaveLength(1);
    // A key ref's id is a synthetic key, never a bio id.
    const key = join(
      [sheet("m1", [line({ name: "Annie Lee", ref: { id: "101", source: "key" } })])],
      rows,
    );
    expect(key[0]?.roster).toBeNull();
  });

  test("[v2.2] the roster pass searches every entry, with or without a bio id", () => {
    // A PrestoSports roster: no bio ids. Both spellings find the one row.
    const presto = [roster({ name: "Ann Lee", number: "4", position: "Midfielder" })];
    const ps = join(
      [
        sheet("m1", [line({ name: "Ann Lee", number: "4" })]),
        sheet("m2", [line({ name: "A. Lee", number: "4" })]),
      ],
      presto,
    );
    expect(ps).toHaveLength(1);
    expect(ps[0]?.roster).toBe(presto[0] as Player);
    expect(ps[0]?.rosterEntry).toBe("row:0");
  });

  test("the lookup: one name match wins; two settle by number and surname, or not at all", () => {
    const twoAnns = rosterIndex([
      bio("101", { name: "Ann Lee", number: "4" }),
      bio("103", { name: "Lee, Ann", number: "12" }),
    ]);
    expect(rosterLookup(twoAnns, "Ann Lee", "12")).toBe("bio:103");
    expect(rosterLookup(twoAnns, "Ann Lee", "4")).toBe("bio:101");
    expect(rosterLookup(twoAnns, "Ann Lee", null)).toBeNull();
    expect(rosterLookup(twoAnns, "Ann Lee", "8")).toBeNull();
    // One row twice (the same bio id) is one entry.
    const twice = rosterIndex([bio("101", { name: "Ann Lee" }), bio("101", { name: "Ann Lee" })]);
    expect(rosterLookup(twice, "Ann Lee", null)).toBe("bio:101");
    // Two id-less rows of one name are two entries: no answer by name.
    const idless = rosterIndex([
      roster({ name: "Ann Lee", number: "4" }),
      roster({ name: "Ann Lee", number: "9" }),
    ]);
    expect(rosterLookup(idless, "Ann Lee", null)).toBeNull();
    expect(rosterLookup(idless, "Ann Lee", "09")).toBe("row:1");
  });

  test("a bio id is the row's player_id, else its URL's trailing number", () => {
    expect(rosterBioId(bio("88", { name: "A" }))).toBe("88");
    expect(
      rosterBioId(roster({ name: "A", source_url: "https://x.test/roster/ann-lee/88/" })),
    ).toBe("88");
    expect(rosterBioId(roster({ name: "A", source_url: "https://x.test/roster/ann-lee" }))).toBe(
      "",
    );
    expect(rosterBioId({ name: "A", player_id: "5" } as unknown as Player)).toBe("5");
  });
});

describe("4.5: the name, number and page id an entry prints", () => {
  test("the value on the most lines, ties to the lexicographically smallest", () => {
    const [p] = join([
      sheet("m1", [line({ name: "Lee, Ann", number: "07", playerId: "11" })]),
      sheet("m2", [line({ name: "Ann Lee", number: "07", playerId: "11" })]),
      sheet("m3", [line({ name: "Ann Lee", number: "7" })]),
      sheet("m4", [line({ name: "Lee, Ann", number: "7" })]),
      sheet("m5", [line({ name: "Lee, Ann", number: "07" })]),
    ]);
    // Lee, Ann 3 to Ann Lee 2; "07" 3 to "7" 2 (kept with its zero).
    expect(p?.name).toBe("Lee, Ann");
    expect(p?.number).toBe("07");
    expect(p?.key).toBe("annlee");
    expect(mostCommon(["b", "a", "b", "a"])).toBe("a");
    expect(mostCommon(["Lee", "Ann Lee"])).toBe("Ann Lee");
    expect(mostCommon([])).toBeNull();
  });

  test("player_id is the page field only: a ref's id is never printed", () => {
    const [p] = join([sheet("m1", [line({ name: "Ann Lee", ref: { id: "55", source: "twin" } })])]);
    expect(p?.playerId).toBeNull();
  });
});

describe("4.6: minutes, goals and shots, record by record", () => {
  test("a line without minutes is skipped whole, but still says who the person is", () => {
    const [p] = join([
      sheet("m1", [line({ name: "Ann Lee", minutes: null, goals: 3, shots: 5, started: true })]),
    ]);
    expect(p?.minutes).toBe(0);
    expect(p?.matches).toBe(0);
    expect(p?.starts).toBe(0);
    expect(p?.adjG).toBe(0);
    expect(p?.lineCount).toBe(1);
  });

  test("minutes > 0 is an appearance; started counts a start", () => {
    const [p] = join([
      sheet("m1", [line({ name: "Ann Lee", minutes: 0, started: false })]),
      sheet("m2", [line({ name: "Ann Lee", minutes: 30, started: true })]),
    ]);
    expect(p?.minutes).toBe(30);
    expect(p?.matches).toBe(1);
    expect(p?.starts).toBe(1);
  });

  test("a doubled line counts once: the line with more minutes, the first on a tie", () => {
    // One sheet prints Ann Lee twice: 45 minutes with a goal, 90 without.
    const [p] = join([
      sheet("m1", [
        line({ name: "Ann Lee", minutes: 45, goals: 1, shots: 2, started: true }),
        line({ name: "Lee, Ann", minutes: 90, goals: 0, shots: 1 }),
      ]),
    ]);
    expect(p?.doubled).toBe(1);
    expect(p?.minutes).toBe(90);
    expect(p?.matches).toBe(1);
    expect(p?.G).toBe(0);
    expect(p?.S).toBe(1);
    expect(p?.starts).toBe(0);
    // A tie on minutes: the first printed.
    const [q] = join([
      sheet("m1", [
        line({ name: "Ann Lee", minutes: 90, goals: 2 }),
        line({ name: "Ann Lee", minutes: 90, goals: 1 }),
      ]),
    ]);
    expect(q?.G).toBe(2);
    expect(q?.minutes).toBe(90);
    // A doubled line without minutes is no rival.
    const [r] = join([
      sheet("m1", [
        line({ name: "Ann Lee", minutes: null, goals: 4 }),
        line({ name: "Ann Lee", minutes: 10, goals: 1 }),
      ]),
    ]);
    expect(r?.G).toBe(1);
  });

  test("a penalty goal and its attempt come off goals and shots", () => {
    // 2 goals from 4 shots, one of each a penalty: g = 1, s = 3.
    const [p] = playerSeasons(
      "x",
      2026,
      [
        sheet("m1", [line({ name: "Ann Lee", goals: 2, shots: 4 })], {
          credits: [{ lines: [0], goal: true }],
        }),
      ],
      [],
      () => ({ goals: 0.8, shots: 1.25 }),
    );
    // adjG = 1 / 0.8 = 1.25; adjS = 3 / 1.25 = 2.4.
    expect(p?.adjG).toBeCloseTo(1.25, 12);
    expect(p?.adjS).toBeCloseTo(2.4, 12);
    expect([p?.penGoals, p?.penAttempts]).toEqual([1, 1]);
  });

  test("more penalty attempts than shots floors at zero, never below", () => {
    // One goal from one shot, three penalty attempts of which two scored:
    // g = max(1 − 2, 0) = 0, s = max(1 − 3, 0) = 0.
    const [p] = join([
      sheet("m1", [line({ name: "Ann Lee", goals: 1, shots: 1 })], {
        credits: [
          { lines: [0], goal: true },
          { lines: [0], goal: true },
          { lines: [0], goal: false },
        ],
      }),
    ]);
    expect(p?.adjG).toBe(0);
    expect(p?.adjS).toBe(0);
    expect([p?.penGoals, p?.penAttempts]).toEqual([2, 3]);
  });

  test("a penalty credited to a doubled player's two lines comes off once", () => {
    const [p] = join([
      sheet(
        "m1",
        [
          line({ name: "Ann Lee", minutes: 90, goals: 1, shots: 3 }),
          line({ name: "Ann Lee", minutes: 30, goals: 1, shots: 3 }),
        ],
        { credits: [{ lines: [0, 1], goal: true }] },
      ),
    ]);
    expect([p?.G, p?.S, p?.penGoals, p?.penAttempts]).toEqual([0, 2, 1, 1]);
  });

  test("a penalty on a record the player has no minutes in is not 'found above'", () => {
    const [p] = join([
      sheet("m1", [line({ name: "Ann Lee", minutes: null, goals: 1, shots: 1 })], {
        credits: [{ lines: [0], goal: true }],
      }),
      sheet("m2", [line({ name: "Ann Lee", minutes: 90, goals: 1, shots: 2 })]),
    ]);
    expect([p?.penGoals, p?.penAttempts]).toEqual([0, 0]);
    expect([p?.skippedPenGoals, p?.skippedPenAttempts]).toEqual([1, 1]);
    expect([p?.G, p?.S]).toEqual([1, 2]);
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
      [],
      (s) => ({ goals: s.opponent === "2026:tight" ? 0.5 : 2, shots: 1 }),
    );
    expect(p?.adjG).toBeCloseTo(2.5, 12);
  });
});

describe("4.6, second: penalties from the season statistics", () => {
  const stats = (over: Partial<PlayerStats> & { name: string }): PlayerStats =>
    ({ ...over }) as PlayerStats;
  /** A player with G = 4 and S = 10 on unit divisors, one penalty goal found. */
  const scorer = (): PlayerSeason => {
    const [p] = join([
      sheet("m1", [line({ name: "Ann Lee", playerId: "11", goals: 3, shots: 6 })], {
        credits: [{ lines: [0], goal: true }],
      }),
      sheet("m2", [line({ name: "Ann Lee", playerId: "11", goals: 2, shots: 5 })]),
    ]);
    return p as PlayerSeason;
  };

  test("the row is joined by page id, then by folded name; two candidates join nothing", () => {
    const p = scorer();
    const byId = stats({ name: "Annie Lee", player_id: "11" });
    expect(statsRowFor(p, [stats({ name: "Ann Lee", player_id: "12" }), byId])).toBe(byId);
    const byName = stats({ name: "Lee, Ann" });
    expect(statsRowFor({ ...p, playerId: null }, [byName])).toBe(byName);
    expect(
      statsRowFor({ ...p, playerId: null }, [
        stats({ name: "Ann Lee" }),
        stats({ name: "Lee, Ann" }),
      ]),
    ).toBeNull();
  });

  test("more penalty goals and attempts than found: adjG and adjS scale down by (G − e) / G", () => {
    const p = scorer();
    expect([p.G, p.S, p.penGoals, p.penAttempts]).toEqual([4, 10, 1, 1]);
    // The stats file: 3 penalty goals (e = 2), 4 attempts (e = 3).
    const c = applyStatsPenalties(
      p,
      stats({ name: "Ann Lee", penalty_goals: 3, penalty_attempts: 4 }),
    );
    expect(c).toEqual({
      playByPlayGoals: 1,
      statsGoals: 3,
      playByPlayAttempts: 1,
      statsAttempts: 4,
      skippedGoals: 0,
      skippedAttempts: 0,
      goalsFactor: 0.5,
      shotsFactor: 0.7,
    });
    // adjG = 4 × 2/4 = 2; adjS = 10 × 7/10 = 7.
    expect(p.adjG).toBeCloseTo(2, 12);
    expect(p.adjS).toBeCloseTo(7, 12);
  });

  test("an excess beyond G, or a G of zero, takes the figure to zero", () => {
    const p = scorer();
    applyStatsPenalties(p, stats({ name: "Ann Lee", penalty_goals: 9 }));
    expect(p.adjG).toBe(0);
    expect(p.adjS).toBeCloseTo(10, 12);
  });

  test("the same count or fewer, or no count printed, changes nothing", () => {
    const p = scorer();
    expect(
      applyStatsPenalties(p, stats({ name: "Ann Lee", penalty_goals: 1, penalty_attempts: 0 })),
    ).toBeNull();
    expect(applyStatsPenalties(p, stats({ name: "Ann Lee" }))).toBeNull();
    expect(applyStatsPenalties(p, null)).toBeNull();
    expect([p.adjG, p.adjS]).toEqual([4, 10]);
  });
});

describe("4.3: split spellings", () => {
  const two = (a: SheetLine, aSheets: string[], b: SheetLine, bSheets: string[]) =>
    join([
      ...aSheets.map((id) => sheet(id, [a])),
      ...bSheets.map((id) => sheet(`${id}b`, [b], { identity: id })),
    ]);

  test("same number, surname and first initial, never on one sheet: an unresolved pair", () => {
    // "Juan Linares" #7 and "Juanito Linares" #07: zeros dropped, the numbers agree.
    const ps = two(
      line({ name: "Juan Linares", number: "7" }),
      ["m1", "m2"],
      line({ name: "Juanito Linares", number: "07" }),
      ["m3"],
    );
    expect(ps).toHaveLength(2);
    expect(splitSpellingPairs(ps)).toEqual([[0, 1]]);
  });

  test("not a pair when they share a sheet, or the number or the initial differs", () => {
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

  test("the surname is before the comma, else the last word", () => {
    const ps = two(
      line({ name: "Linares, Juan", number: "7" }),
      ["m1"],
      line({ name: "Juanito Linares", number: "7" }),
      ["m2"],
    );
    expect(splitSpellingPairs(ps)).toEqual([[0, 1]]);
  });
});

describe("4.4: the same person across seasons", () => {
  const p = (name: string, over: Partial<PlayerSeason> = {}): PlayerSeason => {
    const [ps] = join([sheet("m1", [line({ name, number: "4" })])]);
    return { ...(ps as PlayerSeason), ...over };
  };

  test("the same key the season before links; several with it settle by shirt number", () => {
    const now = p("Ann Lee");
    const before = p("Lee, Ann", { season: 2025 });
    expect(sameName(now, [p("Bea Kim"), before])).toBe(before);
    const a = p("Ann Lee", { number: "04" });
    const b = p("Ann Lee", { number: "9" });
    expect(sameName(now, [a, b])).toBe(a);
    expect(sameName(now, [b, p("Ann Lee", { number: "8" })])).toBeNull();
    expect(sameName(p("Ann Lee", { number: null }), [a, b])).toBeNull();
  });

  test("[v2.2] home towns differ only when the first words differ and neither fold begins the other", () => {
    // The contract's own examples agree.
    expect(townsDiffer("Örebro Sweden", "Örebro, Sweden")).toBe(false);
    expect(townsDiffer("Clinton Twp.", "Clinton Township")).toBe(false);
    // Another state or country after the same town: the first words agree.
    expect(townsDiffer("Searcy, Ark.", "SEARCY, Arkansas")).toBe(false);
    // First words differ, but one whole fold begins the other.
    expect(townsDiffer("Bergen/Norway", "Bergen")).toBe(false);
    // Clearly different towns.
    expect(townsDiffer("Searcy, Ark.", "Leeds, England")).toBe(true);
    // As written, a spelling of one word the other way round differs.
    expect(townsDiffer("St. Louis, Mo.", "Saint Louis, Mo.")).toBe(true);
    // An empty fold never contradicts; nor does a missing town.
    expect(townsDiffer("Searcy, Ark.", "—")).toBe(false);
    expect(townsDiffer("Searcy, Ark.", undefined)).toBe(false);
    const town = (hometown: string | undefined) => roster({ name: "Ann Lee", hometown });
    expect(contradicts(town("Searcy, Ark."), town("Leeds, England"))).toBe(true);
    expect(contradicts(town("Örebro Sweden"), town("Örebro, Sweden"))).toBe(false);
    expect(contradicts(null, town("Searcy, Ark."))).toBe(false);
  });

  test("class year: the ladder, a redshirt word ignored, the first year a string names", () => {
    expect(classStep("Fr.")).toBe(1);
    expect(classStep("First Year")).toBe(1);
    expect(classStep("So")).toBe(2);
    expect(classStep("JUNIOR")).toBe(3);
    expect(classStep("Sr.")).toBe(4);
    expect(classStep("Graduate")).toBe(5);
    expect(classStep("Gr.")).toBe(5);
    expect(classStep("5th Year")).toBe(5);
    expect(classStep("Sixth Year")).toBe(6);
    expect(classStep("Redshirt Freshman")).toBe(1);
    expect(classStep("R-Fr.")).toBe(1);
    expect(classStep("RSo")).toBe(2);
    expect(classStep("RS Jr.")).toBe(3);
    expect(classStep("R-Sr.")).toBe(4);
    // [v2.2] Two years named: the first. A redshirt word after the year is
    // ignored like one before it.
    expect(classStep("Senior (Fifth Year)")).toBe(4);
    expect(classStep("Junior/Senior")).toBe(3);
    expect(classStep("Freshman (Redshirt)")).toBe(1);
    expect(classStep("Fr.-RS")).toBe(1);
    // No year at all.
    expect(classStep("Redshirt")).toBeNull();
    expect(classStep("")).toBeNull();
    expect(classStep(undefined)).toBeNull();
  });

  test("a fall of two or more steps contradicts; a fall of one, a repeat or a rise does not", () => {
    const year = (class_year: string) => roster({ name: "Ann Lee", class_year });
    expect(contradicts(year("Senior"), year("Sophomore"))).toBe(true);
    expect(contradicts(year("Graduate"), year("Freshman"))).toBe(true);
    expect(contradicts(year("Junior"), year("Sophomore"))).toBe(false);
    expect(contradicts(year("Freshman"), year("Redshirt Freshman"))).toBe(false);
    expect(contradicts(year("Junior"), year("Senior"))).toBe(false);
    // A string naming two years is its first: Senior, then Freshman, falls three.
    expect(contradicts(year("Senior (Fifth Year)"), year("Freshman"))).toBe(true);
    // A string naming no year never contradicts.
    expect(contradicts(year("Redshirt"), year("Freshman"))).toBe(false);
  });
});
