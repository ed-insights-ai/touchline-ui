/**
 * The cross-conference home page, against the real data home.
 *
 * The page's one promise is that its every count survives being written out
 * as a list and matches what the linked season pages show. So nothing here
 * pins a figure to a snapshot — the data is re-collected daily. Each test
 * recounts from the fixture lists and makes the two answers meet.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { site } from "../site.config.ts";
import {
  boxScoreGaps,
  hasScore,
  isCountable,
  isExhibition,
  isScored,
  loadSeason,
  memberSlugs,
  seasonCounts,
} from "./derive.ts";
import { allSightings, divisionCounts, foldToMatches } from "./division.ts";
import { densityCards, densityConfig } from "./fixtures/density.ts";
import { daysBetween, dowShort, longDate, shortDate, spell } from "./format.ts";
import { footprintOf } from "./geo.ts";
import {
  type BandColumn,
  bandGlyphs,
  bandHead,
  bandHues,
  bandMeta,
  bandOpenFlags,
  type CardView,
  conferenceOfProgramme,
  GLYPHS,
  glyphAt,
  type HomeBand,
  type HomeColumn,
  HUE_COUNT,
  headlineProgrammeOf,
  homeBands,
  homeColumns,
  homeLayout,
  homeSeasons,
  hueAt,
  lastNightLedger,
  lastNightOf,
  lastNightOpen,
  leadLine,
  mapView,
  mostImminentKey,
  type NationalLede,
  nationalAsOf,
  nationalDescription,
  nationalLede,
  nationalMasthead,
  nextLeagueKickoff,
  openBandIndex,
  opensLine,
  placesLine,
  regionChips,
  unplacedLines,
} from "./home.ts";
import { loadNationalJournal, type NationalJournalFile } from "./journal.ts";
import { type Fixture, isPlayed } from "./model.ts";
import { type RegionConfig, regionsInUse } from "./regions.ts";

const seasons = homeSeasons();
const columns = homeColumns(seasons);
const national = divisionCounts(seasons);

/** No headline: the chooser's first leg has nothing to resolve. */
const noHeadline = (): string | null => null;

describe("up to the column cap the page is columns; past it, region bands", () => {
  test("the live site's layout follows the relation, not a literal", () => {
    expect(homeLayout(columns.length)).toBe(
      site.conferences.length <= site.homeColumnCap ? "columns" : "bands",
    );
  });

  test("the cap itself is columns; one more is bands", () => {
    expect(homeLayout(site.homeColumnCap)).toBe("columns");
    expect(homeLayout(site.homeColumnCap + 1)).toBe("bands");
    // The cap is the config's: a different table gives a different answer.
    expect(homeLayout(3, { homeColumnCap: 2 })).toBe("bands");
    expect(homeLayout(2, { homeColumnCap: 2 })).toBe("columns");
  });

  test("every column lands in exactly one band, bands in region order, columns in input order", () => {
    const bands = homeBands(columns);
    const placed = bands.flatMap((b) => b.columns.map((c) => c.key));
    expect(placed.length).toBe(columns.length);
    expect(new Set(placed).size).toBe(columns.length);
    expect(bands.map((b) => b.region.key)).toEqual(
      regionsInUse(columns.map((c) => c.key)).map((r) => r.key),
    );
    for (const b of bands) {
      const inputOrder = columns.filter((c) => b.columns.some((x) => x.key === c.key));
      expect(b.columns.map((c) => c.key)).toEqual(inputOrder.map((c) => c.key));
    }
  });

  test("a band is imminent only when its card is: the most imminent key, and not live", () => {
    const bands = homeBands(columns);
    const imminent = bands.filter((b) => b.imminent);
    const key = mostImminentKey(columns);
    const column = columns.find((c) => c.key === key);
    if (!column || column.live) {
      expect(imminent.length).toBe(0);
      return;
    }
    expect(imminent.length).toBe(1);
    expect(imminent[0]?.columns.some((c) => c.key === key)).toBe(true);
  });

  // The ruling (tl-4an.19): purple marks one thing, the card whose opener is
  // next, and a band head over no purple card is a false signal. Two synthetic
  // sets so both sides of the rule are met whatever the live data says today.
  const cfg: RegionConfig = {
    regions: [
      { key: "a", name: "A" },
      { key: "b", name: "B" },
    ],
    conferenceRegions: { x: "a", y: "b", z: "b" },
  };
  const opener = (key: string, opensOn: string): BandColumn => ({
    key,
    live: false,
    opensOn,
    kickoff: opensOn,
  });
  const live = (key: string): BandColumn => ({
    key,
    live: true,
    opensOn: null,
    kickoff: "2026-09-02",
  });

  test("a live conference holding the most imminent kickoff yields no imminent band", () => {
    const cols = [live("x"), opener("y", "2026-09-12"), opener("z", "2026-09-19")];
    expect(mostImminentKey(cols)).toBe("x");
    const bands = homeBands(cols, cfg);
    expect(bands.map((b) => b.imminent)).toEqual([false, false]);
    // And with no headline the first band opens, not none.
    expect(openBandIndex(bands, null, noHeadline)).toBe(0);
  });

  test("a not-live one yields exactly one imminent band, and with no headline it opens", () => {
    const cols = [opener("y", "2026-09-12"), live("x"), opener("z", "2026-09-19")];
    const bands = homeBands(cols, cfg);
    expect(bands.map((b) => [b.region.key, b.imminent])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(openBandIndex(bands, null, noHeadline)).toBe(1);
  });

  // The rule (tl-38t): exactly one band is open at rest, and it is the region
  // of the conference the headline is about, else the imminent band, else the
  // first. The headline names a programme, not a conference, and the chooser
  // is handed the slug and a resolver rather than a region, so the whole
  // chain — slug to conference to band — is what is under test.
  describe("which band is open at rest", () => {
    // y opens first and is not live, so its band (b) is imminent; x is under
    // way; the headline, when there is one, is about a programme in z's band.
    const cfg3: RegionConfig = {
      regions: [
        { key: "a", name: "A" },
        { key: "b", name: "B" },
        { key: "c", name: "C" },
      ],
      conferenceRegions: { x: "a", y: "b", z: "c" },
    };
    const cols = [opener("y", "2026-09-01"), live("x"), opener("z", "2026-09-19")];
    const bands = homeBands(cols, cfg3);
    /** The member index, in miniature: one programme each. */
    const conferenceOf = (slug: string): string | null =>
      ({ "x-town": "x", "y-town": "y", "z-town": "z" })[slug] ?? null;

    test("the headline's region wins", () => {
      expect(bands.map((b) => b.imminent)).toEqual([false, true, false]);
      expect(openBandIndex(bands, "z-town", conferenceOf)).toBe(2);
      expect(openBandIndex(bands, "x-town", conferenceOf)).toBe(0);
    });

    test("no headline: the imminent band", () => {
      expect(openBandIndex(bands, null, conferenceOf)).toBe(1);
    });

    test("no headline and no imminent band: the first", () => {
      const none = homeBands([live("x"), live("y"), live("z")], cfg3);
      expect(none.map((b) => b.imminent)).toEqual([false, false, false]);
      expect(openBandIndex(none, null, conferenceOf)).toBe(0);
    });

    test("a headline about a programme no followed season lists falls through to imminent", () => {
      expect(conferenceOf("stranger")).toBeNull();
      expect(openBandIndex(bands, "stranger", conferenceOf)).toBe(1);
      // And to the first when nothing is imminent either.
      const none = homeBands([live("x"), live("y"), live("z")], cfg3);
      expect(openBandIndex(none, "stranger", conferenceOf)).toBe(0);
    });

    test("a headline whose conference sits in no band falls through the same way", () => {
      // The resolver knows a conference the bands do not hold — a followed
      // season that failed to collect today, say. Not the resolver's problem
      // to know; the chooser's to survive.
      expect(openBandIndex(bands, "w-town", () => "w")).toBe(1);
    });

    test("empty bands: -1", () => {
      expect(openBandIndex([], "z-town", conferenceOf)).toBe(-1);
      expect(openBandIndex([], null, conferenceOf)).toBe(-1);
    });

    test("the open flags mark exactly one band, the chosen one", () => {
      expect(bandOpenFlags(3, 2)).toEqual([false, false, true]);
      expect(bandOpenFlags(3, 0)).toEqual([true, false, false]);
      expect(bandOpenFlags(0, -1)).toEqual([]);
      const live = homeBands(columns);
      const flags = bandOpenFlags(live.length, openBandIndex(live, null, noHeadline));
      expect(flags.filter(Boolean).length).toBe(1);
    });

    test("on the live data the resolver is the member index, never a name", () => {
      for (const s of seasons) {
        for (const slug of memberSlugs(s)) {
          const key = conferenceOfProgramme(seasons, slug);
          expect(key, slug).not.toBeNull();
          expect(memberSlugs(loadSeason(key as string)).has(slug), slug).toBe(true);
        }
      }
      expect(conferenceOfProgramme(seasons, "no-such-programme")).toBeNull();
      expect(conferenceOfProgramme(seasons, "")).toBeNull();
    });

    test("the headline programme is the journal's basis, and only a non-empty string", () => {
      expect(headlineProgrammeOf(null)).toBeNull();
      const none = { headline: "A story" } as unknown as NationalJournalFile;
      expect(headlineProgrammeOf(none)).toBeNull();
      const empty = {
        headline: "A story",
        basis: { programme: "" },
      } as unknown as NationalJournalFile;
      expect(headlineProgrammeOf(empty)).toBeNull();
      const other = {
        headline: "A story",
        basis: { programme: 3 },
      } as unknown as NationalJournalFile;
      expect(headlineProgrammeOf(other)).toBeNull();
      const named = {
        headline: "A story",
        basis: { programme: "some-town" },
      } as unknown as NationalJournalFile;
      expect(headlineProgrammeOf(named)).toBe("some-town");
    });

    test("the live page: the chain resolves, or falls through, the same way the page does", () => {
      const journal = loadNationalJournal(site.season, site.gender);
      const slug = headlineProgrammeOf(journal);
      const live = homeBands(columns);
      const at = openBandIndex(live, slug, (s) => conferenceOfProgramme(seasons, s));
      const key = slug === null ? null : conferenceOfProgramme(seasons, slug);
      if (key !== null) {
        expect(live[at]?.columns.some((c) => c.key === key)).toBe(true);
      } else {
        expect(at).toBe(live.some((b) => b.imminent) ? live.findIndex((b) => b.imminent) : 0);
      }
    });
  });

  describe("the chips follow site.regions, filtered to the bands present", () => {
    test("on the live data", () => {
      const chips = regionChips(homeBands(columns));
      expect(chips.map((c) => c.key)).toEqual(
        site.regions
          .filter((r) => columns.some((c) => site.conferenceRegions[c.key] === r.key))
          .map((r) => r.key),
      );
      expect(chips.map((c) => c.name)).toEqual(
        chips.map((c) => site.regions.find((r) => r.key === c.key)?.name ?? ""),
      );
      expect(chips.reduce((n, c) => n + c.count, 0)).toBe(columns.length);
    });

    test("and on a table with a region no conference names (tl-4an.21)", () => {
      const cfg3: RegionConfig = {
        regions: [
          { key: "north", name: "North" },
          { key: "empty", name: "Empty" },
          { key: "south", name: "South" },
        ],
        conferenceRegions: { s: "south", n: "north" },
      };
      // Input order is kickoff order; the chips are table order regardless.
      const chips = regionChips(homeBands([opener("s", "2026-09-05"), live("n")], cfg3));
      expect(chips).toEqual([
        { key: "north", name: "North", count: 1 },
        { key: "south", name: "South", count: 1 },
      ]);
    });
  });

  describe("the lead line", () => {
    const view = (
      key: string,
      code: string,
      state: { live?: true; opensOn?: string; imminent?: true },
    ): CardView & BandColumn => ({
      key,
      code,
      name: code,
      live: state.live === true,
      opensOn: state.opensOn ?? null,
      kickoff: state.opensOn ?? (state.live ? "2026-09-02" : null),
      opens: opensLine({ live: state.live === true, opensOn: state.opensOn ?? null }),
      imminent: state.imminent === true,
      played: 1,
      total: 10,
      line: "A sentence the row carries.",
      stamp: null,
      href: "#",
    });
    const cfg2: RegionConfig = {
      regions: [{ key: "mw", name: "Midwest" }],
      conferenceRegions: { g: "mw", m: "mw" },
    };
    /** One region, so one band. */
    const only = (views: (CardView & BandColumn)[]): HomeBand<CardView & BandColumn> =>
      homeBands(views, cfg2)[0] as HomeBand<CardView & BandColumn>;

    test("the plain case names the region and what its lead conference is doing", () => {
      const band = only([
        view("g", "GLVC", { opensOn: "2026-09-04", imminent: true }),
        view("m", "G-MAC", { opensOn: "2026-09-12" }),
      ]);
      expect(leadLine(band, null)).toBe(`Midwest: the GLVC opens ${longDate("2026-09-04")}.`);
      // And the row's own sentence is not restated: the rows beneath carry it.
      expect(leadLine(band, null)).not.toContain("A sentence");
    });

    test("a band under way speaks for the live conference", () => {
      const band = only([view("g", "GLVC", { live: true })]);
      expect(leadLine(band, null)).toBe("Midwest: the GLVC is in conference play.");
    });

    test("the headline case says why the band is open", () => {
      const band = only([
        view("g", "GLVC", { opensOn: "2026-09-04", imminent: true }),
        view("m", "G-MAC", { opensOn: "2026-09-12" }),
      ]);
      expect(leadLine(band, { programme: "Southwest Baptist", code: "GLVC" })).toBe(
        `Open for the headline: Southwest Baptist, of the GLVC. The GLVC opens ${longDate("2026-09-04")}.`,
      );
      // The headline conference, not the band's lead, is the one spoken for.
      expect(leadLine(band, { programme: "Somebody", code: "G-MAC" })).toBe(
        `Open for the headline: Somebody, of the G-MAC. The G-MAC opens ${longDate("2026-09-12")}.`,
      );
    });
  });

  // The rendered page, when a build is on disk: exactly one band carries
  // data-open="true", and it is the one the chooser names from the same
  // journal and seasons. The repo has no component render harness, so this
  // reads dist/ and stands down when there is none — `just verify` builds
  // after the tests, so the assertion is live from the second run onward.
  describe("the built home page", () => {
    const dist = `${process.cwd()}/dist/index.html`;
    test.skipIf(!existsSync(dist))("exactly one band is open, and it is the chosen one", () => {
      const html = readFileSync(dist, "utf8");
      if (homeLayout(columns.length) === "columns") {
        expect(html).not.toContain("data-open=");
        return;
      }
      const opens = [
        ...html.matchAll(/<section[^>]*class="band[^"]*"[^>]*data-open="(true|false)"/g),
      ];
      const bands = homeBands(columns);
      expect(opens.length).toBe(bands.length);
      const open = opens.filter((m) => m[1] === "true");
      expect(open.length).toBe(1);
      const region = /data-region="([^"]+)"/.exec(open[0]?.[0] ?? "")?.[1];
      const journal = loadNationalJournal(site.season, site.gender);
      const at = openBandIndex(bands, headlineProgrammeOf(journal), (s) =>
        conferenceOfProgramme(seasons, s),
      );
      expect(region).toBe(bands[at]?.region.key);
      // The head says the same thing the attribute does.
      const expanded = [...html.matchAll(/class="bhead[^"]*"[^>]*aria-expanded="true"/g)];
      expect(expanded.length).toBe(1);
      // And the chips are pressed the same way.
      const pressed = [...html.matchAll(/class="chip[^"]*"[^>]*aria-pressed="true"/g)];
      expect(pressed.length).toBe(1);
    });

    // The row is the map's legend: a band's rows wear a glyph and a hue each,
    // by position, and every dot of that conference wears the same pair, so
    // the shapes and colours the reader sees on the map are the ones printed
    // beside the codes. Read off the built page, where both sides are
    // rendered. The two are checked as one mark ("disc/1") because the ruling
    // is shape AND colour, never colour alone: a dot in the right hue with
    // the wrong shape is as wrong as the reverse.
    test.skipIf(!existsSync(dist))(
      "a band's rows and its map dots carry matching glyphs and hues",
      () => {
        const html = readFileSync(dist, "utf8");
        if (homeLayout(columns.length) === "columns") {
          // The plain map selects nothing and draws no glyph and no hue.
          expect(html).not.toMatch(/class="dot[^"]*mark-/);
          expect(html).not.toMatch(/class="dot[^"]*hue-/);
          return;
        }
        const glyphOf = (cls: string): string => /(?:^| )mark-([a-z-]+)/.exec(cls)?.[1] ?? "";
        const hueOf = (cls: string): string => /(?:^| )hue-(\d+)/.exec(cls)?.[1] ?? "";
        const markOf = (cls: string): string => `${glyphOf(cls)}/${hueOf(cls)}`;
        const dots = new Map<string, Set<string>>();
        for (const m of html.matchAll(/<g class="(dot[^"]*)"[^>]*data-k="([^"]+)"/g)) {
          expect(glyphOf(m[1] ?? ""), m[2]).not.toBe("");
          expect(hueOf(m[1] ?? ""), m[2]).not.toBe("");
          const set = dots.get(m[2] ?? "") ?? new Set<string>();
          set.add(markOf(m[1] ?? ""));
          dots.set(m[2] ?? "", set);
        }
        expect(dots.size).toBeGreaterThan(0);
        let rows = 0;
        for (const b of homeBands(columns)) {
          const start = html.indexOf(`id="region-${b.region.key}-body"`);
          expect(start, b.region.key).toBeGreaterThan(-1);
          const end = html.indexOf("</section>", start);
          const body = html.slice(start, end);
          const seen = [...body.matchAll(/<a class="(row[^"]*)"[^>]*data-k="([^"]+)"/g)];
          expect(seen.map((m) => m[2])).toEqual(b.columns.map((c) => c.key));
          seen.forEach((m, at) => {
            rows++;
            expect(glyphOf(m[1] ?? ""), m[2]).toBe(glyphAt(at) as string);
            expect(hueOf(m[1] ?? ""), m[2]).toBe(String(hueAt(at)));
            // Every dot of this conference wears the row's glyph in the row's
            // hue, and nothing else.
            const worn = dots.get(m[2] ?? "");
            if (worn) expect([...worn], m[2]).toEqual([markOf(m[1] ?? "")]);
          });
        }
        expect(rows).toBe(columns.length);
        // And every dot belongs to a row.
        for (const k of dots.keys())
          expect(
            columns.some((c) => c.key === k),
            k,
          ).toBe(true);
      },
    );
  });

  test("the glyph is the position in the band, and a band never repeats one", () => {
    expect(GLYPHS.length).toBeGreaterThanOrEqual(4);
    expect(GLYPHS.slice(0, 4)).toEqual(["disc", "ring", "diamond", "hollow-diamond"]);
    expect([0, 1, 2, 3].map(glyphAt)).toEqual([...GLYPHS.slice(0, 4)]);
    expect(glyphAt(GLYPHS.length) as string).toBe(GLYPHS[0]);
    for (const b of homeBands(columns)) {
      const glyphs = b.columns.map((c) => bandGlyphs(homeBands(columns))[c.key]);
      expect(glyphs).toEqual(b.columns.map((_, i) => glyphAt(i)));
      expect(new Set(glyphs).size).toBe(b.columns.length);
    }
  });

  // The hue is the same position the glyph is, so a row's mark and its dots
  // agree on both, and the first position is the accent — the one-conference
  // region is the look the site had before there were hues.
  test("the hue is the position in the band, 1-based, and the first is the accent", () => {
    expect([0, 1, 2].map(hueAt)).toEqual([1, 2, 3]);
    expect(hueAt(HUE_COUNT)).toBe(1);
    for (const b of homeBands(columns)) {
      const hues = b.columns.map((c) => bandHues(homeBands(columns))[c.key]);
      expect(hues).toEqual(b.columns.map((_, i) => hueAt(i)));
      expect(new Set(hues).size).toBe(b.columns.length);
    }
  });

  // The palette lives in tokens.css, and a band may never have more
  // conferences than it has hues, or two of them would wear the same colour.
  // Held against the density fixtures — the twelve- and nineteen-conference
  // sets the map is exercised at before the site follows that many — because
  // the live config is the smallest band the site will ever draw, not the
  // largest. And the token set is held to HUE_COUNT in both directions, so a
  // hue added on one side without the other fails here.
  test("tokens.css holds a hue for every position the largest band needs", () => {
    const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const hues = [...css.matchAll(/--hue-(\d+)\s*:/g)].map((m) => Number(m[1]));
    expect(hues).toEqual(Array.from({ length: HUE_COUNT }, (_, i) => i + 1));
    expect(/--hue-1\s*:\s*var\(--accent\)/.test(css)).toBe(true);
    const largest = Math.max(
      ...([12, 19] as const).flatMap((size) =>
        homeBands(densityCards(size), densityConfig(size)).map((b) => b.columns.length),
      ),
      ...homeBands(columns).map((b) => b.columns.length),
    );
    expect(largest).toBeGreaterThan(1);
    expect(HUE_COUNT).toBeGreaterThanOrEqual(largest);
    // And the shapes keep pace: a position with a hue and no glyph of its own
    // would be colour alone, which the ruling forbids.
    expect(GLYPHS.length).toBeGreaterThanOrEqual(HUE_COUNT);
  });

  test("live and nextOpens are recounted from the columns", () => {
    for (const b of homeBands(columns)) {
      expect(b.live).toBe(b.columns.filter((c) => c.live).length);
      const openers = b.columns
        .filter((c) => !c.live && c.opensOn !== null)
        .map((c) => c.opensOn as string)
        .sort();
      expect(b.nextOpens).toBe(openers[0] ?? null);
    }
  });

  test("the head and the meta share one wording", () => {
    for (const b of homeBands(columns)) {
      const meta = bandMeta(b);
      expect(bandHead(b)).toBe(
        `${b.columns.length} ${b.columns.length === 1 ? "CONFERENCE" : "CONFERENCES"} · ${meta}`,
      );
      if (b.live > 0) {
        expect(meta.startsWith(`${b.live} LIVE`)).toBe(true);
        if (b.nextOpens)
          expect(meta).toContain(`NEXT OPENS ${shortDate(b.nextOpens).toUpperCase()}`);
      } else if (b.nextOpens) {
        expect(meta).toBe(`OPENS ${shortDate(b.nextOpens).toUpperCase()}`);
      } else {
        expect(meta).toBe("NO CONFERENCE DATE PUBLISHED");
      }
    }
  });
});

describe("the columns are config, ordered by the soonest league kickoff", () => {
  test("every collected conference gets exactly one column, and none is invented", () => {
    expect(columns.length).toBe(seasons.length);
    expect(new Set(columns.map((c) => c.key))).toEqual(new Set(seasons.map((s) => s.key)));
    for (const c of columns) expect(site.conferences).toContain(c.key);
  });

  test("the order follows the next league kickoff, recounted from the fixtures", () => {
    // The kickoff is recounted here without nextLeagueKickoff, so the sort key
    // and this recount have to meet.
    const recount = (key: string): string | null => {
      const s = loadSeason(key);
      const members = memberSlugs(s);
      const dates = s.fixtures.fixtures
        .filter(
          (f) =>
            isCountable(f) &&
            f.conference_game !== false &&
            members.has(f.home) &&
            members.has(f.away) &&
            f.status !== "cancelled" &&
            f.date >= s.asOf,
        )
        .map((f) => f.date)
        .sort();
      return dates[0] ?? null;
    };
    const keys = columns.map((c) => c.kickoff ?? "9999-99-99");
    expect([...keys].sort()).toEqual(keys);
    for (const c of columns) expect(c.kickoff).toBe(recount(c.key));
  });

  test("exactly one column wears the imminent purple: the first with a kickoff ahead", () => {
    const first = columns.find((c) => c.kickoff !== null);
    expect(mostImminentKey(columns)).toBe(first ? first.key : null);
    // One key, not a set: two columns can never both claim it.
    const claimants = columns.filter((c) => c.key === mostImminentKey(columns));
    expect(claimants.length).toBeLessThanOrEqual(1);
  });

  test("a column's kickoff is never behind its own collect date", () => {
    for (const c of columns) {
      if (c.kickoff !== null) expect(c.kickoff >= c.season.asOf).toBe(true);
      expect(nextLeagueKickoff(c.season)).toBe(c.kickoff);
    }
  });
});

describe("the ledger holds only played finals — silences never enter it", () => {
  // Every date any conference has fixtures on, not just last night: the
  // invariant is about what the ledger admits, whichever day it draws.
  const allDates = [
    ...new Set(seasons.flatMap((s) => s.fixtures.fixtures.map((f) => f.date))),
  ].sort();

  test("every row is a countable final with a published score", () => {
    for (const date of allDates) {
      for (const row of lastNightLedger(seasons, date)) {
        expect(isScored(row.fixture), `${date}: ${row.fixture.id}`).toBe(true);
        expect(hasScore(row.fixture)).toBe(true);
        expect(isExhibition(row.fixture)).toBe(false);
      }
    }
  });

  test("the row count is the recount of MATCHES on the date, met from the raw list", () => {
    // Matches, not records. A non-conference match between two of these
    // conferences is in both files, and counting the files counts it twice —
    // which is what the ledger did, printing one result as two rows under two
    // codes. The recount folds by the same identity the page must: the day and
    // the two programmes, never the id, which is the collector's own key.
    for (const date of allDates) {
      const recount = new Set(
        seasons.flatMap((s) =>
          s.fixtures.fixtures
            .filter((f) => f.date === date && isScored(f))
            .map((f) => `${f.date} ${[f.home, f.away].sort().join(" v ")}`),
        ),
      );
      expect(lastNightLedger(seasons, date).length, date).toBe(recount.size);
    }
  });

  test("and it goes red if the fold stops folding", () => {
    // The teeth. Somewhere in this season two conferences collected the same
    // scored match; if that ever stops being true this test is measuring
    // nothing, so it says so rather than passing quietly.
    const shared = allDates.flatMap((date) =>
      lastNightLedger(seasons, date).filter((r) => r.sightings.length > 1),
    );
    expect(shared.length, "no cross-conference result in this data to fold").toBeGreaterThan(0);
    for (const row of shared) {
      expect(new Set(row.sightings.map((s) => s.key)).size).toBe(row.sightings.length);
      // Both codes are printed, because both conferences did collect it.
      expect(row.codes.length).toBe(row.sightings.length);
      // And the row resolves to the conference the home side plays in — when
      // there is one. A neutral-site row has no home side to resolve by.
      if (row.neutral) continue;
      expect(memberSlugs(row.season).has(row.fixture.home), row.identity).toBe(true);
    }
  });

  test("a silent final is counted beside the ledger, never inside it", () => {
    for (const date of allDates) {
      const inLedger = new Set(
        lastNightLedger(seasons, date).flatMap((r) => r.sightings.map((s) => s.fixture.id)),
      );
      const open = lastNightOpen(seasons, date);
      for (const s of seasons) {
        for (const f of s.fixtures.fixtures) {
          if (f.date !== date || !isCountable(f)) continue;
          if (isPlayed(f) && !hasScore(f)) {
            expect(inLedger.has(f.id), `${date}: silent final ${f.id} entered the ledger`).toBe(
              false,
            );
            expect(
              open.some((o) => o.sightings.some((x) => x.fixture.id === f.id)),
              `${date}: silent final ${f.id} not open`,
            ).toBe(true);
          }
        }
      }
      // Open and ledger never overlap: a fixture is played or open, not both.
      for (const o of open) {
        for (const x of o.sightings) expect(inLedger.has(x.fixture.id)).toBe(false);
      }
    }
  });

  test("a scored exhibition still stays out — the Saint Mary's trap, again", () => {
    // Friendlies with published scores exist in the data; the ledger must
    // refuse them the way every record on the site does.
    const scoredExhibitions = seasons.flatMap((s) =>
      s.fixtures.fixtures.filter((f) => isExhibition(f) && hasScore(f)),
    );
    expect(scoredExhibitions.length, "the trap is gone from the data").toBeGreaterThan(0);
    for (const f of scoredExhibitions) {
      const rows = lastNightLedger(seasons, f.date);
      expect(
        rows.some((r) => r.sightings.some((x) => x.fixture.id === f.id)),
        f.id,
      ).toBe(false);
      expect(
        lastNightOpen(seasons, f.date).some((o) => o.sightings.some((x) => x.fixture.id === f.id)),
        f.id,
      ).toBe(false);
    }
  });

  test("last night is the day before the national asOf, and the ledger stays on it", () => {
    const asOf = nationalAsOf(seasons);
    const lastNight = lastNightOf(asOf);
    expect(daysBetween(lastNight, asOf)).toBe(1);
    for (const row of lastNightLedger(seasons, lastNight)) {
      expect(row.fixture.date).toBe(lastNight);
    }
  });
});

describe("every count survives being written out as a list", () => {
  test("each column's counts are the season page's counts, recounted from the fixtures", () => {
    for (const c of columns) {
      const s = loadSeason(c.key);
      // The same function the season masthead calls…
      expect(c.counts).toEqual(seasonCounts(s));
      // …and the recount from the raw fixture list, so both surfaces meet it.
      expect(c.counts.played, c.key).toBe(s.fixtures.fixtures.filter(isScored).length);
      expect(c.counts.total, c.key).toBe(s.fixtures.fixtures.filter(isCountable).length);
      expect(c.counts.silentFinals, c.key).toBe(
        s.fixtures.fixtures.filter((f) => isCountable(f) && isPlayed(f) && !hasScore(f)).length,
      );
      expect(c.exhibitions, c.key).toBe(s.fixtures.fixtures.filter(isExhibition).length);
      expect(c.counts.total + c.exhibitions, c.key).toBe(s.fixtures.fixtures.length);
    }
  });

  test("the national figures are the column figures less what they hold twice", () => {
    // They used to be the plain sum, and the plain sum counted a match between
    // two of these conferences once for each file it is in. Every figure now
    // carries its own duplicate term, and every one of them reconciles.
    const sum = (pick: (c: HomeColumn) => number): number =>
      columns.reduce((n, c) => n + pick(c), 0);
    expect(national.played).toBe(sum((c) => c.counts.played) - national.duplicated.played);
    expect(national.total).toBe(sum((c) => c.counts.total) - national.duplicated.total);
    expect(national.silentFinals).toBe(
      sum((c) => c.counts.silentFinals) - national.duplicated.silentFinals,
    );
    expect(national.gaps).toBe(sum((c) => c.counts.gaps) - national.duplicated.gaps);
    expect(national.exhibitions).toBe(sum((c) => c.exhibitions) - national.duplicated.exhibitions);
  });
});

describe("the masthead is derived, deterministically, from counts and opener dates", () => {
  const asOf = nationalAsOf(seasons);
  const lede = nationalLede(columns, asOf, national);

  test("the kicker is the scope and the national collect date", () => {
    expect(lede.kicker).toBe(
      `${site.division} · ${dowShort(asOf)} ${shortDate(asOf)}`.toUpperCase(),
    );
    // It is the only place on this page that names the division: the row that
    // used to say it a second time is gone, and so is the footer's scope
    // token. Nothing else here says it, so this test is the whole promise.
    expect(lede.kicker).toContain(site.division.toUpperCase());
  });

  test("a journal's headline loses its trailing full stop; the dek keeps its own", () => {
    const journal = {
      headline: "Midwestern State lead the division on goals.",
      dek: "They have eleven. The nearest side has eight.",
    } as NationalJournalFile;
    const mast = nationalMasthead(columns, asOf, national, journal);
    expect(mast.headline).toBe("Midwestern State lead the division on goals");
    expect(mast.dek).toBe("They have eleven. The nearest side has eight.");
  });

  test("the stamp prints only when the headline is older than the dateline", () => {
    const fresh = { headline: "Fresh today", updated: asOf } as NationalJournalFile;
    expect(nationalMasthead(columns, asOf, national, fresh).stamp).toBe(null);
    const standing = { headline: "Standing", updated: "2026-08-27" } as NationalJournalFile;
    expect(nationalMasthead(columns, asOf, national, standing).stamp).toBe("UPDATED AUG 27");
  });

  test("no headline is manufactured — the floor writes none", () => {
    // The one altitude nothing derives. A count and an opener date make a
    // fact, never a story, and an empty headline is a truer page than one
    // dressing the cards' own figures up as one.
    expect(lede.headline).toBeNull();
  });

  test("the dek is the openers, in the order they open", () => {
    const upcoming = columns.filter((c) => !c.live && c.opensOn !== null);
    const first = upcoming[0];
    if (!first?.opensOn) {
      // Every conference under way: the floor has nothing at this altitude
      // and says nothing, rather than reaching for something to fill it.
      expect(lede.dek).toBeNull();
      return;
    }
    expect(lede.dek).toContain(`first in the ${first.name} on ${shortDate(first.opensOn)}`);
    // Named in kickoff order, which is the column order — so the sentence and
    // the row of cards beneath it cannot disagree about who is first.
    const positions = upcoming
      .filter((c) => c.opensOn)
      .map((c) => (lede.dek as string).indexOf(c.name));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((p) => p >= 0)).toBe(true);
  });

  test("the strip states the division's figures, in cells", () => {
    expect(lede.strip).toEqual([`${national.played} OF ${national.total} PLAYED`]);
  });

  test("the strip does not count the silences — by ruling, not by accident", () => {
    // The owner's ruling (Sep 1): what the division is missing is not this
    // page's lead information. So the strip must read the same whatever the
    // silent-final count is — a cell that appeared only on a bad collect
    // would be the old doctrine sneaking back as a conditional. The count
    // still lives where it is content: each season page's accounting, and
    // the description this page publishes to card-less surfaces.
    const clean = nationalLede(columns, asOf, { ...national, silentFinals: 0 });
    const five = nationalLede(columns, asOf, { ...national, silentFinals: 5 });
    expect(clean.strip).toEqual(five.strip);
    expect(lede.strip.join(" ")).not.toContain("SILENT");
  });

  test("the same inputs produce the same parts — no model call anywhere in it", () => {
    expect(nationalLede(columns, asOf, national)).toEqual(lede);
    expect(nationalLede(columns, asOf, divisionCounts(seasons))).toEqual(lede);
  });

  test("the description keeps the prose the masthead stopped printing", () => {
    // The share card and the search result have no cards and no strip beneath
    // them. Every figure the page split across altitudes has to survive as one
    // paragraph for the surfaces that get nothing else.
    const text = nationalDescription(columns, national);
    expect(text).toContain(`${national.played} of ${national.total} matches played`);
    expect(text).toContain(`across ${spell(columns.length)} conferences`);
    // The score-gap sentence, in whichever form the count takes. Zero is the
    // usual form now: the collector stores a scoreless final as scheduled
    // (rib #85), so a silent final reaches the division only from an older
    // file, and a test pinned to the plural form was pinned to the data.
    expect(text).toContain(
      national.silentFinals === 0
        ? "No score gap stands: every final carries a published score."
        : "without a published score.",
    );
  });
});

/**
 * The reconciliation the page does not print.
 *
 * Nothing on the national page lays the division's figures out as addends for
 * a reader to check by hand. The obligation stands anyway, and it has three
 * terms rather than two now:
 *
 *     sum of the columns  −  the records they hold twice  =  the division
 *
 * The middle term is why. A match between two of these conferences is in both
 * files, so any sum of their counts holds it twice, and "48 of 363 matches
 * played" was published for as long as nobody subtracted it (tui-2l6). Each
 * column's own figure is still exactly its season page's, and still right.
 *
 * So this reads the figures back out of the two surfaces that publish them —
 * the masthead strip a reader meets and the description a share card meets —
 * and compares them against a sum recounted from the fixtures MINUS a
 * duplicate count recounted from the folded matches. Neither comes from
 * divisionCounts(), which is the thing under test and could only ever agree
 * with itself. Each check has a matching test that perturbs an input and
 * proves it goes red, because a reconciliation that cannot fail is a comment.
 */
describe("the reconciliation the page stopped printing", () => {
  const NUMBER = new Map<string, number>();
  for (let n = 0; n <= 40; n++) NUMBER.set(spell(n), n);

  const asOf = nationalAsOf(seasons);
  const sum = (pick: (c: HomeColumn) => number): number => columns.reduce((n, c) => n + pick(c), 0);

  /** What the columns carried under a figure that the folded set does not,
   *  recounted from the FOLDED matches rather than from divisionCounts: every
   *  record whose own row meets the figure's definition, less the one the
   *  folded match counts if its canonical row meets it. The canonical row is
   *  the fold's choice (posted record first, home side as the tiebreak), and
   *  it decides the match type as it decides the score: the 2026 Lander
   *  pre-season pair is an exhibition in PBC's posted record and a scheduled
   *  league fixture in CC's and SAC's, so its CC and SAC rows are extra
   *  total records and no exhibition record is extra. Counted as EXTRA
   *  records rather than as shared matches, so it stays right if one ever
   *  reaches three files. */
  function duplicatedRecords(admit: (f: Fixture) => boolean): number {
    let extra = 0;
    for (const m of foldToMatches(allSightings(seasons))) {
      extra += m.sightings.filter((s) => admit(s.fixture)).length - (admit(m.fixture) ? 1 : 0);
    }
    return extra;
  }

  /** A gap is the collector's, not the row's: it folds by the match it
   *  belongs to, and every record of that match past the first is extra. */
  function duplicatedGapRecords(): number {
    const groups = new Map<string, number>();
    for (const c of columns) {
      for (const g of boxScoreGaps(loadSeason(c.key))) {
        const f = g.fixture;
        const id = f
          ? `${f.date} ${[f.home, f.away].sort().join(" v ")}`
          : `?${c.key}:${g.fixtureId}`;
        groups.set(id, (groups.get(id) ?? 0) + 1);
      }
    }
    let extra = 0;
    for (const n of groups.values()) extra += n - 1;
    return extra;
  }

  const isSilentFinal = (f: Fixture): boolean => isCountable(f) && isPlayed(f) && !hasScore(f);

  /** The division's figures, recounted from the files the long way round. */
  const fromFixtures = {
    played: (): number => sum((c) => c.counts.played) - duplicatedRecords(isScored),
    total: (): number => sum((c) => c.counts.total) - duplicatedRecords(isCountable),
    silentFinals: (): number =>
      sum((c) => c.counts.silentFinals) - duplicatedRecords(isSilentFinal),
  };

  /** A strip cell, found by what it says rather than by where it sits: the
   *  order of the row is a design decision and this is not a test of it. */
  function cell(strip: readonly string[], re: RegExp): RegExpExecArray | null {
    for (const c of strip) {
      const m = re.exec(c);
      if (m) return m;
    }
    return null;
  }

  /** Every way the strip and the files can disagree. Empty is the only passing
   *  answer; each entry says which figure parted company. */
  function stripDisagreements(lede: NationalLede, played: number, total: number): string[] {
    const out: string[] = [];
    const m = cell(lede.strip, /^(\d+) OF (\d+) PLAYED$/);
    if (!m) {
      out.push("the strip does not state played of total at all");
      return out;
    }
    if (Number(m[1]) !== played) out.push(`played: strip ${m[1]}, files ${played}`);
    if (Number(m[2]) !== total) out.push(`total: strip ${m[2]}, files ${total}`);
    return out;
  }

  /** The same, for the paragraph the description publishes. It states one
   *  figure the strip does not — how many conferences were folded together —
   *  so the two surfaces are checked separately rather than one standing in
   *  for both. */
  function descriptionDisagreements(text: string, played: number, total: number): string[] {
    const out: string[] = [];
    const m = /(\d+) of (\d+) matches played across ([a-z]+) (conference|conferences)\./.exec(text);
    if (!m) {
      out.push("the description does not state played of total at all");
      return out;
    }
    if (Number(m[1]) !== played) out.push(`played: description ${m[1]}, files ${played}`);
    if (Number(m[2]) !== total) out.push(`total: description ${m[2]}, files ${total}`);
    if (NUMBER.get(m[3] as string) !== columns.length) {
      out.push(`conferences: description ${m[3]}, columns ${columns.length}`);
    }
    return out;
  }

  function silentInDescription(text: string): number | null {
    if (text.includes("No score gap stands: every final carries a published score.")) return 0;
    const some =
      /(\w+) score (?:gap stands, a final|gaps stand, finals) without a published score\./.exec(
        text,
      );
    const spelled = NUMBER.get((some?.[1] ?? "").toLowerCase());
    return spelled === undefined ? null : spelled;
  }

  test("the strip's played of total is the columns' figures, less what they hold twice", () => {
    expect(
      stripDisagreements(
        nationalLede(columns, asOf, national),
        fromFixtures.played(),
        fromFixtures.total(),
      ),
    ).toEqual([]);
  });

  test("and the description's is too, conference count included", () => {
    expect(
      descriptionDisagreements(
        nationalDescription(columns, national),
        fromFixtures.played(),
        fromFixtures.total(),
      ),
    ).toEqual([]);
  });

  test("the middle term is not zero — the subtraction is doing work", () => {
    // Without this, a fold that stopped folding would pass every check above
    // by agreeing with a sum that had nothing to subtract. Recounted from the
    // files, not from divisionCounts.
    expect(duplicatedRecords(isCountable), "no shared match in this data").toBeGreaterThan(0);
    expect(duplicatedRecords(isScored), "no shared result in this data").toBeGreaterThan(0);
    expect(fromFixtures.total()).toBeLessThan(sum((c) => c.counts.total));
    expect(fromFixtures.played()).toBeLessThan(sum((c) => c.counts.played));
  });

  test("and every figure the division prints folds, whether or not it needs to today", () => {
    // Structural, not conditional. Silences and gaps have no duplicate on this
    // collect, and the day one appears the figure must already be right rather
    // than needing a second fix.
    expect(national.silentFinals).toBe(fromFixtures.silentFinals());
    expect(national.gaps).toBe(sum((c) => c.counts.gaps) - duplicatedGapRecords());
    expect(national.exhibitions).toBe(sum((c) => c.exhibitions) - duplicatedRecords(isExhibition));
    // And the figures' own duplicate terms are the ones recounted here.
    expect(national.duplicated.total).toBe(duplicatedRecords(isCountable));
    expect(national.duplicated.played).toBe(duplicatedRecords(isScored));
    expect(national.duplicated.silentFinals).toBe(duplicatedRecords(isSilentFinal));
    expect(national.duplicated.exhibitions).toBe(duplicatedRecords(isExhibition));
  });

  test("and the columns are the linked season pages, recounted from the fixtures", () => {
    // The other half of the promise: each addend equals what its own season
    // page shows, so subtracting from their sum is worth something.
    for (const c of columns) {
      const s = loadSeason(c.key);
      expect(c.counts, c.key).toEqual(seasonCounts(s));
      expect(c.counts.gaps, c.key).toBe(boxScoreGaps(s).length);
    }
  });

  test("the description's silences are the fixtures' silences, recounted", () => {
    // The strip stopped counting them (owner's ruling); the description is
    // now the division's one silence surface, so it alone answers for the
    // figure being the folded one rather than a sum.
    expect(silentInDescription(nationalDescription(columns, national))).toBe(
      fromFixtures.silentFinals(),
    );
  });

  test("and it goes red when the silences drift from the files", () => {
    const drift = { ...national, silentFinals: national.silentFinals + 2 };
    expect(silentInDescription(nationalDescription(columns, drift))).not.toBe(
      fromFixtures.silentFinals(),
    );
    // And the sentence must be there at all: a description that stopped
    // stating the count would otherwise pass a comparison it never took part
    // in. (The strip did stop, deliberately — which is exactly why this
    // check now stands on the one surface left.)
    expect(silentInDescription(nationalDescription(columns, national))).not.toBeNull();
  });

  test("it goes red when a division figure moves", () => {
    // The teeth. Perturb the figures the masthead is built from and the
    // recount must name the one that parted company.
    const played = fromFixtures.played();
    const total = fromFixtures.total();
    const moved = { ...national, played: national.played + 1 };
    expect(
      stripDisagreements(nationalLede(columns, asOf, moved), played, total).join(" "),
    ).toContain("played:");
    expect(
      descriptionDisagreements(nationalDescription(columns, moved), played, total).join(" "),
    ).toContain("played:");

    const larger = { ...national, total: national.total + 3 };
    expect(
      stripDisagreements(nationalLede(columns, asOf, larger), played, total).join(" "),
    ).toContain("total:");
    expect(
      descriptionDisagreements(nationalDescription(columns, larger), played, total).join(" "),
    ).toContain("total:");
  });

  test("and it goes red if the fold stops folding at all", () => {
    // The failure the middle term exists to catch: a division figure that is
    // the raw sum again. Neither surface may agree with it.
    const unfolded = {
      ...national,
      played: sum((c) => c.counts.played),
      total: sum((c) => c.counts.total),
    };
    expect(
      stripDisagreements(
        nationalLede(columns, asOf, unfolded),
        fromFixtures.played(),
        fromFixtures.total(),
      ),
    ).not.toEqual([]);
  });
});

describe("the map's places and its members with no dot", () => {
  test("the places line counts states, and provinces only when a point names one", () => {
    expect(placesLine(["CA", "OR"], [])).toBe("2 STATES");
    expect(placesLine(["CA"], [])).toBe("1 STATE");
    expect(placesLine(["CA", "OR"], ["B.C."])).toBe("2 STATES AND ONE PROVINCE");
    expect(placesLine(["CA"], ["B.C.", "ON"])).toBe("1 STATE AND TWO PROVINCES");
  });

  test("a member off the frame is named as off the map; no town on file is reserved for a member with no point", () => {
    const off = { slug: "x-hilo", name: "Hilo Synthetic", reason: "off-frame" as const };
    const off2 = { slug: "x-hon", name: "Honolulu Synthetic", reason: "off-frame" as const };
    const none = { slug: "x-none", name: "Nowhere Synthetic", reason: "no-point" as const };
    expect(unplacedLines([off])).toEqual([
      "Hilo Synthetic is off this map: its town lies outside the frame it draws.",
    ]);
    expect(unplacedLines([none])).toEqual([
      "Nowhere Synthetic has no town on file, and is not drawn.",
    ]);
    expect(unplacedLines([off, none, off2])).toEqual([
      "Hilo Synthetic and Honolulu Synthetic are off this map: their towns lie outside the frame it draws.",
      "Nowhere Synthetic has no town on file, and is not drawn.",
    ]);
    expect(unplacedLines([])).toEqual([]);
    // The one wording never describes the other kind.
    expect(unplacedLines([off]).join(" ")).not.toContain("no town on file");
    expect(unplacedLines([none]).join(" ")).not.toContain("off this map");
  });

  test("the live map's footer says states and one province, and names Hawaii as off the map", () => {
    const footprints = seasons.map((s) =>
      footprintOf(
        s.key,
        s.fixtures.conference,
        s.key,
        s.fixtures.programmes.map((p) => ({ slug: p.slug, name: p.name })),
      ),
    );
    const view = mapView(footprints, null);
    expect(view.footer).toBe(
      `${view.placed} PROGRAMMES · ${placesLine(view.states, view.provinces)}`,
    );
    if (view.provinces.length > 0) expect(view.footer).toMatch(/ AND (ONE|TWO|\w+) PROVINCES?$/);
    for (const u of view.unplaced) expect(["off-frame", "no-point"]).toContain(u.reason);
  });
});
