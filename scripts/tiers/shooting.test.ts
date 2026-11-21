// ALGORITHM.md section 5: eligibility edges, the estimate, and the tier cut.

import { describe, expect, test } from "bun:test";
import { cutCount, topWithTies } from "./cut.ts";
import {
  constantsFor,
  earlierSeasonCounts,
  estimate,
  groupAverage,
  seasonCounts,
  shootingEligible,
  shootingTiers,
  threat,
} from "./shooting.ts";

describe("threat", () => {
  test("wG × adjG × 90 / minutes + wS × adjS × 90 / minutes", () => {
    // Men: 10 goals and 60 shots over 1800 minutes, i.e. 0.5 and 3 a 90:
    // 0.234 × 0.5 + 0.0885 × 3 = 0.117 + 0.2655 = 0.3825.
    expect(threat("men", 10, 60, 1800, "d2")).toBeCloseTo(0.3825, 12);
    // Women, the same line: 0.238 × 0.5 + 0.0749 × 3 = 0.119 + 0.2247 = 0.3437.
    expect(threat("women", 10, 60, 1800, "d2")).toBeCloseTo(0.3437, 12);
  });

  test("undefined at zero minutes", () => {
    expect(threat("men", 0, 0, 0, "d2")).toBeNull();
  });
});

describe("constants per level", () => {
  test("Division I men use their own fit, by the same procedure", () => {
    // 0.207 × 0.5 + 0.0837 × 3 = 0.1035 + 0.2511 = 0.3546.
    expect(threat("men", 10, 60, 1800, "d1")).toBeCloseTo(0.3546, 12);
    expect(estimate("men", 0.5, 0.3, null, "d1")).toBeCloseTo(0.46, 12);
    expect(estimate("men", 0.5, 0.3, 0.4, "d1")).toBeCloseTo(0.45, 12);
  });

  test("Division I women use their own fit, not the men's or Division II's", () => {
    // 0.217 × 0.5 + 0.0718 × 3 = 0.1085 + 0.2154 = 0.3239.
    expect(threat("women", 10, 60, 1800, "d1")).toBeCloseTo(0.3239, 12);
    // 0.84 × 0.5 + 0.16 × 0.3 = 0.468; 0.64 × 0.5 + 0.34 × 0.4 + 0.02 × 0.3 = 0.462.
    expect(estimate("women", 0.5, 0.3, null, "d1")).toBeCloseTo(0.468, 12);
    expect(estimate("women", 0.5, 0.3, 0.4, "d1")).toBeCloseTo(0.462, 12);
    expect(constantsFor("women", "d1")).not.toEqual(constantsFor("men", "d1"));
    expect(constantsFor("women", "d1")).not.toEqual(constantsFor("women", "d2"));
  });

  test("a level or gender with no fit has no constants, never a borrowed set", () => {
    expect(() => constantsFor("men", "d3")).toThrow(/no shooting constants are fitted for d3 men/);
    expect(() => constantsFor("women", "d3")).toThrow(/d3 women/);
  });
});

describe("a season counts, and eligibility, at the minute edges", () => {
  test("a season counts from 600 minutes, as F or M only", () => {
    expect(seasonCounts(599, "F")).toBe(false);
    expect(seasonCounts(600, "F")).toBe(true);
    expect(seasonCounts(600, "M")).toBe(true);
    expect(seasonCounts(2000, "D")).toBe(false);
    expect(seasonCounts(2000, null)).toBe(false);
  });

  test("[N1 (a)] a season the U test made incomplete still counts from 600 box minutes", () => {
    // (minutes, group, incomplete, made incomplete by the U test)
    expect(earlierSeasonCounts(630, "F", true, true)).toBe(true);
    expect(earlierSeasonCounts(600, "M", true, true)).toBe(true);
    expect(earlierSeasonCounts(599, "F", true, true)).toBe(false);
    // Incomplete for any other reason (identity, no_position, rule (b)): no.
    expect(earlierSeasonCounts(1200, "F", true, false)).toBe(false);
    // Complete: as before.
    expect(earlierSeasonCounts(600, "F", false, false)).toBe(true);
    // Defenders and keepers never count here; their run is section 8's.
    expect(earlierSeasonCounts(1200, "D", true, true)).toBe(false);
    expect(earlierSeasonCounts(1200, "GK", false, false)).toBe(false);
  });

  test("599 and 600: eligible at 600 only when the season before counts", () => {
    expect(shootingEligible(599, "F", true)).toBe(false);
    expect(shootingEligible(600, "F", true)).toBe(true);
    expect(shootingEligible(600, "F", false)).toBe(false);
  });

  test("899 and 900: eligible alone from 900", () => {
    expect(shootingEligible(899, "M", false)).toBe(false);
    expect(shootingEligible(899, "M", true)).toBe(true);
    expect(shootingEligible(900, "M", false)).toBe(true);
  });

  test("never for a defender or a keeper, whatever the minutes", () => {
    expect(shootingEligible(3000, "D", true)).toBe(false);
    expect(shootingEligible(3000, "GK", true)).toBe(false);
  });
});

describe("the estimate", () => {
  test("one season: men 0.79 × this + 0.21 × avg; women 0.82 and 0.18", () => {
    // this 0.5, avg 0.3: men 0.395 + 0.063 = 0.458; women 0.41 + 0.054 = 0.464.
    expect(estimate("men", 0.5, 0.3, null, "d2")).toBeCloseTo(0.458, 12);
    expect(estimate("women", 0.5, 0.3, null, "d2")).toBeCloseTo(0.464, 12);
  });

  test("two seasons: men 0.59 / 0.34 / 0.07; women 0.64 / 0.30 / 0.06", () => {
    // this 0.5, previous 0.4, avg 0.3:
    // men 0.295 + 0.136 + 0.021 = 0.452; women 0.32 + 0.12 + 0.018 = 0.458.
    expect(estimate("men", 0.5, 0.3, 0.4, "d2")).toBeCloseTo(0.452, 12);
    expect(estimate("women", 0.5, 0.3, 0.4, "d2")).toBeCloseTo(0.458, 12);
  });

  test("the group average is the plain mean", () => {
    expect(groupAverage([0.1, 0.2, 0.6])).toBeCloseTo(0.3, 12);
    expect(groupAverage([])).toBeNull();
  });
});

describe("the tier cut: ceil, then ties", () => {
  const ranked = (values: number[]) => values.map((value, i) => ({ id: `p${i}`, value }));

  test("n = 21: Tier 1 is ceil(1.05) = 2, Tier 1 and 2 together ceil(4.2) = 5", () => {
    expect(cutCount(5, 21)).toBe(2);
    expect(cutCount(20, 21)).toBe(5);
    // 21 distinct estimates, 21 down to 1.
    const tiers = shootingTiers(ranked(Array.from({ length: 21 }, (_, i) => 21 - i)));
    expect([...tiers].filter(([, t]) => t === 1).map(([id]) => id)).toEqual(["p0", "p1"]);
    expect(
      [...tiers]
        .filter(([, t]) => t === 2)
        .map(([id]) => id)
        .sort(),
    ).toEqual(["p2", "p3", "p4"]);
  });

  test("a tie at a cut includes both", () => {
    // n = 21, the 2nd and 3rd are tied at 19: Tier 1 is three players. The
    // 5th and 6th are tied at 16: Tier 1 and 2 together are six.
    const values = [21, 19, 19, 17, 16, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const tiers = shootingTiers(ranked(values));
    expect(
      [...tiers]
        .filter(([, t]) => t === 1)
        .map(([id]) => id)
        .sort(),
    ).toEqual(["p0", "p1", "p2"]);
    expect(
      [...tiers]
        .filter(([, t]) => t === 2)
        .map(([id]) => id)
        .sort(),
    ).toEqual(["p3", "p4", "p5"]);
  });

  test("the integer count agrees with ceil(0.05 × n) and ceil(0.20 × n) for every n to 2,000", () => {
    for (let n = 0; n <= 2000; n++) {
      expect(cutCount(5, n)).toBe(Math.ceil(0.05 * n));
      expect(cutCount(20, n)).toBe(Math.ceil(0.2 * n));
    }
    expect(cutCount(5, 60)).toBe(3);
    expect(cutCount(20, 15)).toBe(3);
    expect(cutCount(5, 1)).toBe(1);
    expect(cutCount(5, 0)).toBe(0);
  });

  test("nothing to cut gives nobody", () => {
    expect(topWithTies([], 20).size).toBe(0);
  });
});
