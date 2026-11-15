// The Match Centre's glue (lib/preview.ts): the preview's sides and the
// played page's lineups and sheet links. The rules are small and each one
// guards a claim: a sheet link that 404s, a starter guessed from nothing, a
// tie counted as part of its own route, a box score credited to the wrong
// programme.

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import {
  fixtureById,
  formOf,
  leadKeeper,
  loadSeason,
  matchDetailOf,
  matchIdentity,
  recordOf,
  squadOf,
} from "./derive.ts";
import { homeSeasons } from "./home.ts";
import type { MatchTeam, Player, PlayerStats } from "./model.ts";
import { playerCard } from "./player.ts";
import { divisionPostseason } from "./postseason-division.ts";
import {
  boxScorePublisher,
  entryOf,
  lineByName,
  lineupOf,
  meetingsOf,
  memberSeasonOf,
  routeOf,
  sheetAnchor,
  sheetIndex,
  sideSummary,
  topScorerOf,
} from "./preview.ts";

// The real-data cases name men's programmes (the GAC final, Fort Hays State
// v Lake Erie), so they run against the men's build and skip under women's.
const menOnly = test.skipIf(site.gender !== "men");
const gac = loadSeason("gac");
const seasons = homeSeasons();
const PREVIEW = "sidearm:fort-hays-state:14072"; // FHSU v Lake Erie, NCAA, scheduled
const PLAYED = "sidearm:fort-hays-state:14405"; // GAC final, FHSU 2–1 Northeastern State

const stat = (name: string, goals?: number, assists?: number): PlayerStats => ({
  name,
  ...(goals === undefined ? {} : { goals }),
  ...(assists === undefined ? {} : { assists }),
});

describe("topScorerOf", () => {
  test("most goals, then most assists, then by name", () => {
    const top = topScorerOf([stat("B", 4, 1), stat("A", 4, 3), stat("C", 2, 9)]);
    expect(top?.name).toBe("A");
    expect(topScorerOf([stat("Z", 3, 0), stat("Y", 3, 0)])?.name).toBe("Y");
  });
  test("nobody is a top scorer without a goal", () => {
    expect(topScorerOf([stat("A", 0, 5), stat("B")])).toBeNull();
    expect(topScorerOf([])).toBeNull();
  });
});

describe("lineupOf", () => {
  const team = (players: MatchTeam["players"]): MatchTeam => ({ name: "X", periods: [], players });
  test("starters then substitutes, each in published order", () => {
    const l = lineupOf(
      team([
        { name: "S1", started: true },
        { name: "B1", started: false },
        { name: "S2", started: true },
        { name: "B2", started: false },
      ]),
    );
    expect(l.starters.map((x) => x.name)).toEqual(["S1", "S2"]);
    expect(l.substitutes.map((x) => x.name)).toEqual(["B1", "B2"]);
    expect(l.unmarked).toEqual([]);
  });
  test("a line with no starter flag is not guessed into a group", () => {
    const l = lineupOf(team([{ name: "U" }, { name: "S", started: true }]));
    expect(l.unmarked.map((x) => x.name)).toEqual(["U"]);
    expect(l.starters.map((x) => x.name)).toEqual(["S"]);
    expect(l.substitutes).toEqual([]);
  });
  test("no box-score side, no lines", () => {
    expect(lineupOf(undefined)).toEqual({ starters: [], substitutes: [], unmarked: [] });
  });
});

describe("the player sheet a name links to", () => {
  const roster: Player[] = [
    { name: "José Núñez", source_url: "https://x.edu/roster/jose-nunez/101" },
    { name: "Sam Lee", source_url: "https://x.edu/roster/sam-lee/102" },
    { name: "Sam Lee", source_url: "https://x.edu/roster/sam-lee-2/103" },
    { name: "No Url" },
  ];
  const find = sheetIndex("x", roster);

  menOnly("the anchor is the one playerCard mints, for every real roster player", () => {
    for (const slug of ["fort-hays-state", "northeastern-state"]) {
      const squad = squadOf(gac, slug);
      expect(squad.length).toBeGreaterThan(0);
      for (const m of squad) {
        const card = playerCard(gac, slug, m.player, m.stats, m.keeper);
        expect(sheetAnchor(slug, m.player)).toBe(card.anchor);
      }
    }
  });
  test("joined by the published id, then by the folded name", () => {
    expect(find({ name: "anyone", player_id: "101" })).toBe("p-x-101");
    expect(find({ name: "anyone", player_ref: { id: "101", source: "roster" } })).toBe("p-x-101");
    expect(find({ name: "Jose Nunez" })).toBe("p-x-101");
    expect(find({ name: "No Url" })).toBe("p-x-no-url");
  });
  test("an unresolved key is not an id, and an ambiguous name is not a join", () => {
    expect(find({ name: "nobody", player_ref: { id: "101", source: "key" } })).toBeNull();
    expect(find({ name: "Sam Lee" })).toBeNull();
    expect(find({ name: "Sam Lee", player_id: "103" })).toBe("p-x-103");
  });
  test("a name off the roster has no sheet", () => {
    expect(find({ name: "Visiting Trialist" })).toBeNull();
    expect(sheetIndex("x", [])({ name: "José Núñez" })).toBeNull();
  });
  menOnly("every line of the GAC final's box score finds a sheet on its team page", () => {
    const d = matchDetailOf(gac, PLAYED);
    expect(d).not.toBeNull();
    const homeIndex = d?.home_index ?? 0;
    const sides = [
      { team: d?.teams[homeIndex], slug: "fort-hays-state" },
      { team: d?.teams[1 - homeIndex], slug: "northeastern-state" },
    ];
    for (const { team, slug } of sides) {
      const ms = memberSeasonOf(seasons, slug);
      const roster = ms?.rosters?.rosters[slug]?.players ?? [];
      const anchors = new Set(roster.map((p) => sheetAnchor(slug, p)));
      const look = sheetIndex(slug, roster);
      for (const line of team?.players ?? []) {
        const a = look(line);
        if (a !== null) expect(anchors.has(a)).toBe(true);
      }
    }
  });
});

describe("lineByName", () => {
  const team: MatchTeam = {
    name: "X",
    periods: [],
    players: [{ name: "JJ Espinosa", player_id: "9587" }],
    keepers: [{ name: "Payton Roehrich", player_id: "9246" }],
  };
  test("a scorer resolves to their line, exactly or folded", () => {
    expect(lineByName(team, "JJ Espinosa")?.player_id).toBe("9587");
    expect(lineByName(team, "jj espinosa")?.player_id).toBe("9587");
    expect(lineByName(team, "Payton Roehrich")?.player_id).toBe("9246");
    expect(lineByName(team, "Somebody Else")).toBeNull();
    expect(lineByName(undefined, "JJ Espinosa")).toBeNull();
  });
});

describe("a side's season so far", () => {
  menOnly("a side's season is the conference that lists it; outside them, none", () => {
    expect(memberSeasonOf(seasons, "fort-hays-state")?.key).toBe("gac");
    expect(memberSeasonOf(seasons, "lake-erie")?.key).toBe("g-mac");
    expect(memberSeasonOf(seasons, "no-such-programme")).toBeNull();
  });
  menOnly("the summary is the team page's own figures, not new ones", () => {
    const s = sideSummary(gac, "fort-hays-state");
    const rec = recordOf(gac, "fort-hays-state");
    expect([s.won, s.drawn, s.lost, s.played]).toEqual([rec.won, rec.drawn, rec.lost, rec.played]);
    expect([s.goalsFor, s.goalsAgainst]).toEqual([rec.goalsFor, rec.goalsAgainst]);
    expect(s.form).toEqual(formOf(gac, "fort-hays-state"));
    expect(s.keeper).toEqual(leadKeeper(gac, "fort-hays-state"));
    expect(s.conference?.code).toBe(gac.fixtures.conference);
  });
});

describe("routeOf", () => {
  const p = divisionPostseason();
  const f = fixtureById(gac, PREVIEW);
  menOnly("the tie on the page is not part of its own route, and nothing after it is", () => {
    expect(f).not.toBeNull();
    if (!f) return;
    for (const slug of [f.home, f.away]) {
      const route = routeOf(p, slug, f);
      for (const r of route) {
        expect(r.tie.identity).not.toBe(matchIdentity(f));
        expect(r.date <= f.date).toBe(true);
        expect(r.tie.fixture.home === slug || r.tie.fixture.away === slug).toBe(true);
        expect(r.tag.length).toBeGreaterThan(0);
      }
      const dates = route.map((r) => r.date);
      expect(dates).toEqual([...dates].sort());
    }
  });
  test("a score reads from the side's own end", () => {
    if (!f) return;
    const final = routeOf(p, "northeastern-state", f).find((r) => r.tie.fixture.id === PLAYED);
    expect(final?.line).toBe("1–2");
    expect(final?.result).toBe("L");
    const won = routeOf(p, "fort-hays-state", f).find((r) => r.tie.fixture.id === PLAYED);
    expect(won?.line).toBe("2–1");
    expect(won?.result).toBe("W");
  });
});

describe("entryOf", () => {
  const p = divisionPostseason();
  const f = fixtureById(gac, PREVIEW);
  menOnly("a followed side with no first-round tie enters in the second round", () => {
    if (!f) throw new Error("preview fixture missing");
    expect(entryOf(p, memberSeasonOf(seasons, f.home), f.home, f)?.text).toBe(
      "Enters in the second round",
    );
  });
  menOnly("a side with no collected schedule is never said to have had a bye", () => {
    if (!f) throw new Error("preview fixture missing");
    // Its silence before this round is not evidence of anything.
    expect(entryOf(p, null, f.away, f)).toBeNull();
  });
  test("nobody enters a tournament later than its first round in the first round", () => {
    for (const tie of p.byIdentity.values()) {
      if (tie.round > 1) continue;
      for (const slug of [tie.fixture.home, tie.fixture.away]) {
        expect(entryOf(p, memberSeasonOf(seasons, slug), slug, tie.fixture)).toBeNull();
      }
    }
  });
  test("no side that played an earlier round of the tournament is said to enter later", () => {
    for (const [identity, tie] of p.byIdentity) {
      const tournament = p.tournamentOf.get(identity);
      for (const slug of [tie.fixture.home, tie.fixture.away]) {
        const entry = entryOf(p, memberSeasonOf(seasons, slug), slug, tie.fixture);
        if (!entry) continue;
        expect(tie.round).toBeGreaterThan(1);
        expect(entry.round).toBe(tie.round);
        const earlier = (tournament?.ties ?? []).filter(
          (t) =>
            t.identity !== identity &&
            (t.fixture.home === slug || t.fixture.away === slug) &&
            t.round < tie.round,
        );
        expect(earlier).toEqual([]);
      }
    }
  });
});

describe("meetingsOf", () => {
  menOnly("earlier scored meetings only, never the match itself", () => {
    const f = fixtureById(gac, PLAYED);
    expect(f).not.toBeNull();
    if (!f) return;
    const met = meetingsOf(gac, f.home, f.away, f);
    for (const m of met) {
      expect(m.fixture.id).not.toBe(f.id);
      const pair = new Set([m.fixture.home, m.fixture.away]);
      expect(pair.has(f.home) && pair.has(f.away)).toBe(true);
      expect(m.fixture.status).toBe("final");
    }
  });
});

describe("boxScorePublisher", () => {
  menOnly("the GAC final's box score is Fort Hays State's", () => {
    const d = matchDetailOf(gac, PLAYED);
    expect(d && boxScorePublisher(seasons, d.source_url)?.slug).toBe("fort-hays-state");
  });
  test("a host no collected programme owns names nobody", () => {
    expect(boxScorePublisher(seasons, "https://example.org/boxscore/1")).toBeNull();
    expect(boxScorePublisher(seasons, "not a url")).toBeNull();
  });
  test("a twin box score is credited to the site that served it, not the fixture's owner", () => {
    let checked = 0;
    for (const s of seasons) {
      for (const [id, d] of Object.entries(s.matches?.matches ?? {})) {
        const f = fixtureById(s, id);
        if (!f?.source_url) continue;
        if (new URL(f.source_url).hostname === new URL(d.source_url).hostname) continue;
        const who = boxScorePublisher(seasons, d.source_url);
        if (who) {
          expect(who.slug).not.toBe(id.split(":")[1]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
