// ALGORITHM.md section 8: regulars, seasons counted, career record, the tier.

import { describe, expect, test } from "bun:test";
import {
  careerRecord,
  type DefenceSeason,
  defenceTier,
  isRegular,
  seasonsCounted,
  share,
} from "./defence.ts";

describe("a regular, at the share edges", () => {
  // n = 18 matches: 1620 team minutes. 70% of it is 1134, 50% is 810.
  test("a defender at exactly 70% is a regular; one minute less is not", () => {
    expect(share(1134, 18)).toBe(0.7);
    expect(isRegular("D", 1134, 18)).toBe(true);
    expect(isRegular("D", 1133, 18)).toBe(false);
  });

  test("a defender needs 900 minutes too, whatever the share", () => {
    // n = 12: 1080 team minutes; 899 is 83% of them and still not enough.
    expect(isRegular("D", 899, 12)).toBe(false);
    expect(isRegular("D", 900, 12)).toBe(true);
  });

  test("a goalkeeper at exactly 50% is a regular; one minute less is not", () => {
    expect(share(810, 18)).toBe(0.5);
    expect(isRegular("GK", 810, 18)).toBe(true);
    expect(isRegular("GK", 809, 18)).toBe(false);
  });

  test("a goalkeeper needs 600 minutes too", () => {
    // n = 12: 599 is 55% of 1080, and below the 600 floor.
    expect(isRegular("GK", 599, 12)).toBe(false);
    expect(isRegular("GK", 600, 12)).toBe(true);
  });

  test("forwards and midfielders are never regulars here", () => {
    expect(isRegular("F", 1620, 18)).toBe(false);
    expect(isRegular("M", 1620, 18)).toBe(false);
  });
});

const season = (
  year: number,
  over: Partial<DefenceSeason> = {},
  previous: DefenceSeason | null = null,
): DefenceSeason => ({
  season: year,
  group: "D",
  regular: true,
  workload: "typical",
  score: 0,
  previous,
  ...over,
});

describe("consecutive seasons counted", () => {
  test("three straight regular seasons count three; a fourth does not", () => {
    const chain = season(2026, {}, season(2025, {}, season(2024, {}, season(2023))));
    expect(seasonsCounted(chain).map((s) => s.season)).toEqual([2026, 2025, 2024]);
  });

  test("a gap stops the count: 2026 and 2024 are not consecutive", () => {
    const chain = season(2026, {}, season(2024));
    expect(seasonsCounted(chain).map((s) => s.season)).toEqual([2026]);
  });

  test("a season not as a regular stops it", () => {
    const chain = season(2026, {}, season(2025, { regular: false }, season(2024)));
    expect(seasonsCounted(chain).map((s) => s.season)).toEqual([2026]);
  });

  test("a group change stops it: a goalkeeper last season is not a defender's season", () => {
    const chain = season(2026, {}, season(2025, { group: "GK" }, season(2024)));
    expect(seasonsCounted(chain).map((s) => s.season)).toEqual([2026]);
  });

  test("a contradicted cross-season link is no link: the chain ends there", () => {
    // The link is resolved before this rule runs; a contradicted one arrives
    // as previous = null (compute.ts, players.ts `contradicts`).
    const chain = season(2026, {}, null);
    expect(seasonsCounted(chain).map((s) => s.season)).toEqual([2026]);
  });

  test("every counted season needs a workload group", () => {
    const chain = season(2026, {}, season(2025, { workload: null, score: null }, season(2024)));
    expect(seasonsCounted(chain).map((s) => s.season)).toEqual([2026]);
  });

  test("not a regular this season: nothing counts", () => {
    expect(seasonsCounted(season(2026, { regular: false }, season(2025)))).toEqual([]);
  });
});

describe("career record and the tier", () => {
  test("career record is the mean of the program's scores over the seasons counted", () => {
    const chain = season(
      2026,
      { score: 1 },
      season(2025, { score: -0.5 }, season(2024, { score: 2 })),
    );
    // (2 − 0.5 + 1) / 3 = 2.5 / 3.
    expect(careerRecord(seasonsCounted(chain))).toBeCloseTo(2.5 / 3, 12);
  });

  test("team-mates with the same seasons share one result, so a cut never splits them", () => {
    // Ten players; three team-mates share 0.9, the top value. ceil(0.2 × 10) = 2,
    // and the tie takes all three.
    const pool = [0.9, 0.9, 0.9, 0.5, 0.4, 0.3, 0.2, 0.1, 0, -0.1].map((value, i) => ({
      id: `p${i}`,
      value,
    }));
    expect([...defenceTier(pool)].sort()).toEqual(["p0", "p1", "p2"]);
  });

  test("the top fifth, rounded up: n = 21 holds 5", () => {
    const pool = Array.from({ length: 21 }, (_, i) => ({ id: `p${i}`, value: -i }));
    expect(defenceTier(pool).size).toBe(5);
  });
});
