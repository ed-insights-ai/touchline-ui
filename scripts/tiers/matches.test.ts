// ALGORITHM.md section 1 (version 2.2): one record per physical match, and
// one match a day on top of the site's fold (copies share a date, a slug and
// the score; they cluster; the other side's slug is its own copy's). Toy conference files: each copy's
// id carries the slug of the site that published it (`sidearm:<slug>:<n>`).

import { describe, expect, test } from "bun:test";
import type { Fixture, MatchDetail } from "../../src/lib/model.ts";
import { type ConferenceSeason, physicalMatches, publisherOf } from "./matches.ts";

interface Copy {
  /** The site that published the copy. */
  by: string;
  n: number;
  date: string;
  home: string;
  away: string;
  score: [number, number];
  /** Whether the copy carries a box score (default true). */
  box?: boolean;
}

const box = (c: Copy): MatchDetail =>
  ({
    source_url: `https://example.test/${c.by}/${c.n}`,
    home_index: 0,
    teams: [
      { name: c.home, periods: [c.score[0]], score: c.score[0], shots: 9, players: [] },
      { name: c.away, periods: [c.score[1]], score: c.score[1], shots: 4, players: [] },
    ],
    plays: [],
  }) as MatchDetail;

/** One conference's files, holding the copies its members' sites published. */
function conference(key: string, members: string[], copies: Copy[]): ConferenceSeason {
  const mine = copies.filter((c) => members.includes(c.by));
  const fixtures: Fixture[] = mine.map((c) => ({
    id: `sidearm:${c.by}:${c.n}`,
    date: c.date,
    home: c.home,
    away: c.away,
    status: "final",
    home_score: c.score[0],
    away_score: c.score[1],
  }));
  const at = `2026-11-30T00:00:00Z`;
  return {
    key,
    fixtures: {
      schema: "touchline.fixtures/2",
      season: 2026,
      gender: "men",
      conference: key.toUpperCase(),
      collected_at: at,
      programmes: members.map((slug) => ({ slug, name: slug, conference: key.toUpperCase() })),
      fixtures,
    },
    rosters: null,
    stats: null,
    matches: {
      schema: "touchline.matches/2",
      season: 2026,
      gender: "men",
      collected_at: at,
      matches: Object.fromEntries(
        mine.filter((c) => c.box !== false).map((c) => [`sidearm:${c.by}:${c.n}`, box(c)]),
      ),
    },
  } as ConferenceSeason;
}

const D = "2026-09-05";

describe("one match a day", () => {
  test("two copies that name one opponent under two slugs are one record, under its own slug", () => {
    // Alpha's site calls the opponent "gamma-university"; gamma's own site
    // publishes the same match as alpha v gamma. The site's fold sees two pairs.
    const copies: Copy[] = [
      { by: "alpha", n: 1, date: D, home: "alpha", away: "gamma-university", score: [2, 1] },
      { by: "gamma", n: 7, date: D, home: "alpha", away: "gamma", score: [2, 1] },
    ];
    const { matches, counts } = physicalMatches(2026, [
      conference("aaa", ["alpha", "beta"], copies),
      conference("bbb", ["gamma"], copies),
    ]);
    expect(counts.physical).toBe(2);
    expect(counts.records).toBe(1);
    expect(matches.map((m) => [m.home, m.away, m.homeGoals, m.awayGoals, m.merged])).toEqual([
      ["alpha", "gamma", 2, 1, 1],
    ]);
    expect(counts.merges).toEqual([
      {
        date: D,
        shared: "alpha",
        other: "gamma",
        from: "own",
        aliases: ["gamma-university"],
        records: 2,
      },
    ]);
    expect(counts.illDefined).toEqual([]);
  });

  test("a programme with two matches on different days is not merged", () => {
    const copies: Copy[] = [
      { by: "alpha", n: 1, date: D, home: "alpha", away: "gamma", score: [2, 1] },
      { by: "alpha", n: 2, date: "2026-09-06", home: "alpha", away: "gamma-u", score: [0, 0] },
    ];
    const { counts } = physicalMatches(2026, [conference("aaa", ["alpha"], copies)]);
    expect(counts.records).toBe(2);
    expect(counts.merges).toEqual([]);
  });

  test("a final with no box score in any copy is not a record, and is not merged", () => {
    const copies: Copy[] = [
      { by: "alpha", n: 1, date: D, home: "alpha", away: "gamma-u", score: [2, 1], box: false },
      { by: "gamma", n: 7, date: D, home: "alpha", away: "gamma", score: [2, 1] },
    ];
    const { counts } = physicalMatches(2026, [
      conference("aaa", ["alpha"], copies),
      conference("bbb", ["gamma"], copies),
    ]);
    expect(counts.noBoxScore).toBe(1);
    expect(counts.records).toBe(1);
    expect(counts.merges).toEqual([]);
  });

  test("the same date and a shared slug are not enough: the scores must agree", () => {
    // [v2.2] One record gives alpha 2-1, the other 1-1: two matches, kept apart.
    const copies: Copy[] = [
      { by: "alpha", n: 1, date: D, home: "alpha", away: "gamma-university", score: [2, 1] },
      { by: "gamma", n: 7, date: D, home: "alpha", away: "gamma", score: [1, 1] },
    ];
    const { counts } = physicalMatches(2026, [
      conference("aaa", ["alpha"], copies),
      conference("bbb", ["gamma"], copies),
    ]);
    expect(counts.records).toBe(2);
    expect(counts.merges).toEqual([]);
    expect(counts.illDefined).toEqual([]);
  });

  test("one slug for two programmes: only the records whose scores agree are copies", () => {
    // The shape of 2025-09-13 (men): alpha's site calls Delta State "delta",
    // which is also another collected programme's slug. Delta (the real one)
    // played beta 1-0; Delta State's own site publishes alpha 2-0 delta-state.
    // alpha 2-0 "delta" and beta 1-0 delta share delta but not the score.
    const copies: Copy[] = [
      { by: "alpha", n: 1, date: D, home: "alpha", away: "delta", score: [2, 0] },
      { by: "beta", n: 3, date: D, home: "beta", away: "delta", score: [1, 0] },
      { by: "delta", n: 4, date: D, home: "beta", away: "delta", score: [1, 0] },
      { by: "delta-state", n: 9, date: D, home: "alpha", away: "delta-state", score: [2, 0] },
    ];
    const { matches, counts } = physicalMatches(2026, [
      conference("aaa", ["alpha", "beta", "delta"], copies),
      conference("bbb", ["delta-state"], copies),
    ]);
    expect(matches.map((m) => `${m.home} ${m.homeGoals}-${m.awayGoals} ${m.away}`).sort()).toEqual([
      "alpha 2-0 delta-state",
      "beta 1-0 delta",
    ]);
    expect(counts.merges.map((m) => [m.shared, m.other, m.from, m.aliases])).toEqual([
      ["alpha", "delta-state", "own", ["delta"]],
    ]);
    expect(counts.illDefined).toEqual([]);
  });

  test("two matches of one programme on one day with different scores both stand", () => {
    // The shape of 2022-08-28 (women): "queens" names two programmes.
    const copies: Copy[] = [
      { by: "alpha", n: 1, date: D, home: "alpha", away: "queens", score: [0, 0] },
      { by: "beta", n: 2, date: D, home: "queens", away: "beta", score: [1, 2] },
    ];
    const { matches, counts } = physicalMatches(2026, [
      conference("aaa", ["alpha", "beta", "queens"], copies),
    ]);
    expect(matches).toHaveLength(2);
    expect(counts.merges).toEqual([]);
    expect(counts.illDefined).toEqual([]);
  });

  test("copies cluster: a record joins when it is a copy of any record in the cluster", () => {
    // Three records of one match: alpha's "gamma-u", gamma's own, and a third
    // listing from alpha's site as "gamma-univ". Each is a copy of the others.
    const copies: Copy[] = [
      { by: "alpha", n: 1, date: D, home: "alpha", away: "gamma-u", score: [3, 0] },
      { by: "alpha", n: 2, date: D, home: "alpha", away: "gamma-univ", score: [3, 0] },
      { by: "gamma", n: 7, date: D, home: "alpha", away: "gamma", score: [3, 0] },
    ];
    const { matches, counts } = physicalMatches(2026, [
      conference("aaa", ["alpha"], copies),
      conference("bbb", ["gamma"], copies),
    ]);
    expect(matches.map((m) => [m.away, m.merged])).toEqual([["gamma", 2]]);
    expect(counts.merges[0]?.aliases.sort()).toEqual(["gamma-u", "gamma-univ"]);
  });

  test("a chain that shares no one slug cannot be rewritten: it stands, and is listed", () => {
    // alpha v "beta-u" (alpha's site) and alpha v beta (beta's) share alpha;
    // alpha v beta and "alpha-c" v beta (a third listing) share beta. The
    // first and last share nothing, so the cluster names no single other side.
    const copies: Copy[] = [
      { by: "alpha", n: 1, date: D, home: "alpha", away: "beta-u", score: [2, 1] },
      { by: "beta", n: 2, date: D, home: "alpha", away: "beta", score: [2, 1] },
      { by: "beta", n: 3, date: D, home: "alpha-c", away: "beta", score: [2, 1] },
    ];
    const { matches, counts } = physicalMatches(2026, [
      conference("aaa", ["alpha", "beta"], copies),
    ]);
    expect(matches).toHaveLength(3);
    expect(counts.merges).toEqual([]);
    expect(counts.illDefined).toHaveLength(1);
  });
});

describe("the other side's slug, and the publisher", () => {
  test("the publisher is the slug inside the record id", () => {
    expect(publisherOf("sidearm:west-florida:1234")).toBe("west-florida");
    expect(publisherOf("presto:umary:20240915_abcd")).toBe("umary");
    expect(publisherOf("nonsense")).toBe("");
  });

  test("with no copy from the other side's own site, the kept copy's slug stands", () => {
    // Both copies are alpha's own (a home and a neutral listing, say): no copy
    // is omega's own, so the slug is the one the site's fold keeps.
    const copies: Copy[] = [
      { by: "alpha", n: 1, date: D, home: "alpha", away: "omega", score: [1, 0] },
      { by: "alpha", n: 2, date: D, home: "alpha", away: "omega-college", score: [1, 0] },
    ];
    const { matches, counts } = physicalMatches(2026, [conference("aaa", ["alpha"], copies)]);
    expect(matches).toHaveLength(1);
    expect(counts.merges[0]?.other).toBe("omega");
    expect(counts.merges[0]?.from).toBe("kept");
    expect(matches[0]?.away).toBe("omega");
  });
});
