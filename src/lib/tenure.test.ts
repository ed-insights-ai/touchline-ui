/**
 * The squad as tenure.
 *
 * Two failures this file exists to prevent, both of which would look fine on
 * the page:
 *
 *   • A square that goes missing. The grid is the only place a reader can
 *     count the squad by eye, so "6 ret · 4 new" has to be the number of
 *     squares actually drawn beside it, and the rows together have to be the
 *     whole roster. A player silently filtered out of a line is invisible.
 *   • A minutes figure that quietly shrinks its own denominator. The share is
 *     of LAST season, and a prior roster can list a position this site cannot
 *     place — "Right Back" where this year writes "Defender". Those minutes
 *     were played. They stay in the total and get named, rather than being
 *     dropped so the percentage comes out tidier.
 *
 * Counts are not pinned. The data is re-collected daily and a pinned figure
 * would fail on the collect rather than on the code.
 */

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { loadSeason, squadOf } from "./derive.ts";
import { returnedShare, TENURE_STEPS, tenureGrid, tenureOf, tenureWord } from "./tenure.ts";

const seasons = site.conferences.map((k) => loadSeason(k));
const everyTeam = seasons.flatMap((s) =>
  Object.keys(s.rosters?.rosters ?? {}).map((slug) => ({ s, slug, grid: tenureGrid(s, slug) })),
);

describe("reading a class year onto the ladder", () => {
  test("the five steps come off the forms a roster actually writes", () => {
    expect(tenureOf("Freshman").step).toBe("FR");
    expect(tenureOf("1st Year").step).toBe("FR");
    expect(tenureOf("Sophomore").step).toBe("SO");
    expect(tenureOf("3rd Year").step).toBe("JR");
    expect(tenureOf("Senior").step).toBe("SR");
    expect(tenureOf("4th Year").step).toBe("SR");
    expect(tenureOf("Fifth Year").step).toBe("5Y");
  });

  test("a graduate student takes the top step, not a hollow square", () => {
    // Hollow means the roster published nothing. It published this.
    const grad = tenureOf("Graduate Student");
    expect(grad.step).toBe("5Y");
    expect(grad.published).toBe("Graduate Student");
    expect(tenureWord(grad)).toBe("Fifth year (Graduate Student)");
  });

  test("no class year and an unreadable one are different states", () => {
    expect(tenureOf(undefined)).toEqual({ step: null, published: null });
    expect(tenureOf("  ")).toEqual({ step: null, published: null });
    const odd = tenureOf("Redshirt");
    expect(odd.step).toBeNull();
    expect(odd.published).toBe("Redshirt");
    expect(tenureWord(tenureOf(undefined))).toBe("class year not published");
    expect(tenureWord(odd)).toContain("Redshirt");
  });

  test("the word does not say the same thing twice", () => {
    expect(tenureWord(tenureOf("Senior"))).toBe("Senior");
  });
});

describe("the grid against every roster this site collects", () => {
  test("the rows are the whole squad, once each", () => {
    for (const { s, slug, grid } of everyTeam) {
      const drawn = grid.rows.flatMap((r) => [...r.returners, ...r.newcomers]);
      expect(drawn.length, `${s.key}/${slug}`).toBe(grid.size);
      expect(new Set(drawn.map((sq) => sq.name)).size).toBe(
        new Set(squadOf(s, slug).map((m) => m.player.name)).size,
      );
    }
  });

  test("the count beside a row is the squares drawn in it", () => {
    // The one thing a reader can check by hand, so it must survive counting.
    for (const { s, slug, grid } of everyTeam) {
      let ret = 0;
      let raw = 0;
      for (const row of grid.rows) {
        expect(
          row.returners.every((sq) => sq.returning),
          `${s.key}/${slug}`,
        ).toBe(true);
        expect(
          row.newcomers.some((sq) => sq.returning),
          `${s.key}/${slug}`,
        ).toBe(false);
        ret += row.returners.length;
        raw += row.newcomers.length;
      }
      if (grid.returning === null) {
        expect(ret, `${s.key}/${slug}`).toBe(0);
        expect(raw).toBe(grid.size);
      } else {
        expect(ret, `${s.key}/${slug}`).toBe(grid.returning);
        // returning and fresh are set or absent together; say so, then read it.
        expect(grid.fresh).not.toBeNull();
        expect(raw).toBe(grid.fresh as number);
        expect(ret + raw).toBe(grid.size);
      }
    }
  });

  test("each side reads longest tenure first, with the unknown last", () => {
    const rank = (step: string | null) =>
      step === null ? -1 : TENURE_STEPS.indexOf(step as (typeof TENURE_STEPS)[number]);
    for (const { s, slug, grid } of everyTeam) {
      for (const row of grid.rows) {
        for (const side of [row.returners, row.newcomers]) {
          for (let i = 1; i < side.length; i++) {
            const before = rank(side[i - 1]?.tenure.step ?? null);
            const here = rank(side[i]?.tenure.step ?? null);
            expect(before >= here, `${s.key}/${slug} ${row.label}`).toBe(true);
          }
        }
      }
    }
  });

  test("an UNLISTED row exists only when a roster made one", () => {
    for (const { s, slug, grid } of everyTeam) {
      const unlisted = grid.rows.find((r) => r.key === "UNL");
      const off = squadOf(s, slug).filter((m) => m.line === null).length;
      if (off === 0) expect(unlisted, `${s.key}/${slug}`).toBeUndefined();
      else expect((unlisted?.returners.length ?? 0) + (unlisted?.newcomers.length ?? 0)).toBe(off);
    }
  });
});

describe("the minutes the grid takes a share of", () => {
  test("a share is never more than the whole, and never NaN", () => {
    for (const { s, slug, grid } of everyTeam) {
      for (const row of grid.rows) {
        const share = returnedShare(row.minutes);
        if (row.minutes) expect(row.minutes.returned).toBeLessThanOrEqual(row.minutes.total);
        if (share !== null) {
          expect(Number.isFinite(share), `${s.key}/${slug} ${row.label}`).toBe(true);
          expect(share).toBeGreaterThanOrEqual(0);
          expect(share).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test("nothing to divide is an absence, not nought per cent", () => {
    expect(returnedShare(null)).toBeNull();
    expect(returnedShare({ returned: 0, total: 0 })).toBeNull();
    // A real zero is a real zero: every minute at this line left.
    expect(returnedShare({ returned: 0, total: 900 })).toBe(0);
  });

  test("minutes the rows cannot hold stay in the total and are counted out loud", () => {
    // The failure this prevents: dropping a prior-roster position this site
    // cannot place, which shrinks the denominator and flatters the figure.
    for (const { s, slug, grid } of everyTeam) {
      if (!grid.minutes) continue;
      const rows = grid.rows.reduce((n, r) => n + (r.minutes?.total ?? 0), 0);
      expect(rows + grid.offLine.minutes, `${s.key}/${slug}`).toBe(grid.minutes.total);
      const back = grid.rows.reduce((n, r) => n + (r.minutes?.returned ?? 0), 0);
      expect(back).toBeLessThanOrEqual(grid.minutes.returned);
      if (grid.offLine.minutes > 0) expect(grid.offLine.players).toBeGreaterThan(0);
    }
  });

  test("the check is looking at something", () => {
    const withMinutes = everyTeam.filter((t) => (t.grid.minutes?.total ?? 0) > 0);
    expect(withMinutes.length).toBeGreaterThan(20);
    expect(everyTeam.some((t) => t.grid.offLine.players > 0)).toBe(true);
    expect(everyTeam.some((t) => t.grid.rows.some((r) => returnedShare(r.minutes) === null))).toBe(
      true,
    );
  });
});
