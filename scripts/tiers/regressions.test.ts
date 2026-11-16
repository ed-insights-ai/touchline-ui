// Ruling N5 (contract 2.3): regression tests for two defects the
// reconciliation found, so neither can come back unnoticed, and for the
// build's --require-clean flag.
//
// R-A  fails if a side's lines are read from a copy that prints no minutes
//      for that side while another copy does; checked over every arrangement
//      of one to three copies (each side printing minutes, lines without
//      minutes, or no lines, on each copy; the copies' publishers the home
//      side, the away side or a third site).
// R-E  fails if a penalty is removed twice: a penalty on a line without
//      minutes was never in G, so the stats file's count of it must not take
//      it off again, under box minutes or [N1] the season's.
// M1   (contract 2.4) fails if a season total below the minutes the box
//      scores print for the player becomes his minutes of record, or if the
//      keepers list's larger row is passed over for the players list's.
// M2   (contract 2.4) fails if a record that lists the side's players and has
//      no line for him adds to his U.
// M5   (contract 2.4) fails if test (vi) does not join a short form to a
//      double surname ("May Queiroz" and "Mayara Queiroz Reis", one shirt
//      number, never on one sheet), or if it joins a sibling pair: different
//      first initials (Rachel and Shania Wegesend, one number), or two names
//      only (vi) holds for that share a sheet or no shirt number ("Sara
//      Queiroz" and "Sofia Queiroz Reis"). Stage 8 (IR-31): fails if a
//      hyphenated double surname does not join under (vi) ("Charlise
//      Hernandez-Tersigni" and "C.Hernandez-Tersigni", one number), or if the
//      hyphen reaches test (ii).

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sighting } from "../../src/lib/division.ts";
import type { Fixture, MatchDetail, MatchTeam, Player } from "../../src/lib/model.ts";
import { assertClean, dataCommit } from "./build.ts";
import {
  applyMinutesOfRecord,
  couldReachBar,
  minutesOfRecord,
  unprintedCounter,
} from "./minutes.ts";
import {
  applyStatsPenalties,
  closeTests,
  emptyJoinMeasures,
  nameWordList,
  nameWords,
  type PlayerSeason,
  playerSeasons,
  type Sheet,
  type SheetLine,
  testVi,
} from "./players.ts";
import { type Resolution, resolveSides } from "./sides.ts";

// ── R-A ─────────────────────────────────────────────────────────────────────

type Lines = "minutes" | "no-minutes" | "none";
const KINDS: readonly Lines[] = ["minutes", "no-minutes", "none"];
const PUBLISHERS = ["sidearm:host:1", "sidearm:visitor:2", "sidearm:other:3"] as const;

interface Copy {
  id: string;
  host: Lines;
  visitor: Lines;
}

const team = (name: string, kind: Lines): MatchTeam =>
  ({
    name,
    periods: [],
    shots: 5,
    players:
      kind === "none"
        ? []
        : [{ name: `${name} Keeper`, ...(kind === "minutes" ? { minutes: 90 } : {}) }],
  }) as MatchTeam;

function resolve(copies: readonly Copy[]): Resolution {
  const fixtures = copies.map(
    (c): Fixture =>
      ({
        id: c.id,
        date: "2025-09-06",
        home: "host",
        away: "visitor",
        status: "final",
        home_score: 1,
        away_score: 1,
      }) as Fixture,
  );
  const boxes = new Map(
    copies.map((c) => [
      c.id,
      {
        source_url: "https://example.test/box",
        home_index: 0,
        teams: [team("Host", c.host), team("Visitor", c.visitor)],
      } as MatchDetail,
    ]),
  );
  return resolveSides(
    fixtures.map((fixture) => ({ fixture }) as Sighting),
    fixtures[0] as Fixture,
    false,
    (s) => boxes.get(s.fixture.id) ?? null,
    () => 0,
  );
}

const printsMinutes = (t: MatchTeam | undefined) =>
  (t?.players ?? []).some((l) => typeof l.minutes === "number");

/** R-A: each side read from a copy printing no minutes for it, while another
 *  copy prints some. `picked` is the team each side was read from. */
function violations(
  copies: readonly Copy[],
  picked: [MatchTeam | undefined, MatchTeam | undefined],
) {
  const out: string[] = [];
  (["host", "visitor"] as const).forEach((side, k) => {
    const other = copies.find((c) => c[side] === "minutes");
    if (other && !printsMinutes(picked[k])) out.push(`${side}: ${other.id} prints minutes`);
  });
  return out;
}

function* arrangements(): Generator<Copy[]> {
  const pairs = KINDS.flatMap((h) => KINDS.map((v) => [h, v] as const));
  const permutations = (n: number): string[][] =>
    n === 0
      ? [[]]
      : PUBLISHERS.flatMap((p) =>
          permutations(n - 1)
            .filter((rest) => !rest.includes(p))
            .map((rest) => [p, ...rest]),
        );
  for (const n of [1, 2, 3]) {
    for (const ids of permutations(n)) {
      const choose = (i: number): Copy[][] =>
        i === n
          ? [[]]
          : pairs.flatMap(([h, v]) =>
              choose(i + 1).map((rest) => [{ id: ids[i] as string, host: h, visitor: v }, ...rest]),
            );
      yield* choose(0);
    }
  }
}

describe("R-A regression: a side never reads a no-minutes copy while another prints minutes", () => {
  test("every arrangement of one to three copies", () => {
    let checked = 0;
    for (const copies of arrangements()) {
      const r = resolve(copies);
      expect(violations(copies, [r.homeSide?.team, r.awaySide?.team])).toEqual([]);
      checked++;
    }
    expect(checked).toBe(3 * 9 + 6 * 81 + 6 * 729);
  });

  test("the check catches the kept-copy reading R-A replaced (Concord 2022 at Charleston)", () => {
    const copies: Copy[] = [
      { id: "sidearm:host:1", host: "minutes", visitor: "no-minutes" },
      { id: "sidearm:visitor:2", host: "minutes", visitor: "minutes" },
    ];
    const kept = resolve([copies[0] as Copy]);
    expect(violations(copies, [kept.homeSide?.team, kept.awaySide?.team])).toEqual([
      "visitor: sidearm:visitor:2 prints minutes",
    ]);
    const r = resolve(copies);
    expect(violations(copies, [r.homeSide?.team, r.awaySide?.team])).toEqual([]);
  });
});

// ── R-E ─────────────────────────────────────────────────────────────────────

const line = (minutes: number | null, goals: number, shots: number): SheetLine => ({
  name: "Ana Ruiz",
  playerId: null,
  ref: null,
  number: "9",
  position: "F",
  started: true,
  minutes,
  goals,
  shots,
});

/** One player over records (id, line, penalty goal or not), divisors 1. */
function player(...records: [string, SheetLine, boolean | null][]): PlayerSeason {
  const sheets: Sheet[] = records.map(([id, l, pen]) => ({
    identity: id,
    date: id,
    opponent: "2025:opp",
    venue: "neutral",
    lines: [l],
    credits: pen === null ? [] : [{ lines: [0], goal: pen }],
  }));
  const [p] = playerSeasons("own", 2025, sheets, [], () => ({ goals: 1, shots: 1 }));
  return p as PlayerSeason;
}

describe("R-E regression: a penalty is removed once", () => {
  test("on a line without minutes: the stats row's count of it takes nothing more", () => {
    // r1 prints no minutes; its goal is the penalty. r2: 90 minutes, an
    // open-play goal from three shots. The stats file counts the one penalty.
    const row = { name: "Ana Ruiz", penalty_goals: 1, penalty_attempts: 1 };
    const p = player(["r1", line(null, 1, 1), true], ["r2", line(90, 1, 3), null]);
    expect([p.G, p.S, p.adjG, p.adjS]).toEqual([1, 3, 1, 3]);
    expect(applyStatsPenalties(p, row)).toBeNull();
    expect([p.adjG, p.adjS]).toEqual([1, 3]);
    // [N1] Season minutes: the every-record sums strip it from r1's line once.
    const q = player(["r1", line(null, 1, 1), true], ["r2", line(90, 1, 3), null]);
    applyMinutesOfRecord(q, minutesOfRecord(2, 1, { minutes: 170, gp: 2 }, null));
    expect([q.G, q.S, q.adjG, q.adjS]).toEqual([1, 3, 1, 3]);
    expect(applyStatsPenalties(q, row)).toBeNull();
    expect([q.adjG, q.adjS]).toEqual([1, 3]);
  });

  test("on a line with minutes: off the line, and not again for the stats row", () => {
    const p = player(["r1", line(90, 2, 4), true]);
    expect([p.G, p.S]).toEqual([1, 3]);
    expect(
      applyStatsPenalties(p, { name: "Ana Ruiz", penalty_goals: 1, penalty_attempts: 1 }),
    ).toBeNull();
    expect([p.adjG, p.adjS]).toEqual([1, 3]);
  });

  test("only a penalty the play-by-play never found is scaled away", () => {
    const p = player(["r1", line(null, 1, 1), true], ["r2", line(90, 2, 4), null]);
    const change = applyStatsPenalties(p, {
      name: "Ana Ruiz",
      penalty_goals: 2,
      penalty_attempts: 2,
    });
    // G 2, S 4, one of each found: (2 − 1) / 2 and (4 − 1) / 4.
    expect(change?.goalsFactor).toBe(0.5);
    expect(change?.shotsFactor).toBe(0.75);
    expect([p.adjG, p.adjS]).toEqual([1, 3]);
  });
});

// ── M1 ──────────────────────────────────────────────────────────────────────

describe("M1 regression: printed minutes are a floor", () => {
  test("a stats total below the printed minutes: the printed minutes stand", () => {
    // Three records, two printing minutes (90 + 85). The stats row reads 60:
    // the programme's season total is short of what the box scores print.
    const p = player(
      ["r1", line(null, 1, 2), null],
      ["r2", line(90, 1, 3), null],
      ["r3", line(85, 0, 1), null],
    );
    expect(p.minutes).toBe(175);
    const rec = minutesOfRecord(3, 2, { minutes: 60, gp: 3 }, null);
    expect(rec.mode).toBe("stats");
    applyMinutesOfRecord(p, rec);
    expect([p.minutes, p.matches, p.G, p.S]).toEqual([175, 3, 2, 6]);
  });

  test("a stats total above the printed minutes still wins", () => {
    const p = player(["r1", line(null, 0, 0), null], ["r2", line(90, 0, 1), null]);
    applyMinutesOfRecord(p, minutesOfRecord(2, 1, { minutes: 170, gp: 2 }, null));
    expect(p.minutes).toBe(170);
  });

  test("the keepers list's row, when larger than the players list's, gives T", () => {
    const p = player(["r1", line(null, 0, 0), null], ["r2", line(90, 0, 0), null]);
    const rec = minutesOfRecord(2, 1, { minutes: 90, gp: 1 }, { minutes: 180, gp: 2 });
    expect(rec.list).toBe("keepers");
    applyMinutesOfRecord(p, rec);
    expect([p.minutes, p.matches]).toEqual([180, 2]);
  });
});

// ── M2 ──────────────────────────────────────────────────────────────────────

describe("M2 regression: the U test counts the player's own lines", () => {
  const mate = (minutes: number | null): SheetLine => ({
    ...line(minutes, 0, 0),
    name: "Bea Soto",
  });
  const sheet = (id: string, lines: SheetLine[]): Sheet => ({
    identity: id,
    date: id,
    opponent: "2025:opp",
    venue: "neutral",
    lines,
    credits: [],
  });
  // r 14. Ten records print minutes, 70 for him in each: 700 box minutes.
  // Two print no minutes and list the side with no line for him; one prints
  // no minutes with a line for him; one lists no lines for the side at all.
  const printed = Array.from({ length: 10 }, (_, i) => sheet(`p${i}`, [line(70, 0, 1), mate(90)]));
  const sheets = [
    ...printed,
    sheet("x1", [mate(null)]),
    sheet("x2", [mate(null)]),
    sheet("own", [line(null, 0, 0), mate(null)]),
    sheet("empty", []),
  ];
  const own = new Set([...printed.map((s) => s.identity), "own"]);

  test("a record with lines but none for him adds nothing to u", () => {
    expect(unprintedCounter(sheets, 14)(own)).toBe(2);
    // A record with no sheet at all is a record without lines too.
    expect(unprintedCounter(sheets.slice(0, -1), 14)(own)).toBe(2);
    expect(unprintedCounter(sheets, 15)(own)).toBe(3);
  });

  test("U = 700 + 90 × 2 = 880 < 900: needs minutes, not no_minutes", () => {
    expect(couldReachBar("F", 700, unprintedCounter(sheets, 14)(own), 10, false)).toBe(false);
    // The rule M2 replaced read r − m = 4: U = 1,060, and he was no_minutes.
    expect(couldReachBar("F", 700, 14 - 10, 10, false)).toBe(true);
  });
});

// ── M5 ──────────────────────────────────────────────────────────────────────

describe("M5 regression: test (vi) joins a short form, never a sibling", () => {
  const row = (id: string, name: string, number: string): Player => ({
    name,
    number,
    position: "F",
    source_url: `https://x.test/roster/${id}`,
  });
  /** A line; tied to the roster row `id` when given. */
  const at = (name: string, number: string, id?: string): SheetLine => ({
    name,
    playerId: null,
    ref: id ? { id, source: "roster" } : null,
    number,
    position: "F",
    started: true,
    minutes: 90,
    goals: 0,
    shots: 0,
  });
  const sheet = (id: string, lines: SheetLine[]): Sheet => ({
    identity: id,
    date: id,
    opponent: "2025:opp",
    venue: "neutral",
    lines,
    credits: [],
  });
  const join = (sheets: Sheet[], roster: Player[]) => {
    const m = emptyJoinMeasures();
    const ps = playerSeasons(
      "own",
      2025,
      sheets,
      roster,
      () => ({ goals: 1, shots: 1 }),
      undefined,
      m,
    );
    return { ps, m };
  };

  test("a (vi) join: 'May Queiroz' and 'Mayara Queiroz Reis', one shirt number", () => {
    // None of (i) to (v) holds; (vi) does: m…, and "queiroz" is in both and
    // is neither name's first word.
    expect(closeTests("May Queiroz", "Mayara Queiroz Reis").size).toBe(0);
    expect(testVi("May Queiroz", "Mayara Queiroz Reis")).toBe(true);
    const may = row("71", "May Queiroz", "7");
    const own = (id: string) => sheet(id, [at("May Queiroz", "7", "71")]);
    const { ps, m } = join(
      [own("m1"), own("m2"), sheet("m3", [at("Mayara Queiroz Reis", "7")])],
      [may],
    );
    expect(ps.map((p) => [p.name, p.minutes, p.lineCount])).toEqual([["May Queiroz", 270, 3]]);
    expect([m.closeJoined, m.closeJoinedVi]).toEqual([1, 1]);
    // (vi) needs a shirt number in common: another number, or none, stays apart.
    for (const n of ["8", ""]) {
      const apart = join([own("m1"), sheet("m2", [at("Mayara Queiroz Reis", n)])], [may]);
      expect(apart.ps).toHaveLength(2);
    }
  });

  test("a sibling pair stays apart", () => {
    // Rachel and Shania Wegesend wear #18 (Emmanuel 2022 and 2023): the first
    // initials differ, so (vi) does not hold. (In one season, pass 3's number
    // and surname would tie an untied "Rachel" to Shania's roster line before
    // N2a; that is 2.2's rule, not (vi).)
    expect(testVi("Shania Wegesend", "Rachel Wegesend")).toBe(false);
    // Sisters, one printed with the double surname: only (vi) holds on the
    // names. (Maicee and MaLiah Burke pass (iv), loose closeness, already.)
    expect(closeTests("Sara Queiroz", "Sofia Queiroz Reis").size).toBe(0);
    expect(testVi("Sara Queiroz", "Sofia Queiroz Reis")).toBe(true);
    const sara = [row("61", "Sara Queiroz", "6")];
    // One sheet lists both: apart.
    const together = join(
      [
        sheet("m1", [at("Sara Queiroz", "6", "61")]),
        sheet("m2", [at("Sara Queiroz", "6", "61"), at("Sofia Queiroz Reis", "6")]),
      ],
      sara,
    );
    expect(together.ps).toHaveLength(2);
    // Never on one sheet, but no shirt number in common: apart.
    const otherNumber = join(
      [sheet("m1", [at("Sara Queiroz", "6", "61")]), sheet("m2", [at("Sofia Queiroz Reis", "16")])],
      sara,
    );
    expect(otherNumber.ps).toHaveLength(2);
    expect([together.m.closeJoined, otherNumber.m.closeJoined]).toEqual([0, 0]);
  });

  test("given names first; a first word or a short word does not count", () => {
    expect(testVi("Queiroz, May", "Mayara Queiroz Reis")).toBe(true);
    expect(testVi("Reis Silva", "Reis Queiroz")).toBe(false);
    expect(testVi("Jo Lee", "Jo Ann Lee")).toBe(false);
  });

  test("[IR-31] a hyphenated double surname joins under (vi)", () => {
    // In (vi) a word ends at white space or at a hyphen. Charlise
    // Hernandez-Tersigni, Ursuline #29, is printed "C.Hernandez-Tersigni" on
    // one 2024 box score: only (vi) holds, on "tersigni".
    expect(closeTests("Charlise Hernandez-Tersigni", "C.Hernandez-Tersigni").size).toBe(0);
    expect(nameWordList("C.Hernandez-Tersigni")).toEqual(["chernandez", "tersigni"]);
    expect(testVi("Charlise Hernandez-Tersigni", "C Hernandez-Abraham")).toBe(true);
    expect(testVi("Matthew Vargas-Oyuela", "Matt Vargas")).toBe(true);
    const charlise = [row("29", "Charlise Hernandez-Tersigni", "29")];
    const own = (id: string) => sheet(id, [at("Charlise Hernandez-Tersigni", "29", "29")]);
    const { ps, m } = join(
      [own("m1"), own("m2"), sheet("m3", [at("C.Hernandez-Tersigni", "29")])],
      charlise,
    );
    expect(ps.map((p) => [p.name, p.minutes, p.lineCount])).toEqual([
      ["Charlise Hernandez-Tersigni", 270, 3],
    ]);
    expect([m.closeJoined, m.closeJoinedVi]).toEqual([1, 1]);
    // Still a shirt number in common, and never on one sheet.
    const otherNumber = join(
      [own("m1"), sheet("m2", [at("C.Hernandez-Tersigni", "30")])],
      charlise,
    );
    const together = join(
      [
        own("m1"),
        sheet("m2", [
          at("Charlise Hernandez-Tersigni", "29", "29"),
          at("C.Hernandez-Tersigni", "29"),
        ]),
      ],
      charlise,
    );
    expect([otherNumber.ps.length, together.ps.length]).toEqual([2, 2]);
    // Test (ii) still reads a word at white space only.
    expect(closeTests("Carl Murguia", "Carl Murguia-Pulido").has("ii")).toBe(false);
    expect([...nameWords("Carl Murguia-Pulido")]).toEqual(["carl", "murguiapulido"]);
    // A sibling pair with a hyphenated double surname stays apart on one
    // sheet or without a number in common.
    expect(testVi("Sara Hernandez", "Sofia Hernandez-Tersigni")).toBe(true);
    const sara = [row("61", "Sara Hernandez", "6")];
    const sisters = (n: string, both: boolean) =>
      join(
        [
          sheet("m1", [at("Sara Hernandez", "6", "61")]),
          sheet(
            "m2",
            both
              ? [at("Sara Hernandez", "6", "61"), at("Sofia Hernandez-Tersigni", n)]
              : [at("Sofia Hernandez-Tersigni", n)],
          ),
        ],
        sara,
      ).ps.length;
    expect([sisters("6", true), sisters("16", false)]).toEqual([2, 2]);
  });
});

// ── --require-clean ─────────────────────────────────────────────────────────

describe("N5: --require-clean", () => {
  test("a modified working tree is refused; a clean one is not, and prints no +dirty", () => {
    const dir = mkdtempSync(join(tmpdir(), "tiers-clean-"));
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args],
        { encoding: "utf8" },
      );
    try {
      git("init", "-q");
      writeFileSync(join(dir, "a.json"), "{}\n");
      expect(() => assertClean(dir)).toThrow(/uncommitted changes/);
      git("add", "a.json");
      git("commit", "-q", "-m", "a");
      expect(() => assertClean(dir)).not.toThrow();
      expect(dataCommit(dir)).not.toContain("+dirty");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
