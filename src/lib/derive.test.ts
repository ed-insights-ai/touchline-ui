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
import type { Season } from "./derive.ts";
import {
  aboutHref,
  boxScoreGaps,
  collectionLine,
  conferenceOpensOn,
  DISPUTED_MARK,
  disputedIdentities,
  exhibitionsOf,
  FORFEIT_MARK,
  fixtureCount,
  goalsForByProgramme,
  hasScore,
  homeHref,
  isCountable,
  isCounted,
  isExhibition,
  isScored,
  loadSeason,
  markOf,
  matchDetailOf,
  matchesHref,
  matchHref,
  matchIdentity,
  matchweeks,
  memberSlugs,
  outsideRecord,
  overallTable,
  playedCount,
  programmeCounts,
  recordOf,
  resultFor,
  resultsOf,
  scoredCount,
  seasonCounts,
  seasonHref,
  seasonWindow,
  squadOf,
  table,
  tableIsLive,
  teamHref,
  teamPageHref,
  unresolved,
} from "./derive.ts";
import { dayNumber, daysBetween, dowIndex, friendlies, monShort, toISO } from "./format.ts";
import type { Fixture, FixturesFile } from "./model.ts";
import { computeTable, isPlayed } from "./model.ts";
import { nameBookFor } from "./names.ts";
import { playerCard } from "./player.ts";

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

describe("the reader's word for one is friendly", () => {
  test("the noun agrees with its number, and is never friendlys", () => {
    expect(friendlies(1)).toBe("friendly");
    for (const n of [0, 2, 3, 11, 186]) expect(friendlies(n), String(n)).toBe("friendlies");
    // The singular does not appear in today's data — every programme that
    // played one played two — so it is asserted here rather than left to a
    // collect to expose.
  });

  test("no sentence this site composes says exhibition", () => {
    // The word survives in match_type, and only there. Three surfaces print
    // this noun: the player sheet's log note, the national counts, and the
    // Matches rail. The first is composed in code and is checked directly;
    // the other two read the same helper.
    let checked = 0;
    for (const key of site.conferences) {
      const season = loadSeason(key);
      for (const slug of Object.keys(season.rosters?.rosters ?? {})) {
        for (const m of squadOf(season, slug)) {
          const card = playerCard(season, slug, m.player, m.stats, m.keeper);
          if (card.exhibitions === null) continue;
          checked++;
          expect(card.exhibitions, `${slug}: ${m.player.name}`).not.toMatch(/exhibition/i);
          expect(card.exhibitions).toMatch(/^\+ \d+ (friendly|friendlies), /);
          const n = Number(/^\+ (\d+) /.exec(card.exhibitions)?.[1]);
          expect(card.exhibitions.includes("friendlies")).toBe(n !== 1);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  test("the count the word describes is still the collector's exhibitions", () => {
    // Renaming the noun must not have moved what it counts.
    for (const key of site.conferences) {
      const season = loadSeason(key);
      const named = exhibitionsOf(season);
      expect(named.every(isExhibition)).toBe(true);
      expect(named.every((f) => !isCountable(f))).toBe(true);
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

describe("matchweeks lose nothing and start on Mondays", () => {
  test("every week begins on a Monday, the docket's week", () => {
    for (const { key, season } of seasons) {
      for (const w of matchweeks(season)) {
        expect(dowIndex(w.startISO), `${key}: week ${w.index} starts ${w.startISO}`).toBe(1);
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
      const now = toISO(dayNumber(season.asOf) - ((dowIndex(season.asOf) + 6) % 7));
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
describe("the footer says when the site last looked", () => {
  // collectionLine reads one field, so the cases that cannot be produced on
  // demand from the real files — conferences collected on different days —
  // are stated here directly. The last test holds the shape to the data home.
  const stamped = (code: string, collectedAt: string): Season =>
    ({ collectedAt, fixtures: { conference: code } }) as unknown as Season;

  test("one conference is a whole sentence, and wears no code", () => {
    // A conference page is the conference; naming it in its own footer says
    // nothing the masthead has not already said twice.
    expect(collectionLine([stamped("GAC", "2026-08-31T02:48:11Z")])).toBe(
      "Data collected Aug 31, 2026, 02:48 UTC",
    );
  });

  test("several conferences are the OLDEST collect, never the freshest", () => {
    // The only single claim true of every figure on the page: collected at or
    // after this moment. The freshest would say the opposite — that everything
    // is as new as the newest — and hide a stale conference behind it.
    expect(
      collectionLine([
        stamped("GAC", "2026-08-31T02:48:11Z"),
        stamped("LSC", "2026-08-31T12:48:02Z"),
        stamped("GSC", "2026-08-31T12:49:30Z"),
      ]),
    ).toBe("Data collected Aug 31, 2026, 02:48 UTC");
  });

  test("a conference that fell behind drags the stamp back to its own day", () => {
    // The signal this exists for. One conference stuck on yesterday must move
    // the whole line to yesterday, whatever the other two managed.
    expect(
      collectionLine([
        stamped("LSC", "2026-08-31T12:48:02Z"),
        stamped("GAC", "2026-08-30T21:10:00Z"),
        stamped("GSC", "2026-08-31T12:49:30Z"),
      ]),
    ).toBe("Data collected Aug 30, 2026, 21:10 UTC");
  });

  test("the order they arrive in does not decide the answer", () => {
    const days = [stamped("GAC", "2026-08-30T21:10:00Z"), stamped("LSC", "2026-08-31T12:48:02Z")];
    expect(collectionLine(days)).toBe(collectionLine([...days].reverse()));
  });

  test("a stamp nothing can parse never wins the line", () => {
    // Sorting by string would let a malformed value sort first and stand as
    // the site's provenance. An unreadable stamp loses instead.
    expect(
      collectionLine([stamped("GAC", "not a date"), stamped("LSC", "2026-08-31T12:48:02Z")]),
    ).toBe("Data collected Aug 31, 2026, 12:48 UTC");
  });

  test("the real files produce a stamp no fresher than any of them", () => {
    const line = collectionLine(seasons.map((s) => s.season));
    expect(line).toStartWith("Data collected ");
    const oldest = seasons
      .map(({ season }) => season.collectedAt)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] as string;
    expect(line).toContain(oldest.slice(11, 16));
  });

  test("nothing collected says nothing", () => {
    expect(collectionLine([])).toBe("");
  });
});

describe("the goals chart draws one population, and it is the season's", () => {
  /** Every countable scored match, recomputed from the fixtures rather than
   *  read back from the function under test. */
  const ownGoals = (season: Season, slug: string): number =>
    season.fixtures.fixtures
      .filter(isScored)
      .filter((f) => f.home === slug || f.away === slug)
      .reduce((sum, f) => sum + ((f.home === slug ? f.home_score : f.away_score) ?? 0), 0);

  test("every member's bar is its goals over every scored match it played", () => {
    // The invariant the chip depends on. seasonCounts().played is the same
    // filter(isScored), so a skip reintroduced anywhere in the tally would put
    // the chart's population out of step with the count printed above it —
    // which is what shipped, and what nothing here could see.
    for (const { key, season } of seasons) {
      for (const row of goalsForByProgramme(season)) {
        expect(`${key}/${row.slug}: ${row.goals}`).toBe(
          `${key}/${row.slug}: ${ownGoals(season, row.slug)}`,
        );
      }
    }
  });

  test("a member-vs-member match the source did not flag as conference counts", () => {
    // Two Lone Star sides met in August in matches their own source flags
    // conference_game: false. They were dropped by a scope that guessed
    // "conference" from membership instead of reading the flag, so one
    // conference's bars were three goals short of its own records[].
    const found: string[] = [];
    for (const { key, season } of seasons) {
      const members = memberSlugs(season);
      for (const f of season.fixtures.fixtures) {
        if (!isScored(f)) continue;
        if (!members.has(f.home) || !members.has(f.away)) continue;
        if (f.conference_game !== false) continue;
        found.push(`${key} ${f.date} ${f.home} v ${f.away}`);
        const rows = new Map(goalsForByProgramme(season).map((g) => [g.slug, g]));
        expect(rows.get(f.home)?.goals).toBeGreaterThanOrEqual(f.home_score ?? 0);
        expect(rows.get(f.away)?.goals).toBeGreaterThanOrEqual(f.away_score ?? 0);
        // Both ends, both directions: a tally that added the goals and dropped
        // the concessions would pass an assertion that only looked at one.
        expect(rows.get(f.home)?.conceded).toBeGreaterThanOrEqual(f.away_score ?? 0);
        expect(rows.get(f.away)?.conceded).toBeGreaterThanOrEqual(f.home_score ?? 0);
      }
    }
    // The test of the test: if the collect stops carrying one of these, this
    // case has stopped standing for the defect and must be rechosen rather
    // than left passing on an empty loop.
    expect(found.length).toBeGreaterThan(0);
  });

  test("a conference match counts too — the population is all of them", () => {
    // The fix is one population, not a re-scoped exclusion. Asserting only the
    // unflagged case above would pass just as well against a tally that had
    // merely swapped which half of the season it threw away.
    for (const { season } of seasons) {
      const members = memberSlugs(season);
      const conference = season.fixtures.fixtures.filter(
        (f) =>
          isScored(f) && members.has(f.home) && members.has(f.away) && f.conference_game !== false,
      );
      for (const f of conference) {
        const rows = new Map(goalsForByProgramme(season).map((g) => [g.slug, g]));
        expect(rows.get(f.home)?.goals).toBeGreaterThanOrEqual(f.home_score ?? 0);
        expect(rows.get(f.away)?.goals).toBeGreaterThanOrEqual(f.away_score ?? 0);
      }
    }
    // No expectation that any exist: no conference has opened yet. The
    // invariant in the first test covers them the day they do, and this case
    // is here to fail loudly if a future skip singles them out.
  });

  test("a friendly never reaches a bar", () => {
    for (const { season } of seasons) {
      const rows = new Map(goalsForByProgramme(season).map((g) => [g.slug, g]));
      for (const f of exhibitionsOf(season)) {
        const scored = (f.home_score ?? 0) + (f.away_score ?? 0);
        if (scored === 0) continue;
        // The bar holds only countable goals, so a friendly's cannot fit in it.
        expect(rows.get(f.home)?.goals ?? 0).toBe(ownGoals(season, f.home));
        expect(rows.get(f.away)?.goals ?? 0).toBe(ownGoals(season, f.away));
      }
    }
  });
});

describe("a forfeit is the award, and a disputed score is nobody's fact", () => {
  // Built, because the data home carries neither yet (the Upper Iowa 2024
  // row is still scheduled until the rib re-collects it). Three members;
  // alpha v bravo is a forfeit the host printed as 2-2 and awarded to the
  // home side; alpha v charlie is a plain 1-0; bravo v charlie is a 3-1 that
  // another file prints differently, so it is in dispute.
  const fixture = (over: Partial<Fixture> & Pick<Fixture, "id" | "home" | "away">): Fixture => ({
    date: "2026-09-05",
    status: "final",
    conference_game: true,
    ...over,
  });
  const forfeit = fixture({
    id: "syn:alpha:1",
    home: "alpha",
    away: "bravo",
    home_score: 2,
    away_score: 2,
    forfeit: "home",
  });
  const plain = fixture({
    id: "syn:alpha:2",
    home: "alpha",
    away: "charlie",
    home_score: 1,
    away_score: 0,
  });
  const contested = fixture({
    id: "syn:bravo:3",
    home: "bravo",
    away: "charlie",
    home_score: 3,
    away_score: 1,
  });
  const file: FixturesFile = {
    schema: "touchline.fixtures/2",
    season: site.season,
    gender: site.gender,
    conference: "SYN",
    collected_at: "2026-09-06T06:00:00Z",
    programmes: [
      { slug: "alpha", name: "Alpha", conference: "SYN" },
      { slug: "bravo", name: "Bravo", conference: "SYN" },
      { slug: "charlie", name: "Charlie", conference: "SYN" },
    ],
    fixtures: [forfeit, plain, contested],
  };
  // The other file's record of bravo v charlie: same day, same sides, a
  // different score. disputedIdentities is the rule loadSeason fills the
  // season's set from, applied here to the two files by hand.
  const other: FixturesFile = {
    ...file,
    conference: "OTHER",
    programmes: [{ slug: "charlie", name: "Charlie", conference: "OTHER" }],
    fixtures: [{ ...contested, id: "other:charlie:9", home_score: 2, away_score: 1 }],
  };
  const disputed = disputedIdentities([file, other]);
  const s: Season = {
    key: "syn",
    fixtures: file,
    rosters: null,
    stats: null,
    matches: null,
    coverage: null,
    names: nameBookFor(file),
    asOf: "2026-09-06",
    collectedAt: file.collected_at,
    disputed,
  };

  test("the disputed set holds exactly the match the two files disagree on", () => {
    expect([...disputed]).toEqual([matchIdentity(contested)]);
    // Same score in both files is not a dispute, and neither is a forfeit
    // beside a plain final of the same score.
    expect(
      disputedIdentities([file, { ...other, fixtures: [{ ...contested, id: "x" }] }]).size,
    ).toBe(0);
    expect(
      disputedIdentities([
        file,
        { ...other, fixtures: [{ ...forfeit, id: "y", forfeit: undefined }] },
      ]).size,
    ).toBe(0);
  });

  test("each fixture wears its mark, and only the disputed one is out of the record", () => {
    expect(markOf(s, forfeit)).toBe(FORFEIT_MARK);
    expect(markOf(s, contested)).toBe(DISPUTED_MARK);
    expect(markOf(s, plain)).toBeNull();
    expect(isCounted(s, forfeit)).toBe(true);
    expect(isCounted(s, plain)).toBe(true);
    expect(isCounted(s, contested)).toBe(false);
    // Played and scored, all three: it is the score of the third that is
    // unproven, not the match.
    expect(scoredCount(s)).toBe(3);
    expect(programmeCounts(s, "bravo").played).toBe(2);
  });

  test("the award is the result: 2-2 with forfeit home is a home win, and its goals are nobody's", () => {
    expect(resultFor(forfeit, "home")).toBe("W");
    expect(resultFor(forfeit, "away")).toBe("L");
    const alpha = recordOf(s, "alpha");
    expect(alpha).toEqual({ won: 2, drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 0, played: 2 });
    const bravo = recordOf(s, "bravo");
    // The forfeit is a loss with no goals either way; the disputed 3-1 is out.
    expect(bravo).toEqual({ won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 0, played: 1 });
    expect(resultsOf(s, "bravo").map((r) => r.fixture.id)).toEqual([forfeit.id]);
    expect(resultsOf(s, "alpha").map((r) => r.forfeit)).toEqual([true, false]);
  });

  test("scored and conceded exclude the forfeit's goals and the disputed match", () => {
    const rows = new Map(goalsForByProgramme(s).map((g) => [g.slug, g]));
    expect(rows.get("alpha")).toMatchObject({ goals: 1, conceded: 0 });
    expect(rows.get("bravo")).toMatchObject({ goals: 0, conceded: 0 });
    expect(rows.get("charlie")).toMatchObject({ goals: 0, conceded: 1 });
  });

  test("the tables count the award and not the goals, and leave the disputed match out", () => {
    for (const rows of [table(s), overallTable(s)]) {
      const by = new Map(rows.map((r) => [r.slug, r]));
      expect(by.get("alpha")).toMatchObject({
        played: 2,
        won: 2,
        points: 6,
        goalsFor: 1,
        goalsAgainst: 0,
      });
      expect(by.get("bravo")).toMatchObject({
        played: 1,
        lost: 1,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      });
      expect(by.get("charlie")).toMatchObject({
        played: 1,
        lost: 1,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 1,
      });
    }
  });

  test("the conference's record against outsiders reads the same rules", () => {
    // Make bravo an outsider: the forfeit is then a member win over a
    // non-member, the disputed match a non-member's match that counts nowhere.
    const t: Season = {
      ...s,
      fixtures: { ...file, programmes: file.programmes.filter((p) => p.slug !== "bravo") },
    };
    expect(outsideRecord(t)).toEqual({
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      played: 1,
    });
  });
});
