/**
 * The fixture contract admits what the collector writes, and only that.
 *
 * The first re-collect after rib PR #60 (ten seasons, 2026-09-02) stamped
 * neutral: true on 97 fixtures and no key on every other row, and the whole
 * data home stopped loading under this schema. Same shape of failure as the
 * coverage marker in coverage.test.ts.
 */

import { describe, expect, test } from "bun:test";
import { fixtureSchema, isForfeit, outcome } from "./model.ts";

const row = {
  id: "sidearm:oklahoma-christian:12570",
  date: "2025-08-21",
  home: "oklahoma-christian",
  away: "fort-hays-state",
  venue: "Wichita, Kan.",
  status: "final",
  home_score: 1,
  away_score: 2,
};

describe("the fixture contract and the neutral-site flag", () => {
  test("a neutral site is true, an ordinary row has no key", () => {
    expect(fixtureSchema.parse({ ...row, neutral: true }).neutral).toBe(true);
    expect(fixtureSchema.parse(row).neutral).toBeUndefined();
  });

  test("and nothing else; the contract stays strict", () => {
    // null was admitted for a day on a misread of the data (an absent key
    // reads as null in jq); the writer omits the key, and so does the contract.
    expect(() => fixtureSchema.parse({ ...row, neutral: null })).toThrow();
    expect(() => fixtureSchema.parse({ ...row, neutral: false })).toThrow();
    expect(() => fixtureSchema.parse({ ...row, neutral: "N" })).toThrow();
    expect(() => fixtureSchema.parse({ ...row, netural: true })).toThrow();
  });
});

describe("the fixture contract and the forfeit award", () => {
  // Rib PR #93: `forfeit` names the side AWARDED the match. Status stays
  // final and the score is whatever the host printed (Upper Iowa 2024 game
  // 9017 prints "W, 2-2" beside "Win by forfeit"), else 1-0 to the award.
  test("home or away, beside whatever score the host printed", () => {
    const f = fixtureSchema.parse({ ...row, home_score: 2, away_score: 2, forfeit: "home" });
    expect(f.forfeit).toBe("home");
    expect(isForfeit(f)).toBe(true);
    expect(fixtureSchema.parse({ ...row, forfeit: "away" }).forfeit).toBe("away");
    expect(fixtureSchema.parse(row).forfeit).toBeUndefined();
    expect(isForfeit(fixtureSchema.parse(row))).toBe(false);
  });

  test("and nothing else; the contract stays strict", () => {
    expect(() => fixtureSchema.parse({ ...row, forfeit: true })).toThrow();
    expect(() => fixtureSchema.parse({ ...row, forfeit: null })).toThrow();
    expect(() => fixtureSchema.parse({ ...row, forfeit: "HOME" })).toThrow();
    expect(() => fixtureSchema.parse({ ...row, forfeit: "draw" })).toThrow();
    expect(() => fixtureSchema.parse({ ...row, forfiet: "home" })).toThrow();
  });

  test("the award decides the outcome, whatever the score says", () => {
    // 2-2 with the award to the home side is a home win, never a draw; the
    // raw comparison stands for every fixture that carries no award.
    expect(
      outcome(fixtureSchema.parse({ ...row, home_score: 2, away_score: 2, forfeit: "home" })),
    ).toBe("home");
    expect(
      outcome(fixtureSchema.parse({ ...row, home_score: 2, away_score: 2, forfeit: "away" })),
    ).toBe("away");
    expect(
      outcome(fixtureSchema.parse({ ...row, home_score: 3, away_score: 0, forfeit: "away" })),
    ).toBe("away");
    expect(outcome(fixtureSchema.parse(row))).toBe("away");
    expect(outcome(fixtureSchema.parse({ ...row, home_score: 2, away_score: 2 }))).toBe("draw");
    expect(outcome(fixtureSchema.parse({ ...row, home_score: null, away_score: null }))).toBeNull();
  });
});
