// Ruling N1 (contract 2.3): the minutes of record, worked by hand.

import { describe, expect, test } from "bun:test";
import { applyMinutesOfRecord, couldReachBar, minutesOfRecord } from "./minutes.ts";
import { type PlayerSeason, playerSeasons, type Sheet, type SheetLine } from "./players.ts";

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

const one = (sheets: Sheet[]): PlayerSeason => {
  const ps = playerSeasons("x", 2026, sheets, [], () => ({ goals: 2, shots: 4 }));
  expect(ps).toHaveLength(1);
  return ps[0] as PlayerSeason;
};

describe("N1: which minutes count", () => {
  test("every record prints minutes (m = r): box minutes, share over r", () => {
    expect(minutesOfRecord(20, 20, { minutes: 1500, gp: 18 }, null)).toEqual({
      mode: "box",
      denominator: 20,
      row: null,
      list: null,
    });
  });

  test("m < r and a stats row with minutes: the row, share over r", () => {
    const row = { minutes: 1500, gp: 18 };
    expect(minutesOfRecord(20, 10, row, null)).toEqual({
      mode: "stats",
      denominator: 20,
      row,
      list: "players",
    });
    // m = 0 is m < r too.
    expect(minutesOfRecord(20, 0, row, null).mode).toBe("stats");
  });

  test("[IR-11] the keepers list stands in when the players list gives no minutes", () => {
    const keeper = { minutes: 1620, gp: 18 };
    expect(minutesOfRecord(20, 4, { minutes: 0 }, keeper)).toEqual({
      mode: "stats",
      denominator: 20,
      row: keeper,
      list: "keepers",
    });
    expect(minutesOfRecord(20, 4, null, keeper).list).toBe("keepers");
  });

  test("no row with minutes: box minutes over m when m/r ≥ 0.5, else no_minutes", () => {
    // 10 of 20 is exactly 0.5; 9 of 20 is under it.
    expect(minutesOfRecord(20, 10, null, null)).toEqual({
      mode: "box_partial",
      denominator: 10,
      row: null,
      list: null,
    });
    expect(minutesOfRecord(20, 18, null, null).mode).toBe("box_partial");
    expect(minutesOfRecord(20, 9, null, null).mode).toBe("none");
    // 10 of 19 is 0.526: box_partial; 9 of 19 is 0.474: none.
    expect(minutesOfRecord(19, 10, null, null).mode).toBe("box_partial");
    expect(minutesOfRecord(19, 9, null, null).mode).toBe("none");
    expect(minutesOfRecord(20, 0, { minutes: 0, gp: 3 }, null).mode).toBe("none");
  });
});

describe("N1 (a): the U test, U = box minutes + 90 × (r − m)", () => {
  test("a forward or midfielder: not eligible on box minutes, eligible on U", () => {
    // r 20, m 12: U = 700 + 90 × 8 = 1,420 ≥ 900, so he could reach the bar.
    expect(couldReachBar("F", 700, 20, 12, false)).toBe(true);
    expect(couldReachBar("M", 700, 20, 12, false)).toBe(true);
    // r 20, m 19: U = 700 + 90 = 790 < 900. Needs minutes, and that is certain.
    expect(couldReachBar("F", 700, 20, 19, false)).toBe(false);
    // Eligible on box minutes already: nothing to test.
    expect(couldReachBar("F", 950, 20, 12, false)).toBe(false);
    // The season before counts: the bar is 600. 650 is eligible as it stands;
    // 500 with r − m = 1 is U = 590 < 600; with r − m = 2, U = 680.
    expect(couldReachBar("F", 650, 20, 19, true)).toBe(false);
    expect(couldReachBar("F", 500, 20, 19, true)).toBe(false);
    expect(couldReachBar("F", 500, 20, 18, true)).toBe(true);
    // Without the season before, 500 + 180 = 680 < 900.
    expect(couldReachBar("F", 500, 20, 18, false)).toBe(false);
  });

  test("a defender: share over m × 90 at 0.70 or more, under 900, U at 900 or more", () => {
    // m 14, r 15: 882 ÷ 1,260 = 0.70 exactly; U = 882 + 90 = 972.
    expect(couldReachBar("D", 882, 15, 14, false)).toBe(true);
    // m 10, r 11: 630 ÷ 900 = 0.70, but U = 720 < 900. Certain.
    expect(couldReachBar("D", 630, 11, 10, false)).toBe(false);
    // m 12, r 20: 700 ÷ 1,080 = 0.648 < 0.70. The share is certain: needs minutes.
    expect(couldReachBar("D", 700, 20, 12, false)).toBe(false);
    // A regular already: 950 ÷ 1,260 = 0.75.
    expect(couldReachBar("D", 950, 15, 14, false)).toBe(false);
  });

  test("a goalkeeper: share at 0.50 or more, under 600, U at 600 or more", () => {
    // m 12, r 20: 560 ÷ 1,080 = 0.519; U = 560 + 720 = 1,280.
    expect(couldReachBar("GK", 560, 20, 12, false)).toBe(true);
    // 500 ÷ 1,080 = 0.463 < 0.50.
    expect(couldReachBar("GK", 500, 20, 12, false)).toBe(false);
    // 620 is a regular: 620 ÷ 1,080 = 0.574.
    expect(couldReachBar("GK", 620, 20, 12, false)).toBe(false);
  });

  test("no group: never", () => {
    expect(couldReachBar(null, 0, 20, 10, false)).toBe(false);
  });
});

describe("N1: the stats-mode sums", () => {
  // Three records. Only the second prints minutes. Scale: goals ÷ 2, shots ÷ 4.
  const sheets = [
    sheet("m1", [line({ name: "Ana Ruiz", minutes: null, goals: 1, shots: 3, started: true })]),
    sheet("m2", [line({ name: "Ana Ruiz", minutes: 80, goals: 0, shots: 2, started: true })]),
    sheet("m3", [line({ name: "Ana Ruiz", minutes: null, goals: 2, shots: 4 })]),
  ];

  test("box sums read the record with minutes only; every-record sums read all three", () => {
    const p = one(sheets);
    expect([p.minutes, p.matches, p.G, p.S, p.starts]).toEqual([80, 1, 0, 2, 1]);
    expect(p.adjS).toBeCloseTo(0.5, 12);
    expect(p.records).toBe(3);
    expect(p.everyRecord).toEqual({ starts: 2, G: 3, S: 9, adjG: 1.5, adjS: 2.25 });
  });

  test("stats mode takes the row's minutes and games played and the every-record sums", () => {
    const p = one(sheets);
    applyMinutesOfRecord(p, minutesOfRecord(3, 1, { minutes: 250, gp: 3 }, null));
    expect([p.minutes, p.matches, p.G, p.S, p.starts, p.adjG, p.adjS]).toEqual([
      250, 3, 3, 9, 2, 1.5, 2.25,
    ]);
  });

  test("a row with no games played: the records he has a line in", () => {
    const p = one(sheets);
    applyMinutesOfRecord(p, minutesOfRecord(3, 1, { minutes: 250 }, null));
    expect(p.matches).toBe(3);
  });

  test("any other mode leaves the box sums alone", () => {
    const p = one(sheets);
    applyMinutesOfRecord(p, minutesOfRecord(3, 3, { minutes: 250, gp: 3 }, null));
    expect([p.minutes, p.matches, p.G]).toEqual([80, 1, 0]);
  });

  test("a penalty comes off once, on a record with or without minutes", () => {
    const p = one([
      sheet("m1", [line({ name: "Ana Ruiz", minutes: null, goals: 1, shots: 1 })], {
        credits: [{ lines: [0], goal: true }],
      }),
      sheet("m2", [line({ name: "Ana Ruiz", minutes: 90, goals: 1, shots: 2 })]),
    ]);
    expect(p.everyRecord.G).toBe(1);
    expect(p.everyRecord.S).toBe(2);
    expect(p.skippedPenGoals).toBe(1);
  });
});
