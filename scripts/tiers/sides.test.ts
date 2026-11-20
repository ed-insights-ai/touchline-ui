// Section 1, reconciled (sides.ts): which copy each figure of a physical match
// is read from. Every case is a shape taken from the data home, named where
// it was found; the numbers are worked by hand in the comments.

import { describe, expect, test } from "bun:test";
import type { Sighting } from "../../src/lib/division.ts";
import type { Fixture, MatchDetail } from "../../src/lib/model.ts";
import { homeRow, nameAffinity, nameTokens, programmeTokens, resolveSides } from "./sides.ts";

const tokens = programmeTokens([
  { slug: "lake-erie", name: "Lake Erie" },
  { slug: "indianapolis", name: "Indianapolis", abbr: "UIndy" },
  { slug: "dallas-baptist", name: "Dallas Baptist", abbr: "DBU" },
  { slug: "ut-dallas", name: "UT Dallas", abbr: "UTD" },
]);

const detail = (
  names: [string, string],
  homeIndex?: number,
  shots: [number | undefined, number | undefined] = [10, 5],
): MatchDetail =>
  ({
    source_url: "https://example.test/box",
    ...(homeIndex === undefined ? {} : { home_index: homeIndex }),
    teams: [
      { name: names[0], periods: [], shots: shots[0], players: [] },
      { name: names[1], periods: [], shots: shots[1], players: [] },
    ],
  }) as MatchDetail;

describe("team-name affinity", () => {
  test("tokens: brackets and stopwords go, '&' is 'and', abbreviations expand", () => {
    expect([...nameTokens("St. Cloud State (Minn.)")].sort()).toEqual([
      "cloud",
      "saint",
      "st",
      "state",
    ]);
    expect([...nameTokens("Saint Michael's")].sort()).toEqual(["michaels", "saint"]);
    expect([...nameTokens("Texas A&M University")].sort()).toEqual(["a", "m", "texas"]);
  });

  test("one per shared token, a half for a long token opening an unshared one", () => {
    // {lake, erie} against "Lake Erie": 2. {indianapolis, uindy} against
    // "Indy": no shared token; "indy" (4 letters) opens neither "indi..." nor
    // "uind...": 0. Against "Indianapolis Greyhounds": 1.
    const lake = tokens.get("lake-erie") as Set<string>;
    const indy = tokens.get("indianapolis") as Set<string>;
    expect(nameAffinity(lake, "Lake Erie")).toBe(2);
    expect(nameAffinity(indy, "Indy")).toBe(0);
    expect(nameAffinity(indy, "Indianapolis Greyhounds")).toBe(1);
    // "Indianap" shares no token but opens "indianapolis": a half.
    expect(nameAffinity(indy, "Indianap")).toBe(0.5);
  });
});

describe("orienting a box score", () => {
  test("the names decide even against home_index (sidearm:lake-erie:4587, 2022)", () => {
    // Lake Erie at home to Indianapolis; the box prints ["UIndy", "Lake Erie"]
    // with home_index 0. Straight: aff(lake, UIndy) 0 + aff(indy, Lake Erie) 0
    // = 0. Crossed: aff(lake, Lake Erie) 2 + aff(indy, UIndy) 1 = 3. Row 1 is
    // Lake Erie's: the 16 lines of row 0 are all on Indianapolis's roster.
    const f = { home: "lake-erie", away: "indianapolis" };
    expect(homeRow(f, detail(["UIndy", "Lake Erie"], 0), tokens)).toBe(1);
  });

  test("no home_index: the names alone (sidearm:dallas-baptist:8617, 2025)", () => {
    // Dallas Baptist at home; the box prints ["Texas-Dallas", "DBU"] and no
    // home_index. Straight: aff(dbu, Texas-Dallas) 1 + aff(utd, DBU) 1 = 2.
    // Crossed: aff(dbu, DBU) 3 + aff(utd, Texas-Dallas) 2 = 5. Row 1.
    const f = { home: "dallas-baptist", away: "ut-dallas" };
    expect(homeRow(f, detail(["Texas-Dallas", "DBU"]), tokens)).toBe(1);
  });

  test("names that tie fall back to home_index; neither gives no orientation", () => {
    const f = { home: "alpha", away: "beta" };
    expect(homeRow(f, detail(["Home Side", "Away Side"], 1), tokens)).toBe(1);
    expect(homeRow(f, detail(["Home Side", "Away Side"]), tokens)).toBeNull();
  });
});

// ── resolveSides ─────────────────────────────────────────────────────────────

interface Copy {
  id: string;
  home: string;
  away: string;
  score?: [number, number];
  neutral?: boolean;
  status?: Fixture["status"];
  /** The box score's rows as [home slug's, away slug's] shots; none: no box. */
  shots?: [number | undefined, number | undefined];
}

function resolve(copies: Copy[], keptIndex = 0) {
  const fixtures = copies.map(
    (c): Fixture =>
      ({
        id: c.id,
        date: "2026-09-05",
        home: c.home,
        away: c.away,
        status: c.status ?? "final",
        home_score: c.score?.[0] ?? 1,
        away_score: c.score?.[1] ?? 0,
        ...(c.neutral === undefined ? {} : { neutral: c.neutral }),
      }) as Fixture,
  );
  const sightings = fixtures.map((fixture) => ({ fixture }) as Sighting);
  const boxes = new Map<string, MatchDetail>();
  copies.forEach((c) => {
    if (c.shots) boxes.set(c.id, detail([c.home, c.away], 0, c.shots));
  });
  return resolveSides(
    sightings,
    fixtures[keptIndex] as Fixture,
    false,
    (s) => boxes.get(s.fixture.id) ?? null,
    (s) => (boxes.has(s.fixture.id) ? 0 : null),
  );
}

describe("R-D: home, away and neutral", () => {
  test("copies that disagree on the home side are a neutral site, sides in slug order", () => {
    // 2022-08-25 West Florida v Tampa at Panama City Beach: each site wrote
    // itself as home; Tampa's copy flags neutral, West Florida's does not.
    const r = resolve([
      { id: "sidearm:west-florida:8850", home: "west-florida", away: "tampa", shots: [9, 7] },
      {
        id: "presto:tampa:s97u",
        home: "tampa",
        away: "west-florida",
        neutral: true,
        shots: [7, 9],
      },
    ]);
    expect([r.home, r.away, r.neutral, r.venueBy]).toEqual([
      "tampa",
      "west-florida",
      true,
      "homes-disagree",
    ]);
  });

  test("an agreed home: the home side's own copy says whether it is neutral", () => {
    // 2022-08-25 Shepherd v UDC at Shepherdstown: only UDC's presto copy
    // flags neutral. Shepherd's own copy does not: a home match.
    const away = resolve([
      {
        id: "presto:district-of-columbia:20220825-shepherd",
        home: "shepherd",
        away: "district-of-columbia",
        neutral: true,
        shots: [8, 3],
      },
      {
        id: "sidearm:shepherd:7153",
        home: "shepherd",
        away: "district-of-columbia",
        shots: [8, 3],
      },
    ]);
    expect([away.home, away.neutral, away.venueBy]).toEqual(["shepherd", false, "own-copy"]);
    // 2022-08-28 UDC v Seton Hill "@RFK Fields": UDC's own copy flags it.
    const own = resolve([
      {
        id: "presto:district-of-columbia:20220828-seton-hill",
        home: "district-of-columbia",
        away: "seton-hill",
        neutral: true,
        shots: [8, 3],
      },
      {
        id: "sidearm:seton-hill:6072",
        home: "district-of-columbia",
        away: "seton-hill",
        shots: [8, 3],
      },
    ]);
    expect([own.neutral, own.venueBy]).toEqual([true, "own-copy"]);
  });

  test("with no copy from the home side's site, any copy's flag", () => {
    const r = resolve([
      { id: "sidearm:visitor:1", home: "host", away: "visitor", neutral: true, shots: [4, 4] },
    ]);
    expect([r.neutral, r.venueBy]).toEqual([true, "any-copy"]);
  });

  test("a final copy with no box score still speaks; a copy not final does not", () => {
    // 2024-09-08 Goldey-Beacom v UDC: UDC's presto copy carries the box score
    // and flags neutral; Goldey-Beacom's own copy, final with no box score,
    // does not flag it. A home match.
    const r = resolve([
      {
        id: "presto:district-of-columbia:20240908-goldey-beacom",
        home: "goldey-beacom",
        away: "district-of-columbia",
        neutral: true,
        shots: [12, 6],
      },
      { id: "sidearm:goldey-beacom:6387", home: "goldey-beacom", away: "district-of-columbia" },
    ]);
    expect([r.neutral, r.venueBy]).toEqual([false, "own-copy"]);
    // A stale scheduled copy that names the other side home is not a copy.
    const s = resolve([
      { id: "sidearm:alpha:1", home: "alpha", away: "beta", shots: [5, 5] },
      { id: "sidearm:beta:2", home: "beta", away: "alpha", status: "scheduled" },
    ]);
    expect([s.home, s.neutral]).toEqual(["alpha", false]);
  });
});

describe("R-B: the score and the team shot totals", () => {
  test("the score is the home side's own copy's (2026-09-05 Chico State v Saint Martin's)", () => {
    // Chico State's copy prints 3-0, Saint Martin's 2-0; Chico State was home.
    const r = resolve(
      [
        {
          id: "sidearm:saint-martins:6679",
          home: "chico-state",
          away: "saint-martins",
          score: [2, 0],
          shots: [14, 5],
        },
        {
          id: "sidearm:chico-state:7000",
          home: "chico-state",
          away: "saint-martins",
          score: [3, 0],
          shots: [14, 5],
        },
      ],
      0,
    );
    expect([r.homeGoals, r.awayGoals]).toEqual([3, 0]);
  });

  test("shots from the home side's own copy (2022-09-03 Georgian Court at Le Moyne)", () => {
    // Le Moyne's own copy: Le Moyne 10, Georgian Court 9. Georgian Court's
    // copy: 13 and 9. Le Moyne was home, so 10 and 9, whichever copy is kept.
    const copies: Copy[] = [
      {
        id: "sidearm:georgian-court:4958",
        home: "le-moyne",
        away: "georgian-court",
        shots: [13, 9],
      },
      { id: "sidearm:le-moyne:13569", home: "le-moyne", away: "georgian-court", shots: [10, 9] },
    ];
    for (const kept of [0, 1]) {
      const r = resolve(copies, kept);
      expect([r.homeShots, r.awayShots, r.shotsFrom]).toEqual([10, 9, "sidearm:le-moyne:13569"]);
    }
  });

  test("a copy without both totals is passed over; none with both gives none", () => {
    const r = resolve([
      { id: "sidearm:host:1", home: "host", away: "visitor", shots: [11, undefined] },
      { id: "sidearm:visitor:2", home: "host", away: "visitor", shots: [12, 6] },
    ]);
    expect([r.homeShots, r.awayShots, r.shotsFrom]).toEqual([12, 6, "sidearm:visitor:2"]);
    const none = resolve([
      { id: "sidearm:host:1", home: "host", away: "visitor", shots: [11, undefined] },
    ]);
    expect([none.homeShots, none.awayShots, none.shotsFrom]).toEqual([null, null, null]);
  });

  test("copies that disagree on the home side: the first slug's own copy", () => {
    // 2023-09-09 Chico State v Saint Martin's: each site home; 19-4 against
    // 18-4. Slug order makes chico-state the home side, so its copy's 19-4.
    const r = resolve([
      {
        id: "sidearm:saint-martins:5530",
        home: "saint-martins",
        away: "chico-state",
        shots: [4, 18],
      },
      {
        id: "sidearm:chico-state:5783",
        home: "chico-state",
        away: "saint-martins",
        shots: [19, 4],
      },
    ]);
    expect([r.home, r.homeShots, r.awayShots, r.neutral]).toEqual(["chico-state", 19, 4, true]);
  });
});

describe("R-A: each side's lines come from its own site's copy when it prints minutes", () => {
  /** A copy of host v visitor whose box prints, for each side, lines with or
   *  without minutes, or none. */
  type Lines = "minutes" | "no-minutes" | "none";
  const copy = (id: string, host: Lines, visitor: Lines) => ({ id, host, visitor });
  const players = (side: string, kind: Lines) =>
    kind === "none"
      ? []
      : [
          {
            name: `${side} Keeper`,
            ...(kind === "minutes" ? { minutes: 90 } : {}),
          },
        ];
  function sides(copies: ReturnType<typeof copy>[]) {
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
          teams: [
            { name: "Host", periods: [], shots: 5, players: players("Host", c.host) },
            { name: "Visitor", periods: [], shots: 5, players: players("Visitor", c.visitor) },
          ],
        } as MatchDetail,
      ]),
    );
    const r = resolveSides(
      fixtures.map((fixture) => ({ fixture }) as Sighting),
      fixtures[0] as Fixture,
      false,
      (s) => boxes.get(s.fixture.id) ?? null,
      () => 0,
    );
    return [r.homeSide?.fixtureId, r.awaySide?.fixtureId];
  }

  test("both copies print minutes: each side reads its own site's copy", () => {
    // The kept copy is the host's; the visitor's lines still come from the
    // visitor's own copy, where its page ids are its own roster's.
    expect(
      sides([
        copy("sidearm:host:1", "minutes", "minutes"),
        copy("sidearm:visitor:2", "minutes", "minutes"),
      ]),
    ).toEqual(["sidearm:host:1", "sidearm:visitor:2"]);
  });

  test("the own copy prints no minutes for the side: the other copy that does", () => {
    // 2022 men, Concord at Charleston: Concord's own copies print no minutes
    // for Concord; Charleston's copy prints 90 for Garrett Boucher.
    expect(
      sides([
        copy("sidearm:host:1", "minutes", "minutes"),
        copy("sidearm:visitor:2", "minutes", "no-minutes"),
      ]),
    ).toEqual(["sidearm:host:1", "sidearm:host:1"]);
  });

  test("no copy prints minutes for the side: the first copy, own first, with any line", () => {
    expect(
      sides([
        copy("sidearm:host:1", "minutes", "no-minutes"),
        copy("sidearm:visitor:2", "minutes", "no-minutes"),
      ]),
    ).toEqual(["sidearm:host:1", "sidearm:visitor:2"]);
    expect(
      sides([
        copy("sidearm:host:1", "minutes", "no-minutes"),
        copy("sidearm:visitor:2", "minutes", "none"),
      ]),
    ).toEqual(["sidearm:host:1", "sidearm:host:1"]);
  });

  test("with no copy from the side's own site, the other copies in record id order", () => {
    expect(
      sides([
        copy("sidearm:neutral-b:2", "minutes", "minutes"),
        copy("sidearm:neutral-a:1", "no-minutes", "minutes"),
      ]),
    ).toEqual(["sidearm:neutral-b:2", "sidearm:neutral-a:1"]);
  });
});
