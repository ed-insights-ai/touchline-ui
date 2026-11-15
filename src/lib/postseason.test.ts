/**
 * The postseason fold: one tie per match, rounds from the match graph, who
 * went through, and what a tie may not claim.
 *
 * Every case is a hand-built file, so these hold whatever the data home
 * carries; the 2025 bracket they mirror (39 NCAA ties, eight second-round
 * ties between two first-round byes, six shootouts) is the shape the rules
 * were measured on.
 */

import { describe, expect, test } from "bun:test";
import type { Season } from "./derive.ts";
import { computeTable, type Fixture, type FixtureStage, type FixturesFile } from "./model.ts";
import { nameBookFor } from "./names.ts";
import {
  aheadOf,
  fieldOf,
  kickoffOf,
  layoutRegion,
  layoutTree,
  postseasonOf,
  publisherOf,
  regionsOf,
  routeOf,
  shapeOf,
  sideSeasonOf,
  splitOf,
  stageTag,
  treesOf,
} from "./postseason.ts";

const NCAA: FixtureStage = { phase: "postseason", competition: "ncaa", source: "NCAA Tournament" };
const CONF: FixtureStage = {
  phase: "postseason",
  competition: "conference",
  source: "GLVC Championship",
};

let n = 0;
const fx = (
  date: string,
  home: string,
  hs: number | null,
  as: number | null,
  away: string,
  extra: Partial<Fixture> = {},
): Fixture => ({
  id: `sidearm:${home}:${++n}`,
  date,
  home,
  away,
  status: hs === null ? "scheduled" : "final",
  ...(hs === null ? {} : { home_score: hs, away_score: as as number }),
  conference_game: false,
  ...extra,
});

const fileOf = (code: string, members: string[], fixtures: Fixture[]): FixturesFile => ({
  schema: "touchline.fixtures/2",
  season: 2025,
  gender: "men",
  conference: code,
  collected_at: "2025-12-20T06:00:00+00:00",
  programmes: members.map((slug) => ({ slug, name: slug, conference: code })),
  fixtures,
});

const seasonOf = (key: string, fixtures: FixturesFile): Season => ({
  key,
  fixtures,
  rosters: null,
  stats: null,
  matches: null,
  coverage: null,
  names: nameBookFor(fixtures),
  asOf: fixtures.collected_at.slice(0, 10),
  collectedAt: fixtures.collected_at,
});

describe("rounds come from the graph, counted back from the latest round", () => {
  // A region of six: two first-round ties, two byes. The second round holds a
  // tie between the two bye teams, which no forward count can place.
  const ties = [
    fx("2025-11-20", "a", 1, 0, "b", { stage: NCAA }),
    fx("2025-11-20", "c", 2, 1, "d", { stage: NCAA }),
    fx("2025-11-23", "a", 2, 0, "c", { stage: NCAA }),
    fx("2025-11-23", "e", 1, 1, "f", {
      stage: NCAA,
      result_published: "T, 1-1 (W, 4-3 PK)",
      shootout: { winner: "e", home: 4, away: 3 },
    }),
    fx("2025-11-30", "a", 0, 1, "e", { stage: NCAA }),
  ];
  const p = postseasonOf([seasonOf("x", fileOf("X", ["a", "b", "c", "d", "e", "f"], ties))]);

  test("a tie between two byes is a second-round tie", () => {
    const labels = p.ncaa.ties.map((t) => `${t.fixture.home}${t.fixture.away}:${t.label}`);
    expect(labels).toEqual(["ab:R1", "cd:R1", "ac:SF", "ef:SF", "ae:FINAL"]);
  });

  test("a shootout decides who went through and nothing else", () => {
    const ef = p.ncaa.ties.find((t) => t.fixture.home === "e");
    expect(ef?.through).toEqual({ slug: "e", evidence: "OBSERVED", by: "shootout" });
    const split = splitOf([{ fixture: ef?.fixture as Fixture, result: "D" }]);
    expect(split.ncaa).toEqual({ won: 0, drawn: 1, lost: 0 });
  });

  test("the champion is the final's winner, and the tag names the competition", () => {
    expect(p.ncaa.champion).toEqual({ slug: "e", evidence: "OBSERVED", by: "score" });
    const final = p.ncaa.final;
    expect(final && stageTag(p, final.identity)?.text).toBe("NCAA FINAL");
  });
});

describe("one tie per match, every record folded", () => {
  test("a fact one record carries is kept, oriented to the kept record", () => {
    const home = fx("2025-11-23", "rockhurst", 1, 1, "maryville", { stage: NCAA });
    const twin = fx("2025-11-23", "rockhurst", 1, 1, "maryville", {
      shootout: { winner: "rockhurst", home: 4, away: 3 },
      result_published: "T, 1-1 RU wins on PKs, 4-3",
    });
    const p = postseasonOf([
      seasonOf("glvc", fileOf("GLVC", ["rockhurst"], [home])),
      seasonOf("glvc2", fileOf("GLVC2", ["maryville"], [twin])),
    ]);
    const [tie] = p.ncaa.ties;
    expect(tie?.disputed).toBe(false);
    expect(tie?.shootout).toEqual({ winner: "rockhurst", home: 4, away: 3 });
    expect(tie?.through?.slug).toBe("rockhurst");
  });

  test("records that contradict make the tie disputed, and it claims nothing", () => {
    const a = fx("2025-11-23", "lincoln", 1, 1, "tiffin", {
      stage: NCAA,
      shootout: { winner: "lincoln", home: 4, away: 3 },
    });
    const b = fx("2025-11-23", "lincoln", 1, 1, "tiffin", {
      stage: CONF,
      shootout: { winner: "tiffin", home: 3, away: 4 },
    });
    const p = postseasonOf([
      seasonOf("glvc", fileOf("GLVC", ["lincoln"], [a])),
      seasonOf("gmac", fileOf("G-MAC", ["tiffin"], [b])),
    ]);
    const tie = [...p.byIdentity.values()][0];
    expect(tie?.disputed).toBe(true);
    expect(tie?.through).toBeNull();
    expect(tie?.shootout).toBeNull();
    expect(tie?.versions).toHaveLength(2);
  });

  test("a record with no stage is absence, not a vote against", () => {
    const stamped = fx("2025-11-21", "anderson", 0, 0, "lincoln-memorial", { stage: NCAA });
    const silent = fx("2025-11-21", "anderson", 0, 0, "lincoln-memorial", {
      result_published: "T, 0-0 , 2-3 Penalty Kicks",
    });
    const p = postseasonOf([
      seasonOf("sac", fileOf("SAC", ["anderson"], [stamped])),
      seasonOf("sac2", fileOf("SAC2", ["lincoln-memorial"], [silent])),
    ]);
    const tie = p.ncaa.ties[0];
    expect(tie?.disputed).toBe(false);
    expect(tie?.resultPublished).toBe("T, 0-0 , 2-3 Penalty Kicks");
    // Level, no collected shootout, no next round: undetermined.
    expect(tie?.through).toBeNull();
  });
});

describe("a broken chain is not a final", () => {
  test("a winner whose next tie no record holds is unplaced", () => {
    const ties = [
      fx("2025-11-09", "wilmington", 3, 2, "felician", { stage: CONF }),
      fx("2025-11-09", "post", 1, 0, "georgian-court", { stage: CONF }),
      fx("2025-11-12", "post", 3, 0, "holy-family", { stage: CONF }),
      fx("2025-11-15", "post", 3, 4, "bridgeport", { stage: CONF }),
    ];
    const members = [
      "wilmington",
      "felician",
      "post",
      "georgian-court",
      "holy-family",
      "bridgeport",
    ];
    const p = postseasonOf([seasonOf("cacc", fileOf("CACC", members, ties))]);
    expect(p.conference).toHaveLength(1);
    const [t] = p.conference;
    const wilmington = t?.ties.find((x) => x.fixture.home === "wilmington");
    expect(wilmington?.round).toBe(0);
    expect(wilmington?.label).toBe("");
    expect(t?.champion?.slug).toBe("bridgeport");
  });
});

describe("the table is the regular season's", () => {
  test("a tournament match between two members takes no points", () => {
    const file = fileOf(
      "GLVC",
      ["a", "b"],
      [
        fx("2025-10-01", "a", 1, 0, "b", { conference_game: true, stage: { phase: "regular" } }),
        fx("2025-11-09", "b", 3, 0, "a", { conference_game: true, stage: CONF }),
      ],
    );
    const rows = computeTable(file);
    expect(rows.find((r) => r.slug === "a")?.points).toBe(3);
    expect(rows.find((r) => r.slug === "b")?.points).toBe(0);
  });
});

describe("a region is laid out from the ties behind its quarterfinal", () => {
  test("a bye leaves one feeder, and the line runs straight", () => {
    const ties = [
      fx("2025-11-20", "a", 1, 0, "b", { stage: NCAA }),
      fx("2025-11-23", "a", 2, 0, "c", { stage: NCAA }),
      fx("2025-11-23", "d", 1, 0, "e", { stage: NCAA }),
      fx("2025-11-30", "a", 1, 0, "d", { stage: NCAA }),
      fx("2025-11-30", "f", 1, 0, "g", { stage: NCAA }),
      fx("2025-12-06", "a", 1, 0, "f", { stage: NCAA }),
      fx("2025-12-06", "h", 1, 0, "i", { stage: NCAA }),
      fx("2025-12-12", "a", 1, 0, "h", { stage: NCAA }),
    ];
    const slugs = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    const p = postseasonOf([seasonOf("x", fileOf("X", slugs, ties))]);
    const labels = p.ncaa.ties.map((t) => t.label);
    expect(labels).toEqual(["R1", "R2", "R2", "R3", "R3", "SF", "SF", "FINAL"]);
    // No QF round of four here, so no regions: the page lists by round.
    expect(regionsOf(p.ncaa)).toEqual([]);
    const fake = { quarterfinal: p.ncaa.ties[3] as never, ties: p.ncaa.ties.slice(0, 4) };
    const { cells, cols, rows } = layoutRegion(fake);
    expect(cols).toBe(3);
    expect(rows).toBe(2);
    const ac = cells.find((c) => c.tie.fixture.away === "c");
    expect(ac?.direct).toBe(false);
    const ab = cells.find((c) => c.tie.fixture.away === "b");
    expect(ab?.direct).toBe(true);
  });
});

describe("before a region exists, the bracket is the trees the results join", () => {
  // The 2026 shape in miniature: a first round of play-in ties, smaller than
  // the full second round the byes join, and two second-round ties between
  // byes that nothing yet joins to anything.
  const ties = [
    fx("2026-11-13", "a", 2, 0, "b", { stage: NCAA }),
    fx("2026-11-13", "c", 1, 1, "d", {
      stage: NCAA,
      result_published: "T, 1-1 (W, 3-1 PK)",
      shootout: { winner: "c", home: 3, away: 1 },
    }),
    fx("2026-11-15", "e", null, null, "a", { stage: NCAA }),
    fx("2026-11-15", "f", null, null, "c", { stage: NCAA }),
    fx("2026-11-14", "g", 2, 1, "h", { stage: NCAA }),
    fx("2026-11-15", "i", null, null, "j", { stage: NCAA }),
  ];
  const slugs = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const p = postseasonOf([seasonOf("x", fileOf("X", slugs, ties))]);
  const trees = treesOf(p.ncaa.ties);

  test("a first-round winner joins its next tie, and lone ties stay alone", () => {
    expect(trees.map((t) => t.ties.map((x) => `${x.fixture.home}${x.fixture.away}`))).toEqual([
      ["ab", "ea"],
      ["cd", "fc"],
      ["gh"],
      ["ij"],
    ]);
  });

  test("trees stacked on one grid keep each round in its own column", () => {
    const joined = layoutTree(trees[0] as never, 1);
    expect(
      joined.cells.map((c) => [`${c.tie.fixture.home}${c.tie.fixture.away}`, c.col, c.direct]),
    ).toEqual([
      ["ea", 2, false],
      ["ab", 1, true],
    ]);
    const lone = layoutTree(trees[3] as never, 1);
    expect(lone.cells).toHaveLength(1);
    expect(lone.cells[0]?.col).toBe(2);
    expect(lone.cells[0]?.feeds).toBe(false);
  });

  test("the rounds still to come are counted from the full round, never paired", () => {
    expect(shapeOf(p.ncaa)?.from).toBe(2);
    expect(shapeOf(p.ncaa)?.rounds).toBe(4);
    expect(aheadOf(p.ncaa)).toEqual([
      { round: 3, label: "SF", ties: 2 },
      { round: 4, label: "FINAL", ties: 1 },
    ]);
  });

  test("every programme in the field stands once, read from its latest tie", () => {
    const standing = Object.fromEntries(fieldOf(p.ncaa).map((e) => [e.slug, e.standing]));
    expect(Object.keys(standing).sort()).toEqual(slugs);
    expect(standing).toEqual({
      a: "to-play",
      b: "out",
      c: "to-play",
      d: "out",
      e: "to-play",
      f: "to-play",
      g: "through",
      h: "out",
      i: "to-play",
      j: "to-play",
    });
  });
});

describe("what the field strip and the count may not claim", () => {
  test("a decided final leaves nothing ahead and crowns only its winner", () => {
    const ties = [
      fx("2025-11-20", "a", 1, 0, "b", { stage: NCAA }),
      fx("2025-11-20", "c", 2, 1, "d", { stage: NCAA }),
      fx("2025-11-30", "a", 0, 1, "c", { stage: NCAA }),
    ];
    const p = postseasonOf([seasonOf("x", fileOf("X", ["a", "b", "c", "d"], ties))]);
    expect(aheadOf(p.ncaa)).toEqual([]);
    const standing = Object.fromEntries(fieldOf(p.ncaa).map((e) => [e.slug, e.standing]));
    expect(standing).toEqual({ a: "out", b: "out", c: "champion", d: "out" });
  });

  test("a level score with no shootout collected is unsettled, not a result", () => {
    const ties = [
      fx("2025-11-20", "a", 1, 1, "b", { stage: NCAA }),
      fx("2025-11-20", "c", 2, 0, "d", { stage: NCAA }),
    ];
    const p = postseasonOf([seasonOf("x", fileOf("X", ["a", "b", "c", "d"], ties))]);
    const standing = Object.fromEntries(fieldOf(p.ncaa).map((e) => [e.slug, e.standing]));
    expect(standing.a).toBe("unsettled");
    expect(standing.b).toBe("unsettled");
  });

  test("a later round the halving cannot hold means no shape, so nothing is counted", () => {
    const ties = [
      fx("2025-11-20", "a", 1, 0, "b", { stage: NCAA }),
      fx("2025-11-20", "c", 1, 0, "d", { stage: NCAA }),
      fx("2025-11-23", "a", null, null, "e", { stage: NCAA }),
      fx("2025-11-23", "c", null, null, "f", { stage: NCAA }),
      fx("2025-11-23", "g", null, null, "h", { stage: NCAA }),
    ];
    const p = postseasonOf([
      seasonOf("x", fileOf("X", ["a", "b", "c", "d", "e", "f", "g", "h"], ties)),
    ]);
    expect(shapeOf(p.ncaa)).toBeNull();
    expect(aheadOf(p.ncaa)).toEqual([]);
  });
});

describe("a round is named from the confirmed shape before the final is collected", () => {
  // Four quarterfinals played and both semifinals scheduled: the halving is
  // confirmed by the semifinals' sides, so the rounds carry their names even
  // though no final exists yet to count back from.
  const qf = [
    fx("2026-11-27", "a", 2, 0, "b", { stage: NCAA }),
    fx("2026-11-27", "c", 1, 0, "d", { stage: NCAA }),
    fx("2026-11-27", "e", 3, 1, "f", { stage: NCAA }),
    fx("2026-11-27", "g", 0, 1, "h", { stage: NCAA }),
  ];
  const sf = [
    fx("2026-12-04", "a", null, null, "c", { stage: NCAA }),
    fx("2026-12-04", "e", null, null, "h", { stage: NCAA }),
  ];
  const slugs = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const labels = (fixtures: Fixture[]): string[] =>
    postseasonOf([seasonOf("x", fileOf("X", slugs, fixtures))]).ncaa.ties.map(
      (t) => `${t.fixture.home}${t.fixture.away}:${t.label}`,
    );

  test("quarterfinals and semifinals are named while the final is still to come", () => {
    expect(labels([...qf, ...sf]).sort()).toEqual([
      "ab:QF",
      "ac:SF",
      "cd:QF",
      "ef:QF",
      "eh:SF",
      "gh:QF",
    ]);
  });

  test("an unconfirmed shape keeps the names the chain alone supports", () => {
    expect(labels(qf).some((l) => l.endsWith(":QF"))).toBe(false);
  });
});

describe("an unplayed tie's kickoff is printed as one page published it", () => {
  // Two schedules of one second-round tie, each in its own local time.
  const hostRecord = fx("2026-11-15", "fhsu", null, null, "lake-erie", {
    stage: NCAA,
    time: "13:00",
    venue: "Hays, Kan.",
    source_url: "https://fhsuathletics.com/sports/mens-soccer/schedule/2026",
  });
  const awayRecord = fx("2026-11-15", "fhsu", null, null, "lake-erie", {
    stage: NCAA,
    time: "14:00",
    venue: "Hays, KS",
    source_url: "https://lakeeriestorm.com/sports/mens-soccer/schedule/2026",
  });
  const earlier = fx("2026-11-13", "lake-erie", 2, 0, "ashland", { stage: NCAA });
  // The away side's file first in config order: the host's record must still win.
  const p = postseasonOf([
    seasonOf("gmac", fileOf("G-MAC", ["lake-erie", "ashland"], [awayRecord, earlier])),
    seasonOf("gac", fileOf("GAC", ["fhsu"], [hostRecord])),
  ]);
  const tie = p.ncaa.ties.find((t) => t.fixture.date === "2026-11-15");

  test("the host's record is printed, and a page that differs is named, not merged", () => {
    const k = tie && kickoffOf(tie);
    expect(k?.hosted).toBe(true);
    expect(k?.primary).toMatchObject({ by: "fhsu", time: "13:00", venue: "Hays, Kan." });
    expect(k?.agree).toEqual([]);
    expect(k?.differ.map((v) => [v.by, v.time])).toEqual([["lake-erie", "14:00"]]);
  });

  test("a neutral site has no host, so no record is called the host's", () => {
    const n1 = fx("2026-11-15", "fhsu", null, null, "lake-erie", {
      stage: NCAA,
      neutral: true,
      time: "13:00",
    });
    const q = postseasonOf([seasonOf("gac", fileOf("GAC", ["fhsu"], [n1]))]);
    const t = q.ncaa.ties[0];
    expect(t && kickoffOf(t).hosted).toBe(false);
  });

  test("a side's route is its earlier ties in the tournament, and a first tie has none", () => {
    if (!tie) throw new Error("no tie");
    expect(routeOf(p.ncaa, tie, "lake-erie").map((t) => t.fixture.away)).toEqual(["ashland"]);
    expect(routeOf(p.ncaa, tie, "fhsu")).toEqual([]);
  });

  test("a side's record is read from the file it is a member of", () => {
    if (!tie) throw new Error("no tie");
    expect(sideSeasonOf(tie, "fhsu")?.key).toBe("gac");
    expect(sideSeasonOf(tie, "lake-erie")?.key).toBe("gmac");
  });

  test("a record between two members is the page every row from its host involves", () => {
    const a = fx("2026-11-01", "x", 1, 0, "y", { source_url: "https://x.edu/s" });
    const b = fx("2026-10-01", "x", 1, 0, "z", { source_url: "https://x.edu/s" });
    const c = fx("2026-10-02", "y", 1, 0, "w", { source_url: "https://y.edu/s" });
    const season = seasonOf("c", fileOf("C", ["x", "y"], [a, b, c]));
    expect(publisherOf({ key: "c", code: "C", season, fixture: a })).toBe("x");
    expect(
      publisherOf({ key: "c", code: "C", season, fixture: { ...a, source_url: undefined } }),
    ).toBeNull();
  });
});
