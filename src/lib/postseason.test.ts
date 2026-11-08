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
import { layoutRegion, postseasonOf, regionsOf, splitOf, stageTag } from "./postseason.ts";

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
