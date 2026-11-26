import { describe, expect, test } from "bun:test";
import { memberSlugs, type Season } from "./derive.ts";
import { homeSeasons } from "./home.ts";
import { playerCount } from "./players.ts";

const roster = (programme: string, n: number) => ({
  programme,
  players: Array.from({ length: n }, (_, i) => ({ name: `Player ${i + 1}` })),
});

const season = (key: string, members: string[], rosters: Record<string, number> | null): Season =>
  ({
    key,
    fixtures: { programmes: members.map((slug) => ({ slug, name: slug })) },
    rosters: rosters && {
      rosters: Object.fromEntries(Object.entries(rosters).map(([s, n]) => [s, roster(s, n)])),
    },
  }) as unknown as Season;

describe("playerCount", () => {
  test("adds every member's roster, each programme once across files", () => {
    const a = season("a", ["x", "y"], { x: 25, y: 30 });
    const b = season("b", ["y", "z"], { y: 30, z: 20 });
    expect(playerCount([a, b])).toEqual({ players: 75, programmes: 3, rostered: 3 });
  });

  test("a roster for a non-member, an empty roster and a missing file add nothing", () => {
    const a = season("a", ["x", "y"], { x: 0, w: 40 });
    const b = season("b", ["z"], null);
    expect(playerCount([a, b])).toEqual({ players: 0, programmes: 3, rostered: 0 });
  });

  test("against the data home: the sum of the member rosters' lengths", () => {
    const seasons = homeSeasons();
    const seen = new Map<string, number>();
    for (const s of seasons) {
      for (const slug of memberSlugs(s)) {
        const n = s.rosters?.rosters[slug]?.players.length ?? 0;
        if (n > 0 && !seen.has(slug)) seen.set(slug, n);
      }
    }
    const count = playerCount(seasons);
    expect(count.players).toBe([...seen.values()].reduce((t, n) => t + n, 0));
    expect(count.rostered).toBe(seen.size);
    expect(count.players).toBeGreaterThan(0);
  });
});
