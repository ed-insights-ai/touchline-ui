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
import { divisions, site } from "../site.config.ts";
import { loadFixtures } from "./data.ts";
import { matchIdentity, type Season } from "./derive.ts";
import { readsD2 } from "./fixtures/facts.ts";
import { PHASE_DECIDED, PHASE_TOURNAMENT, seasonPhase } from "./journal.ts";
import { computeTable, type Fixture, type FixtureStage, type FixturesFile } from "./model.ts";
import { nameBookFor } from "./names.ts";
import {
  aheadOf,
  canonicalFixture,
  canonicalSlug,
  fieldOf,
  groundsAgree,
  kickoffOf,
  knownProgrammes,
  layoutRegion,
  layoutTree,
  noShapeLine,
  participantsOf,
  postseasonOf,
  publisherOf,
  regionsOf,
  routeOf,
  sameDayNote,
  shapeOf,
  sideSeasonOf,
  splitOf,
  stageTag,
  treesOf,
  verdictLine,
  verdictOf,
} from "./postseason.ts";
import { divisionPostseason } from "./postseason-division.ts";

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

  test("every program in the field stands once, read from its latest tie", () => {
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

describe("a final played level is decided, and names a champion only from a shootout", () => {
  // A four-side conference tournament: two semifinals, then the final.
  const semis = [
    fx("2026-11-04", "a", 1, 0, "b", { stage: CONF }),
    fx("2026-11-04", "c", 2, 1, "d", { stage: CONF }),
  ];
  const tournamentWith = (final: Fixture) => {
    const season = seasonOf("x", fileOf("X", ["a", "b", "c", "d"], [...semis, final]));
    const t = postseasonOf([season]).conference[0];
    if (!t) throw new Error("no tournament");
    return { season, t };
  };
  const name = (slug: string): string => slug.toUpperCase();

  test("drawn with no shootout published: decided, no champion, said so", () => {
    const { season, t } = tournamentWith(fx("2026-11-08", "a", 1, 1, "c", { stage: CONF }));
    expect(t.final?.label).toBe("FINAL");
    expect(t.decided).toBe(true);
    expect(t.champion).toBeNull();
    expect(verdictOf(t).kind).toBe("drawn");
    expect(verdictLine(t, name)).toEqual({
      head: "Final drawn 1–1 · shootout not published",
      note: "No record publishes a shootout, so no champion is named.",
    });
    expect(aheadOf(t)).toEqual([]);
    expect(seasonPhase(season)).toBe(PHASE_DECIDED);
  });

  test("drawn with a result cell but no collected shootout: the cell is quoted, no one is named", () => {
    const { t } = tournamentWith(
      fx("2026-11-08", "a", 0, 0, "c", { stage: CONF, result_published: "T, 0-0 3-2 PKs" }),
    );
    expect(t.decided).toBe(true);
    expect(t.champion).toBeNull();
    const line = verdictLine(t, name);
    expect(line.head).toBe("Final drawn 0–0 · shootout published, winner not matched to a side");
    expect(line.note).toContain("“T, 0-0 3-2 PKs”");
    // The quote names a winner in its own words; the note must not read as
    // contradicting it, only say why no programme is named from it.
    expect(line.note).toContain("quoted as published");
    expect(line.note).toContain("names no program Touchline can match to a side");
    expect(line.note).not.toContain("No record collects");
    expect(line.head).not.toContain("to play");
  });

  test("a collected shootout names the champion, on penalties, as published", () => {
    const { season, t } = tournamentWith(
      fx("2026-11-08", "a", 1, 1, "c", {
        stage: CONF,
        result_published: "T, 1-1 (L, 2-3 PK)",
        shootout: { winner: "c", home: 2, away: 3 },
      }),
    );
    expect(t.champion).toEqual({ slug: "c", evidence: "OBSERVED", by: "shootout" });
    expect(verdictLine(t, name).head).toBe("Champions: C, on penalties, 3–2, as published");
    expect(seasonPhase(season)).toBe(PHASE_DECIDED);
  });

  test("a final won on the score names its winner", () => {
    const { t } = tournamentWith(fx("2026-11-08", "a", 2, 1, "c", { stage: CONF }));
    expect(verdictLine(t, name)).toEqual({ head: "Champions: A", note: null });
  });

  test("only an unplayed final is still to play", () => {
    const { season, t } = tournamentWith(fx("2026-11-08", "a", null, null, "c", { stage: CONF }));
    expect(t.decided).toBe(false);
    expect(verdictLine(t, name).head).toBe("Final to play");
    expect(seasonPhase(season)).toBe(PHASE_TOURNAMENT);
  });

  test("an NCAA final drawn with no shootout is decided too", () => {
    const ties = [
      fx("2025-11-20", "a", 1, 0, "b", { stage: NCAA }),
      fx("2025-11-20", "c", 2, 1, "d", { stage: NCAA }),
      fx("2025-11-30", "a", 2, 2, "c", { stage: NCAA }),
    ];
    const p = postseasonOf([seasonOf("x", fileOf("X", ["a", "b", "c", "d"], ties))]);
    expect(p.ncaa.decided).toBe(true);
    expect(p.ncaa.champion).toBeNull();
    expect(aheadOf(p.ncaa)).toEqual([]);
  });

  // The real finals the council found printing "Final to play".
  const realFinal = (code: string) =>
    divisionPostseason().conference.find((t) => t.codes.includes(code));

  test.skipIf(!readsD2("men"))("men's MEC: the 1–1 final is decided, no champion named", () => {
    const t = realFinal("MEC");
    expect(t?.final?.fixture.date).toBe("2026-11-08");
    expect(t?.decided).toBe(true);
    expect(t?.champion).toBeNull();
    expect(t && verdictLine(t, (s) => s).head).toBe("Final drawn 1–1 · shootout not published");
  });

  test.skipIf(!readsD2("women"))(
    "women's GLVC and GLIAC: drawn finals are decided, no champion named",
    () => {
      for (const code of ["GLVC", "GLIAC"]) {
        const t = realFinal(code);
        expect(t?.decided).toBe(true);
        expect(t?.champion).toBeNull();
        expect(t && verdictLine(t, (s) => s).head).toContain("Final drawn");
      }
    },
  );
});

describe("a ranking printed in front of an opponent's slug is read past", () => {
  const known = new Set(["mckendree", "wayne-state", "ashland", "21-club"]);

  test("the ranking is stripped only when the rest is a known program and the whole is not", () => {
    expect(canonicalSlug("21-mckendree", known)).toBe("mckendree");
    expect(canonicalSlug("15-ashland", known)).toBe("ashland");
    expect(canonicalSlug("mckendree", known)).toBe("mckendree");
    // A known slug that happens to start with a number is a programme.
    expect(canonicalSlug("21-club", known)).toBe("21-club");
    // The rest is no programme anyone follows: the slug stands as published.
    expect(canonicalSlug("402-development-academy", known)).toBe("402-development-academy");
    expect(canonicalSlug("7-", known)).toBe("7-");
  });

  test("a record is rewritten only where a side changes; the shootout's winner follows", () => {
    const plain = fx("2026-11-13", "wayne-state", 2, 1, "mckendree");
    expect(canonicalFixture(plain, known)).toBe(plain);
    const ranked = fx("2026-11-13", "wayne-state", 1, 1, "21-mckendree", {
      shootout: { winner: "21-mckendree", home: 3, away: 4 },
    });
    const read = canonicalFixture(ranked, known);
    expect([read.home, read.away, read.shootout?.winner]).toEqual([
      "wayne-state",
      "mckendree",
      "mckendree",
    ]);
    expect(ranked.away).toBe("21-mckendree");
  });

  // 2026 women's GLIAC: Wayne State's schedule ranks its NCAA opponents.
  const glvc = fileOf(
    "GLVC",
    ["mckendree", "drury"],
    [
      fx("2026-11-12", "mckendree", 2, 0, "drury", { stage: NCAA }),
      fx("2026-11-13", "mckendree", 1, 2, "wayne-state", { stage: NCAA }),
    ],
  );
  const gliac = fileOf(
    "GLIAC",
    ["wayne-state", "ferris-state"],
    [
      fx("2026-11-12", "wayne-state", 3, 0, "ferris-state", { stage: NCAA }),
      fx("2026-11-13", "wayne-state", 2, 1, "21-mckendree", { stage: NCAA }),
      fx("2026-11-15", "15-ashland", null, null, "wayne-state", { stage: NCAA }),
    ],
  );
  const gmac = fileOf(
    "G-MAC",
    ["ashland", "lake-erie"],
    [
      fx("2026-11-12", "ashland", 1, 0, "lake-erie", { stage: NCAA }),
      fx("2026-11-15", "ashland", null, null, "wayne-state", { stage: NCAA }),
    ],
  );
  const p = postseasonOf([
    seasonOf("glvc", glvc),
    seasonOf("gliac", gliac),
    seasonOf("gmac", gmac),
  ]);
  const field = new Set(p.ncaa.ties.flatMap((t) => [t.fixture.home, t.fixture.away]));

  test("no phantom program joins the field", () => {
    expect([...field].sort()).toEqual([
      "ashland",
      "drury",
      "ferris-state",
      "lake-erie",
      "mckendree",
      "wayne-state",
    ]);
    expect(p.ncaa.ties).toHaveLength(5);
  });

  test("one match is one tie, and the rounds are counted from it", () => {
    // Read raw, the ranked records made Wayne State's Nov 13 tie two ties in
    // successive rounds and every round behind them one too high.
    expect(p.ncaa.rounds).toBe(3);
    const round = (date: string, side: string): number | undefined =>
      p.ncaa.ties.find(
        (t) => t.fixture.date === date && [t.fixture.home, t.fixture.away].includes(side),
      )?.round;
    expect([
      round("2026-11-12", "wayne-state"),
      round("2026-11-13", "wayne-state"),
      round("2026-11-15", "wayne-state"),
    ]).toEqual([1, 2, 3]);
    const out = fieldOf(p.ncaa).find((e) => e.slug === "mckendree");
    expect(out?.standing).toBe("out");
    expect(
      p.ncaa.ties.filter((t) => [t.fixture.home, t.fixture.away].includes("mckendree")),
    ).toHaveLength(2);
    const last = p.ncaa.ties.at(-1);
    if (!last) throw new Error("no tie");
    expect(routeOf(p.ncaa, last, "wayne-state").map((t) => t.fixture.date)).toEqual([
      "2026-11-12",
      "2026-11-13",
    ]);
  });

  test("the ranked record's own identity still finds its tie", () => {
    const raw = gliac.fixtures[1] as Fixture;
    const tie = p.byIdentity.get(matchIdentity(raw));
    expect(tie?.identity).toBe("2026-11-13 mckendree v wayne-state");
    expect(p.tournamentOf.get(matchIdentity(raw))).toBe(p.ncaa);
    // Iteration sees each tie once.
    expect([...p.byIdentity.values()]).toHaveLength(p.ncaa.ties.length);
  });
});

describe("no side plays two rounds in one day", () => {
  test("two ties one side has on one date are not successive rounds", () => {
    // One schedule names the opponent differently ("x" beside "x-irvine"),
    // and no record settles which it is: the two are set apart, and the chain
    // must not read them as one round and the next.
    const ties = [
      fx("2026-11-13", "a", 1, 0, "b", { stage: NCAA }),
      fx("2026-11-13", "c", 1, 0, "d", { stage: NCAA }),
      fx("2026-11-15", "x", null, null, "a", { stage: NCAA }),
      fx("2026-11-15", "x-irvine", null, null, "a", { stage: NCAA }),
      fx("2026-11-15", "c", null, null, "e", { stage: NCAA }),
    ];
    const p = postseasonOf([
      seasonOf("x", fileOf("X", ["a", "b", "c", "d", "e", "x-irvine"], ties)),
    ]);
    expect(p.ncaa.rounds).toBe(2);
    expect(p.ncaa.ties.map((t) => `${t.fixture.date}:${t.label}`)).toEqual([
      "2026-11-13:R1",
      "2026-11-13:R1",
      "2026-11-15:R2",
    ]);
    expect(p.ncaa.apart.map((t) => t.sameDay?.reason)).toEqual([
      "uncorroborated",
      "uncorroborated",
    ]);
  });
});

describe("one side, two records, one day: one tie where a record corroborates it", () => {
  // The 2026 women's shape: Cal State LA's schedule names its second-round
  // opponent "concordia", a slug no file lists; Concordia Irvine's own
  // schedule lists the same kickoff in Irvine.
  const ccaa = fileOf(
    "CCAA",
    ["csula", "merced"],
    [
      fx("2026-11-13", "csula", 2, 0, "merced", { stage: NCAA }),
      fx("2026-11-15", "concordia", null, null, "csula", {
        stage: NCAA,
        time: "15:00",
        venue: "Irvine",
        source_url: "https://lagoldeneagles.com/sports/womens-soccer/schedule/2026",
      }),
    ],
  );
  const pacwest = fileOf(
    "PACWEST",
    ["concordia-irvine", "biola"],
    [
      fx("2026-11-13", "biola", 0, 1, "concordia-irvine", { stage: NCAA }),
      fx("2026-11-15", "concordia-irvine", null, null, "csula", {
        stage: NCAA,
        neutral: true,
        time: "15:00",
        venue: "Irvine, Calif. / UC Irvine",
        source_url: "https://cuigoldeneagles.com/sports/womens-soccer/schedule/2026",
      }),
    ],
  );
  const p = postseasonOf([seasonOf("ccaa", ccaa), seasonOf("pacwest", pacwest)]);
  const day = p.ncaa.ties.filter((t) => t.fixture.date === "2026-11-15");

  test("the two records are one tie against the corroborated opponent", () => {
    expect(day).toHaveLength(1);
    const tie = day[0];
    expect(tie?.identity).toBe("2026-11-15 concordia-irvine v csula");
    expect(tie?.match.sightings.map((s) => s.code)).toEqual(["CCAA", "PACWEST"]);
    expect(tie?.sameDay).toMatchObject({
      kind: "folded",
      side: "csula",
      opponent: "concordia-irvine",
      agreed: ["kickoff", "ground"],
    });
    expect(participantsOf(p.ncaa).has("concordia")).toBe(false);
    expect(p.ncaa.ties).toHaveLength(3);
    expect(p.ncaa.apart).toEqual([]);
  });

  test("the record that named the opponent differently still finds the tie", () => {
    const raw = ccaa.fixtures[1] as Fixture;
    expect(p.byIdentity.get(matchIdentity(raw))?.identity).toBe(
      "2026-11-15 concordia-irvine v csula",
    );
    expect([...p.byIdentity.values()]).toHaveLength(3);
  });

  test("each file's name for the opponent is quoted", () => {
    const tie = day[0];
    if (!tie?.sameDay) throw new Error("no fold");
    const note = sameDayNote(tie.sameDay, (slug) => tie.match.season.names.name(slug));
    expect(note).toContain("(CCAA) names the opponent “Concordia”");
    expect(note).toContain("own schedule (PACWEST) lists this match");
    expect(note).toContain("counted once");
  });

  test("no corroboration, no fold: both set apart, counted nowhere", () => {
    const lone = fileOf(
      "CCAA",
      ["csula", "merced"],
      [
        fx("2026-11-13", "csula", 2, 0, "merced", { stage: NCAA }),
        fx("2026-11-15", "concordia", null, null, "csula", { stage: NCAA, time: "15:00" }),
        fx("2026-11-15", "concordia-ca", null, null, "csula", { stage: NCAA, time: "15:00" }),
      ],
    );
    const q = postseasonOf([seasonOf("ccaa", lone)]);
    expect(q.ncaa.ties).toHaveLength(1);
    expect(q.ncaa.apart).toHaveLength(2);
    expect(q.ncaa.apart.every((t) => t.sameDay?.kind === "ambiguous" && t.round === 0)).toBe(true);
    expect(participantsOf(q.ncaa).has("concordia")).toBe(false);
    // Still a tie the site can open and look up.
    expect(q.byIdentity.size).toBe(3);
    const sd = q.ncaa.apart[0]?.sameDay;
    if (!sd) throw new Error("no note");
    expect(sameDayNote(sd, (s) => s)).toContain("set apart and count nowhere");
  });

  test("a different kickoff keeps them apart, even with a corroborated opponent", () => {
    const later = {
      ...pacwest,
      fixtures: pacwest.fixtures.map((f) =>
        f.date === "2026-11-15" ? { ...f, time: "19:00" } : f,
      ),
    };
    const q = postseasonOf([seasonOf("ccaa", ccaa), seasonOf("pacwest", later)]);
    expect(q.ncaa.ties.filter((t) => t.fixture.date === "2026-11-15")).toEqual([]);
    expect(q.ncaa.apart.map((t) => t.sameDay?.reason)).toEqual(["differ", "differ"]);
  });

  test("grounds agree when one wording leads with the other's place", () => {
    expect(groundsAgree("Irvine", "Irvine, Calif. / UC Irvine")).toBe(true);
    expect(groundsAgree("Hays, Kan.", "Hays, KS")).toBe(true);
    expect(groundsAgree("Irvine", "Pomona, Calif.")).toBe(false);
  });

  test("a side's route never holds a tie on the same day", () => {
    const tie = day[0];
    if (!tie) throw new Error("no tie");
    expect(routeOf(p.ncaa, tie, "csula").map((t) => t.fixture.date)).toEqual(["2026-11-13"]);
    // A same-day twin left unfolded is not the road here either.
    const q = postseasonOf([
      seasonOf(
        "x",
        fileOf(
          "X",
          ["a", "b", "c"],
          [
            fx("2026-11-13", "a", 1, 0, "b", { stage: NCAA }),
            fx("2026-11-15", "a", null, null, "c", { stage: CONF, time: "13:00" }),
            fx("2026-11-15", "a", null, null, "q", { stage: NCAA }),
          ],
        ),
      ),
    ]);
    const last = q.ncaa.ties.find((t) => t.fixture.date === "2026-11-15");
    if (!last) throw new Error("no tie");
    expect(routeOf(q.ncaa, last, "a").map((t) => t.fixture.date)).toEqual(["2026-11-13"]);
  });

  test.skipIf(!readsD2("women"))(
    "women's 2026: Cal State LA plays one second-round tie, and the field has a shape",
    () => {
      const real = divisionPostseason();
      const mine = real.ncaa.ties.filter(
        (t) =>
          t.fixture.date === "2026-11-15" &&
          [t.fixture.home, t.fixture.away].includes("cal-state-la"),
      );
      expect(mine).toHaveLength(1);
      expect(mine[0]?.identity).toBe("2026-11-15 cal-state-la v concordia-irvine");
      expect(new Set(mine[0]?.match.sightings.map((s) => s.code))).toEqual(
        new Set(["CCAA", "PACWEST"]),
      );
      // The collector now mints concordia-irvine on this tie (tl-0n3,
      // keelson-rib-touchline #136), so the two records share one identity
      // and nothing is left to fold. A file collected before that fix still
      // folds, and its identity still reaches the tie.
      const stale = mine[0]?.match.sightings.some((s) => s.fixture.home === "concordia");
      if (stale) {
        expect(mine[0]?.sameDay?.kind).toBe("folded");
        expect(real.byIdentity.get("2026-11-15 cal-state-la v concordia")).toBe(mine[0]);
      } else {
        expect(mine[0]?.sameDay ?? null).toBeNull();
      }
      expect(participantsOf(real.ncaa).has("concordia")).toBe(false);
      // No side holds two ties on one day anywhere in the field.
      const days = real.ncaa.ties.flatMap((t) =>
        [t.fixture.home, t.fixture.away].map((slug) => `${t.fixture.date} ${slug}`),
      );
      expect(days.length).toBe(new Set(days).size);
      // With the phantom gone the knockout reads a shape: no silent funnel.
      // That holds once every tie is placed. While one pod's next round is not
      // scheduled yet, its ties are unplaced by design (place(): a chain that
      // ends more than two days before the latest tie is never counted from a
      // false end), and then no round halves to a final. 16 November 2026:
      // Dallas Baptist v UCCS was played a day after the rest of the second
      // round, with the third round already listed for the other seven pods.
      // The field then draws no funnel and says why, which is the other honest
      // state; what may never happen is no shape and no word.
      if (real.ncaa.ties.every((t) => t.round > 0)) {
        expect(shapeOf(real.ncaa)).not.toBeNull();
        expect(noShapeLine(real.ncaa)).toBeNull();
      } else {
        expect(noShapeLine(real.ncaa) === null).toBe(shapeOf(real.ncaa) !== null);
      }
    },
  );
});

describe("a field with no shape says why no funnel is drawn", () => {
  test("the counts the page has, in one line", () => {
    const ties = [
      fx("2026-11-13", "a", 1, 0, "b", { stage: NCAA }),
      fx("2026-11-13", "c", 1, 0, "d", { stage: NCAA }),
      fx("2026-11-13", "e", 1, 0, "f", { stage: NCAA }),
      fx("2026-11-15", "a", null, null, "c", { stage: NCAA }),
      fx("2026-11-15", "e", null, null, "g", { stage: NCAA }),
      fx("2026-11-15", "h", null, null, "i", { stage: NCAA }),
    ];
    const p = postseasonOf([seasonOf("x", fileOf("X", ["a", "b", "c", "d", "e", "f"], ties))]);
    expect(shapeOf(p.ncaa)).toBeNull();
    expect(noShapeLine(p.ncaa)).toBe(
      "No per-round funnel is drawn: the first round holds 3 collected ties and the second round 3, and no round halving to a final can be read from those counts.",
    );
  });
  test("a shape, or no tie at all, needs no line", () => {
    const p = postseasonOf([
      seasonOf(
        "x",
        fileOf(
          "X",
          ["a", "b", "c", "d"],
          [
            fx("2026-11-13", "a", 1, 0, "b", { stage: NCAA }),
            fx("2026-11-13", "c", 1, 0, "d", { stage: NCAA }),
          ],
        ),
      ),
    ]);
    expect(shapeOf(p.ncaa)).not.toBeNull();
    expect(noShapeLine(p.ncaa)).toBeNull();
    expect(noShapeLine(postseasonOf([seasonOf("x", fileOf("X", ["a"], []))]).ncaa)).toBeNull();
  });
});

describe("every side of every NCAA tie is a program the data home knows", () => {
  // Read straight from each gender's files, whichever gender this build is.
  // A side that resolves to no known programme is a phantom in the field.
  //
  // No exception. The 2026 women's CCAA file still slugs Concordia Irvine as
  // "concordia" (a collector fault the site does not edit), and the same-day
  // fold reads it as Concordia Irvine because that programme's own schedule
  // lists the match (sameDayGroups). A slug neither rule resolves fails here.
  const EXPECTED_UNRESOLVED: Record<string, string[]> = {};
  for (const gender of ["men", "women"] as const) {
    const files = (divisions[gender]?.conferences ?? []).flatMap((key) => {
      try {
        return [{ key, file: loadFixtures(site.season, gender, key) }];
      } catch {
        return [];
      }
    });
    test.skipIf(files.length === 0)(`${gender}: every NCAA side resolves`, () => {
      const seasons = files.map(({ key, file }) => seasonOf(key, file));
      const known = knownProgrammes(seasons);
      const ncaa = postseasonOf(seasons).ncaa;
      const sides = new Set(ncaa.ties.flatMap((t) => [t.fixture.home, t.fixture.away]));
      const unresolved = [...sides].filter((slug) => !known.has(slug)).sort();
      expect(unresolved.filter((slug) => /^\d+-/.test(slug))).toEqual([]);
      expect(unresolved).toEqual(EXPECTED_UNRESOLVED[gender] ?? []);
    });
  }
});
