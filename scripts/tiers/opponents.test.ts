// ALGORITHM.md section 2, on toy leagues small enough to work by hand.

import { describe, expect, test } from "bun:test";
import { fitFactors, type ModelRow, otherVenue, teamId, venueFactor } from "./opponents.ts";

// Three teams, one round: A 3–1 B at A, B 2–2 C at B, C 0–2 A at C.
// One row per side per match (six rows), Σy = 10, so mu starts at 10/6 = 5/3.
const toy: ModelRow[] = [
  { attack: "A", defend: "B", y: 3, venue: "home" },
  { attack: "B", defend: "A", y: 1, venue: "away" },
  { attack: "B", defend: "C", y: 2, venue: "home" },
  { attack: "C", defend: "B", y: 2, venue: "away" },
  { attack: "C", defend: "A", y: 0, venue: "home" },
  { attack: "A", defend: "C", y: 2, venue: "away" },
];

describe("fitFactors: one pass on a three-team league, prior 6", () => {
  const f = fitFactors(toy, 6, 1);

  test("step 1, att: (Σ y + 6) / (Σ mu·dfn·h + 6) with dfn = h = 1", () => {
    // Each team attacks twice, so Σ mu·dfn·h = 2 × 5/3 = 10/3 and the
    // denominator is 10/3 + 6 = 28/3.
    // A scored 3 + 2 = 5: (5 + 6) / (28/3) = 33/28.
    // B scored 1 + 2 = 3: 9 / (28/3) = 27/28.
    // C scored 2 + 0 = 2: 8 / (28/3) = 24/28 = 6/7.
    expect(f.att.get("A")).toBeCloseTo(33 / 28, 12);
    expect(f.att.get("B")).toBeCloseTo(27 / 28, 12);
    expect(f.att.get("C")).toBeCloseTo(6 / 7, 12);
  });

  test("step 2, dfn: uses the att just computed", () => {
    // A conceded 1 (to B) + 0 (to C): den = 5/3 × (27/28 + 24/28) + 6 = 85/28 + 6
    //   = 253/28, so dfn[A] = 7 × 28/253 = 196/253.
    // B conceded 3 (A) + 2 (C): den = 5/3 × (33/28 + 24/28) + 6 = 95/28 + 6 = 263/28,
    //   so dfn[B] = 11 × 28/263 = 308/263.
    // C conceded 2 (B) + 2 (A): den = 5/3 × (27/28 + 33/28) + 6 = 25/7 + 6 = 67/7,
    //   so dfn[C] = 10 × 7/67 = 70/67.
    expect(f.dfn.get("A")).toBeCloseTo(196 / 253, 12);
    expect(f.dfn.get("B")).toBeCloseTo(308 / 263, 12);
    expect(f.dfn.get("C")).toBeCloseTo(70 / 67, 12);
  });

  test("step 3, home: sqrt of the home rows' y/base over the away rows'", () => {
    // Home rows' base = 5/3 × (33/28·308/263 + 27/28·70/67 + 6/7·196/253)
    //   = 5/3 × (363/263 + 67.5/67 + 168/253) = 5/3 × 3.0517224 = 5.0862041.
    // Away rows' base = 5/3 × (27/28·196/253 + 6/7·308/263 + 33/28·70/67)
    //   = 5/3 × (189/253 + 264/263 + 82.5/67) = 5/3 × 2.9821811 = 4.9703019.
    // Both sides scored 5, so home = sqrt(4.9703019 / 5.0862041) = 0.988541.
    expect(f.home).toBeCloseTo(0.988541, 6);
  });

  test("step 4, mu: Σ y over Σ att·dfn·h with the new home factor", () => {
    // Σ att·dfn·h = 3.0517224 × 0.988541 + 2.9821811 / 0.988541 = 6.033502,
    // so mu = 10 / 6.033502 = 1.657412.
    expect(f.mu).toBeCloseTo(1.657412, 6);
  });
});

describe("fitFactors: forty passes", () => {
  test("a league where every home side wins 2–1 is all home advantage", () => {
    // A double round robin of three teams, home side 2, away side 1, every
    // match. Pass one: every team scored 2 + 2 + 1 + 1 = 6 over four rows with
    // mu = 18/12 = 1.5, so att = (6 + 6) / (4 × 1.5 + 6) = 1, and dfn = 1 the
    // same way. home = sqrt((12/9) / (6/9)) = sqrt 2, and mu = 18 / (6·√2 +
    // 6/√2) = √2. Pass two: att = 12 / (√2 × (2√2 + 2/√2) + 6) = 12/12 = 1:
    // nothing moves again.
    const rows: ModelRow[] = [];
    for (const [h, a] of [
      ["A", "B"],
      ["B", "A"],
      ["A", "C"],
      ["C", "A"],
      ["B", "C"],
      ["C", "B"],
    ] as const) {
      rows.push({ attack: h, defend: a, y: 2, venue: "home" });
      rows.push({ attack: a, defend: h, y: 1, venue: "away" });
    }
    const f = fitFactors(rows, 6);
    expect(f.home).toBeCloseTo(Math.SQRT2, 12);
    expect(f.mu).toBeCloseTo(Math.SQRT2, 12);
    for (const t of ["A", "B", "C"]) {
      expect(f.att.get(t)).toBeCloseTo(1, 12);
      expect(f.dfn.get(t)).toBeCloseTo(1, 12);
    }
  });

  test("a team with no row in a role keeps 1 there: the prior over nothing", () => {
    const f = fitFactors([{ attack: "A", defend: "Z", y: 4, venue: "neutral" }], 40);
    expect(f.att.get("Z")).toBe(1);
    expect(f.dfn.get("A")).toBe(1);
  });

  test("the same rows in the same order give the same factors to the bit", () => {
    expect(fitFactors(toy, 6)).toEqual(fitFactors(toy, 6));
  });
});

describe("the home factor and team ids", () => {
  test("h is home, 1/home, or 1", () => {
    expect(venueFactor("home", 1.1)).toBe(1.1);
    expect(venueFactor("away", 1.1)).toBe(1 / 1.1);
    expect(venueFactor("neutral", 1.1)).toBe(1);
    expect(otherVenue("home")).toBe("away");
    expect(otherVenue("neutral")).toBe("neutral");
  });

  test("a team is one programme in one season", () => {
    expect(teamId(2025, "harding")).not.toBe(teamId(2026, "harding"));
  });
});
