/**
 * The fixture contract admits what the collector writes, and only that.
 *
 * The first re-collect after rib PR #60 (ten seasons, 2026-09-02) stamped
 * neutral: true on 97 fixtures and null on every other row, and the whole
 * data home stopped loading under this schema. Same shape of failure as the
 * coverage marker in coverage.test.ts.
 */

import { describe, expect, test } from "bun:test";
import { fixtureSchema } from "./model.ts";

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
  test("a neutral site is true, an ordinary row is null or absent", () => {
    expect(fixtureSchema.parse({ ...row, neutral: true }).neutral).toBe(true);
    expect(fixtureSchema.parse({ ...row, neutral: null }).neutral).toBeNull();
    expect(fixtureSchema.parse(row).neutral).toBeUndefined();
  });

  test("and nothing else; the contract stays strict", () => {
    expect(() => fixtureSchema.parse({ ...row, neutral: false })).toThrow();
    expect(() => fixtureSchema.parse({ ...row, neutral: "N" })).toThrow();
    expect(() => fixtureSchema.parse({ ...row, netural: true })).toThrow();
  });
});
