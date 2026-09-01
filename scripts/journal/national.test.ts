/**
 * The national brief.
 *
 * Everything the division's writer is allowed to know, and the whole risk of
 * this surface in one sentence: it is composed across three files that each
 * hold a copy of the same match. A conference brief cannot double-count
 * anything; this one can double-count everything.
 *
 * So these hold the brief to two things. Every division-level figure in it is
 * a count of matches rather than of records, recounted here by folding rather
 * than by calling the function under test. And every surface figure in it is
 * the surface's own — a brief that describes the page from memory drifts from
 * the page the first time the page changes, and the prompt's whole SURFACES
 * discipline rests on the description being accurate.
 */

import { describe, expect, test } from "bun:test";
import { hasScore, isScored, type Season } from "../../src/lib/derive.ts";
import { allSightings, divisionCounts, foldToMatches } from "../../src/lib/division.ts";
import {
  homeColumns,
  homeSeasons,
  lastNightOf,
  nationalAsOf,
  nationalLede,
} from "../../src/lib/home.ts";
import { editorial, loadJournal } from "../../src/lib/journal.ts";
import { buildNationalBrief, nationalFixtureIndex } from "./national.ts";

const seasons = homeSeasons();
const brief = buildNationalBrief(seasons);

describe("every division figure is a count of matches", () => {
  test("the division block is the folded count, not the conferences' sum", () => {
    const counts = divisionCounts(seasons);
    expect(brief.division.matches_total).toBe(counts.total);
    expect(brief.division.matches_played).toBe(counts.played);
    expect(brief.division.silent_finals).toBe(counts.silentFinals);
    expect(brief.division.box_score_gaps).toBe(counts.gaps);
    expect(brief.division.friendlies_excluded).toBe(counts.exhibitions);
  });

  test("and the sum it is not is carried beside it, so nobody reaches for it", () => {
    // The writer sees what a naive sum would have been, as a number labelled
    // what it is. A brief that hid the difference would leave the model to
    // rediscover it by adding the cards up.
    const columns = homeColumns(seasons);
    const sum = columns.reduce((n, c) => n + c.counts.total, 0);
    expect(brief.division.duplicated_records.total).toBe(sum - brief.division.matches_total);
    expect(brief.division.duplicated_records.total).toBeGreaterThan(0);
  });

  test("the match index offers each match once", () => {
    const index = nationalFixtureIndex(seasons);
    expect(new Set(index).size).toBe(index.length);
    // And it is smaller than the raw fixture count, which is the fold working.
    const raw = seasons.reduce((n, s) => n + s.fixtures.fixtures.length, 0);
    expect(index.length).toBeLessThan(raw);
  });

  test("last night is folded — one entry per match, wearing every code", () => {
    const night = lastNightOf(nationalAsOf(seasons));
    const identities = new Set(
      seasons.flatMap((s) =>
        s.fixtures.fixtures
          .filter((f) => f.date === night && isScored(f))
          .map((f) => `${f.date} ${[f.home, f.away].sort().join(" v ")}`),
      ),
    );
    expect(brief.last_night.results.length).toBe(identities.size);
  });
});

describe("the division's record against everyone else is not three records added up", () => {
  /** The same figure, recounted the long way: fold first, then keep only the
   *  matches with exactly one side inside a covered conference. */
  function recount(): { wins: number; losses: number; draws: number } {
    const covered = new Set<string>();
    for (const s of seasons) for (const p of s.fixtures.programmes) covered.add(p.slug);
    const out = { wins: 0, losses: 0, draws: 0 };
    for (const m of foldToMatches(allSightings(seasons))) {
      const f = m.fixture;
      if (!isScored(f) || !hasScore(f)) continue;
      const home = covered.has(f.home);
      if (home === covered.has(f.away)) continue;
      const gf = home ? (f.home_score as number) : (f.away_score as number);
      const ga = home ? (f.away_score as number) : (f.home_score as number);
      if (gf > ga) out.wins++;
      else if (gf < ga) out.losses++;
      else out.draws++;
    }
    return out;
  }

  test("it is the folded recount", () => {
    const r = recount();
    expect(brief.across.division_vs_outside.wins).toBe(r.wins);
    expect(brief.across.division_vs_outside.draws).toBe(r.draws);
    expect(brief.across.division_vs_outside.losses).toBe(r.losses);
  });

  test("and it differs from the sum, which holds both halves of the same match", () => {
    // A match between two covered conferences is "outside the conference" for
    // both of them, so each counts it — one as a win, the other as that same
    // match's loss. Adding the three gives a record with both halves in it.
    // The difference is not cosmetic and the test says so out loud.
    const sum = brief.conferences.reduce(
      (acc, c) => ({
        wins: acc.wins + c.record_vs_outside.wins,
        losses: acc.losses + c.record_vs_outside.losses,
      }),
      { wins: 0, losses: 0 },
    );
    expect(sum.wins).toBeGreaterThan(brief.across.division_vs_outside.wins);
    expect(sum.losses).toBeGreaterThan(brief.across.division_vs_outside.losses);
  });
});

describe("the surfaces the brief describes are the surfaces the page renders", () => {
  test("the strip and kicker come from the function that renders them", () => {
    const columns = homeColumns(seasons);
    const lede = nationalLede(columns, nationalAsOf(seasons), divisionCounts(seasons));
    expect(brief.surfaces.strip).toEqual(lede.strip);
    expect(brief.surfaces.kicker).toBe(lede.kicker);
  });

  test("each card's line is the line that card renders", () => {
    // The prompt tells the writer not to say these again. It can only mean
    // that if these ARE them — the wire when a journal wrote one, the season
    // headline when it did not, chosen the way the card chooses.
    const line = (s: Season): string => {
      const journal = loadJournal(s);
      return journal?.wire?.line ?? editorial(s, journal).headline;
    };
    const byCode = new Map(brief.surfaces.cards.map((c) => [c.code, c.line]));
    for (const s of seasons) {
      expect(byCode.get(s.fixtures.conference), s.key).toBe(line(s));
    }
  });

  test("and each card's figures are that card's own, not the division's", () => {
    const byCode = new Map(homeColumns(seasons).map((c) => [c.code, c.counts]));
    for (const card of brief.surfaces.cards) {
      const counts = byCode.get(card.code);
      expect(counts, card.code).toBeDefined();
      expect(card.matches_played, card.code).toBe(counts?.played ?? -1);
      expect(card.matches_total, card.code).toBe(counts?.total ?? -1);
    }
    // The division's own total is smaller than the cards added up — which is
    // the whole reason the writer is shown both.
    const added = brief.surfaces.cards.reduce((n, c) => n + c.matches_total, 0);
    expect(brief.division.matches_total).toBeLessThan(added);
  });
});
