/**
 * The vocabulary, against the real data home.
 *
 * These are the definitions three published journals rested on, and every one
 * of them was wrong at some point in this repo's history: exhibitions counted
 * as record, silent finals counted as played, opponents linked to conferences
 * they do not belong to. They are cheap to assert and expensive to get wrong.
 */

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import {
  aboutHref,
  boxScoreGaps,
  conferenceOpensOn,
  exhibitionsOf,
  fixtureCount,
  hasScore,
  homeHref,
  isCountable,
  isExhibition,
  isScored,
  loadSeason,
  matchDetailOf,
  matchesHref,
  matchHref,
  matchweeks,
  playedCount,
  programmeCounts,
  recordOf,
  scoredCount,
  seasonCounts,
  seasonHref,
  seasonWindow,
  table,
  tableIsLive,
  teamHref,
  teamPageHref,
  unresolved,
} from "./derive.ts";
import { dayNumber, daysBetween, dowIndex, monShort, toISO } from "./format.ts";
import type { Fixture } from "./model.ts";
import { computeTable, isPlayed } from "./model.ts";

const CONFERENCES = ["gac", "lsc", "gsc"] as const;
const seasons = CONFERENCES.map((key) => ({ key, season: loadSeason(key) }));

describe("exhibitions are outside the record", () => {
  test("every conference publishes some, and none of them count", () => {
    for (const { key, season } of seasons) {
      const exhibitions = exhibitionsOf(season);
      expect(exhibitions.length, `${key} should carry exhibitions`).toBeGreaterThan(0);
      for (const f of exhibitions) {
        expect(isCountable(f)).toBe(false);
        expect(isScored(f), `${key}: ${f.id} must not score`).toBe(false);
      }
    }
  });

  test("a scored exhibition still contributes nothing to a record", () => {
    // Saint Mary's played friendlies with published scores — a 3-0 win over a
    // club side and a 1-2 loss. Counting them read 2-0-2 with 5 goals for a
    // side that had scored none.
    //
    // Nothing here is pinned to a snapshot: a collect lands daily, and a test
    // that asserts "played is 2" starts failing the week they play a third.
    // The trap is asserted to still exist, then the record is recounted from
    // the fixtures and the two answers have to meet.
    const lsc = loadSeason("lsc");
    const ours = (f: Fixture) => f.home === "saint-marys" || f.away === "saint-marys";
    const goalsFor = (f: Fixture) =>
      f.home === "saint-marys" ? (f.home_score as number) : (f.away_score as number);

    const friendlies = lsc.fixtures.fixtures.filter(
      (f) => isExhibition(f) && hasScore(f) && ours(f),
    );
    expect(friendlies.length, "the trap is gone from the data").toBeGreaterThan(0);
    expect(friendlies.reduce((n, f) => n + goalsFor(f), 0)).toBeGreaterThan(0);

    const counted = lsc.fixtures.fixtures.filter((f) => isScored(f) && hasScore(f) && ours(f));
    const record = recordOf(lsc, "saint-marys");
    expect(record.played).toBe(counted.length);
    expect(record.goalsFor).toBe(counted.reduce((n, f) => n + goalsFor(f), 0));
  });

  test("a friendly with no score is not a conference silence", () => {
    for (const { key, season } of seasons) {
      const silence = unresolved(season);
      for (const f of [...silence.finalsWithoutScore, ...silence.pastDateNoResult]) {
        expect(isExhibition(f), `${key}: ${f.id} is an exhibition, not a silence`).toBe(false);
      }
    }
  });

  test("the totals exclude them", () => {
    for (const { season } of seasons) {
      expect(fixtureCount(season) + exhibitionsOf(season).length).toBe(
        season.fixtures.fixtures.length,
      );
    }
  });
});

describe("played means a final with a published score", () => {
  test("the played count is the scored count, never the status-final count", () => {
    for (const { key, season } of seasons) {
      const counts = seasonCounts(season);
      expect(counts.played, `${key}`).toBe(scoredCount(season));
    }
  });

  test("a silent final is counted beside the played figure, never inside it", () => {
    for (const { key, season } of seasons) {
      const counts = seasonCounts(season);
      // Every countable final is either played or silent, and never both.
      const finals = season.fixtures.fixtures.filter((f) => isCountable(f) && isPlayed(f));
      expect(counts.played + counts.silentFinals, `${key}`).toBe(finals.length);
      expect(playedCount(season), `${key}`).toBe(finals.length);
    }
  });

  test("a programme's own counts sum the same way", () => {
    for (const { key, season } of seasons) {
      for (const p of season.fixtures.programmes) {
        const c = programmeCounts(season, p.slug);
        expect(c.played + c.silentFinals, `${key}/${p.slug}`).toBeLessThanOrEqual(c.total);
        expect(c.played, `${key}/${p.slug}`).toBe(recordOf(season, p.slug).played);
      }
    }
  });

  test("the gap count is the collector's own missing list", () => {
    for (const { season } of seasons) {
      expect(seasonCounts(season).gaps).toBe(boxScoreGaps(season).length);
    }
  });

  test("a gap is a result without a detail, and nothing else", () => {
    // The collector's `missing` map also holds exhibitions it skipped and
    // finals that never carried a score. Counting those here would put the
    // same fixture in the coverage line twice — once as a silent final and
    // again as a gap — and make the site look blinder than it is.
    for (const { key, season } of seasons) {
      const gaps = boxScoreGaps(season);
      for (const g of gaps) {
        expect(g.fixture, `${key}: ${g.fixtureId} has no fixture`).toBeDefined();
        expect(isScored(g.fixture as Fixture), `${key}: ${g.label} is not a result`).toBe(true);
        expect(isExhibition(g.fixture as Fixture), `${key}: ${g.label} is an exhibition`).toBe(
          false,
        );
      }
      // Recomputed the other way: results, less those a box score was collected for.
      const scored = season.fixtures.fixtures.filter(isScored);
      const withDetail = scored.filter((f) => matchDetailOf(season, f.id));
      expect(gaps.length, `${key}`).toBe(scored.length - withDetail.length);
    }
  });

  test("no fixture is counted as both a silent final and a gap", () => {
    for (const { key, season } of seasons) {
      const gapIds = new Set(boxScoreGaps(season).map((g) => g.fixtureId));
      for (const f of unresolved(season).finalsWithoutScore) {
        expect(gapIds.has(f.id), `${key}: ${f.id} counted twice`).toBe(false);
      }
    }
  });
});

describe("opponents link only where a page exists", () => {
  test("a member resolves to its own conference", () => {
    for (const { key, season } of seasons) {
      for (const p of season.fixtures.programmes) {
        expect(teamPageHref(season, p.slug)).toContain(`/${key}/team/${p.slug}/`);
      }
    }
  });

  test("a member of another configured conference resolves cross-conference", () => {
    // UT Tyler appears in GAC fixtures and its team page lives in the LSC.
    const gac = loadSeason("gac");
    expect(teamPageHref(gac, "ut-tyler")).toContain("/lsc/team/ut-tyler/");
  });

  test("a programme in no configured conference gets no link at all", () => {
    // Ecclesia appears in a GAC match report and has a page nowhere.
    const gac = loadSeason("gac");
    expect(teamPageHref(gac, "ecclesia")).toBeNull();
  });

  test("every opponent named anywhere either resolves or is deliberately null", () => {
    for (const { season } of seasons) {
      for (const f of season.fixtures.fixtures) {
        for (const side of [f.home, f.away]) {
          const href = teamPageHref(season, side);
          if (href !== null) expect(href).toMatch(/^\/?[a-z/-]*\/team\/[a-z0-9-]+\/$/);
        }
      }
    }
  });
});

describe("the honesty states stay distinct", () => {
  test("no fixture is both a silent final and a past date with no result", () => {
    for (const { key, season } of seasons) {
      const u = unresolved(season);
      const finals = new Set(u.finalsWithoutScore.map((f) => f.id));
      for (const f of u.pastDateNoResult) {
        expect(finals.has(f.id), `${key}: ${f.id} in both silences`).toBe(false);
      }
      expect(u.total).toBe(u.finalsWithoutScore.length + u.pastDateNoResult.length);
    }
  });

  test("a silent final is final and scoreless; a scored fixture is neither", () => {
    for (const { season } of seasons) {
      for (const f of unresolved(season).finalsWithoutScore) {
        expect(isPlayed(f)).toBe(true);
        expect(hasScore(f)).toBe(false);
      }
    }
  });
});

describe("the table counts conference football and nothing else", () => {
  test("the standings and the fixture list agree on who has played what", () => {
    // Double entry: the table is built by walking fixtures once, so count them
    // again independently and make the two answers meet.
    for (const { key, season } of seasons) {
      const members = new Set(season.fixtures.programmes.map((p) => p.slug));
      const counted = new Map<string, number>();
      for (const f of season.fixtures.fixtures) {
        if (!isScored(f) || !hasScore(f)) continue;
        if (f.conference_game === false) continue;
        if (!members.has(f.home) || !members.has(f.away)) continue;
        counted.set(f.home, (counted.get(f.home) ?? 0) + 1);
        counted.set(f.away, (counted.get(f.away) ?? 0) + 1);
      }
      for (const row of table(season)) {
        expect(row.played, `${key}: ${row.slug}`).toBe(counted.get(row.slug) ?? 0);
      }
    }
  });

  test("the table is live exactly when a conference fixture has been played", () => {
    for (const { key, season } of seasons) {
      const members = new Set(season.fixtures.programmes.map((p) => p.slug));
      const anyPlayed = season.fixtures.fixtures.some(
        (f) =>
          isScored(f) && f.conference_game !== false && members.has(f.home) && members.has(f.away),
      );
      expect(tableIsLive(season), key).toBe(anyPlayed);
    }
  });

  test("a live table has opened, and opening day is not in the future", () => {
    for (const { key, season } of seasons) {
      if (!tableIsLive(season)) continue;
      const opens = conferenceOpensOn(season);
      expect(opens, key).not.toBeNull();
      expect((opens as string) <= season.asOf, `${key}: opens ${opens} after ${season.asOf}`).toBe(
        true,
      );
    }
  });

  test("an unflagged friendly between two members takes no conference points", () => {
    // Every exhibition the 2026 collect carries also says conference_game:
    // false, so the real data cannot prove this guard exists. Construct the
    // fixture the collector has not published yet.
    const gac = loadSeason("gac");
    const [a, b] = gac.fixtures.programmes;
    const friendly = {
      ...(gac.fixtures.fixtures.find((f) => hasScore(f)) as Fixture),
      id: "test:unflagged-friendly",
      home: (a as { slug: string }).slug,
      away: (b as { slug: string }).slug,
      status: "final" as const,
      home_score: 4,
      away_score: 0,
      match_type: "exhibition" as const,
      conference_game: undefined,
    };
    const withIt = computeTable({
      ...gac.fixtures,
      fixtures: [...gac.fixtures.fixtures, friendly],
    });
    const before = new Map(table(gac).map((r) => [r.slug, r.played]));
    for (const row of withIt) expect(row.played, row.slug).toBe(before.get(row.slug) ?? 0);
  });
});

describe("matchweeks lose nothing and start on Sundays", () => {
  test("every week begins on a Sunday, the college convention", () => {
    for (const { key, season } of seasons) {
      for (const w of matchweeks(season)) {
        expect(dowIndex(w.startISO), `${key}: week ${w.index} starts ${w.startISO}`).toBe(0);
      }
    }
  });

  test("every fixture lands in exactly one week, inside that week's seven days", () => {
    for (const { key, season } of seasons) {
      const weeks = matchweeks(season);
      const seen = new Set<string>();
      for (const w of weeks) {
        for (const f of w.fixtures) {
          expect(seen.has(f.id), `${key}: ${f.id} in two weeks`).toBe(false);
          seen.add(f.id);
          const offset = daysBetween(w.startISO, f.date);
          expect(offset >= 0 && offset <= 6, `${key}: ${f.date} in week of ${w.startISO}`).toBe(
            true,
          );
        }
      }
      expect(seen.size, key).toBe(season.fixtures.fixtures.length);
    }
  });

  test("weeks are numbered from one, in date order, with at most one current", () => {
    for (const { key, season } of seasons) {
      const weeks = matchweeks(season);
      expect(
        weeks.map((w) => w.index),
        key,
      ).toEqual(weeks.map((_, i) => i + 1));
      for (let i = 1; i < weeks.length; i++) {
        expect(
          (weeks[i] as { startISO: string }).startISO >
            (weeks[i - 1] as { startISO: string }).startISO,
          key,
        ).toBe(true);
      }
      expect(weeks.filter((w) => w.state === "current").length, key).toBeLessThanOrEqual(1);
      // Past and future are measured against the START of the week asOf falls
      // in, not against asOf itself: a fixture on Tuesday is not "past"
      // because the collect ran on Thursday.
      const now = toISO(dayNumber(season.asOf) - dowIndex(season.asOf));
      for (const w of weeks) {
        const where = `${key}: week of ${w.startISO} against ${now}`;
        if (w.state === "past") expect(w.startISO < now, where).toBe(true);
        if (w.state === "current") expect(w.startISO, where).toBe(now);
        if (w.state === "future") expect(w.startISO > now, where).toBe(true);
      }
    }
  });

  test("a week straddling a month belongs to the month of its first fixture", () => {
    for (const { key, season } of seasons) {
      for (const w of matchweeks(season)) {
        const first = w.fixtures[0] as Fixture;
        expect(w.month, `${key}: week of ${w.startISO}`).toBe(monShort(first.date).toUpperCase());
      }
    }
  });

  test("the season window agrees with the weeks it summarises", () => {
    for (const { key, season } of seasons) {
      const weeks = matchweeks(season);
      const win = seasonWindow(season);
      expect(win.weekCount, key).toBe(weeks.length);
      const current = weeks.find((w) => w.state === "current");
      expect(win.weekIndex, key).toBe(current?.index ?? null);
      const dates = season.fixtures.fixtures.map((f) => f.date).sort();
      expect(win.firstISO, key).toBe(dates[0] as string);
      expect(win.lastISO, key).toBe(dates[dates.length - 1] as string);
    }
  });
});

describe("where a link points", () => {
  // The wordmark bug this guards: it linked to whichever conference the reader
  // was already inside, so from a conference page it went nowhere. The home is
  // the site ROOT, and the root is the prefix every other href is built on —
  // an invariant that holds whether the site serves from a domain root or from
  // a project page at /<repo>/, which is why it is asserted this way and not
  // against a literal string.
  test("the home href is the root every other href hangs off", () => {
    const home = homeHref();
    expect(home.endsWith("/")).toBe(true);
    for (const href of [
      aboutHref(),
      seasonHref("gac"),
      matchesHref("gac"),
      teamHref("gac", "harding"),
      matchHref("gac", "sidearm:harding:15273"),
    ]) {
      expect(href.startsWith(home), href).toBe(true);
      // and none of them IS the home: the root belongs to the national page
      expect(href).not.toBe(home);
    }
  });

  test("a conference href is not the home href", () => {
    // The regression itself, stated plainly.
    for (const key of site.conferences) expect(seasonHref(key)).not.toBe(homeHref());
  });
});
