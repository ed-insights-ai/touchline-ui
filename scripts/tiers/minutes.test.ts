// Ruling N1 (contract 2.3): the minutes of record, worked by hand.

import { describe, expect, test } from "bun:test";
import { applyMinutesOfRecord, minutesOfRecord } from "./minutes.ts";
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

  test("no row with minutes: box minutes over m when m/r ≥ 0.9, else no_minutes", () => {
    // 18 of 20 is exactly 0.9.
    expect(minutesOfRecord(20, 18, null, null)).toEqual({
      mode: "box_partial",
      denominator: 18,
      row: null,
      list: null,
    });
    expect(minutesOfRecord(20, 17, null, null).mode).toBe("none");
    expect(minutesOfRecord(20, 0, { minutes: 0, gp: 3 }, null).mode).toBe("none");
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
