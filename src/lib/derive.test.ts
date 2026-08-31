/**
 * The vocabulary, against the real data home.
 *
 * These are the definitions three published journals rested on, and every one
 * of them was wrong at some point in this repo's history: exhibitions counted
 * as record, silent finals counted as played, opponents linked to conferences
 * they do not belong to. They are cheap to assert and expensive to get wrong.
 */

import { describe, expect, test } from "bun:test";
import {
  boxScoreGaps,
  exhibitionsOf,
  fixtureCount,
  hasScore,
  isCountable,
  isExhibition,
  isScored,
  loadSeason,
  playedCount,
  programmeCounts,
  recordOf,
  scoredCount,
  seasonCounts,
  teamPageHref,
  unresolved,
} from "./derive.ts";
import { isPlayed } from "./model.ts";

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
    // Saint Mary's played two friendlies with published scores — a 3–0 win
    // over a club side and a 1–2 loss. Counting them read 2–0–2 with 5 goals.
    const lsc = loadSeason("lsc");
    const scoredExhibitions = lsc.fixtures.fixtures.filter((f) => isExhibition(f) && hasScore(f));
    expect(scoredExhibitions.length).toBeGreaterThan(0);

    const record = recordOf(lsc, "saint-marys");
    expect(record.played).toBe(2);
    expect(record.won).toBe(0);
    expect(record.goalsFor).toBe(0);
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
