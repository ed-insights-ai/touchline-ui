/**
 * The cross-conference home page, against the real data home.
 *
 * The page's one promise is that its every count survives being written out
 * as a list and matches what the linked season pages show. So nothing here
 * pins a figure to a snapshot — the data is re-collected daily. Each test
 * recounts from the fixture lists and makes the two answers meet.
 */

import { describe, expect, test } from "bun:test";
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
import { daysBetween, shortDate, spell } from "./format.ts";
import {
  type HomeColumn,
  homeColumns,
  homeSeasons,
  lastNightLedger,
  lastNightOf,
  lastNightOpen,
  mostImminentKey,
  nationalAsOf,
  nationalCounts,
  nationalLede,
  nextLeagueKickoff,
} from "./home.ts";
import { isPlayed } from "./model.ts";

const seasons = homeSeasons();
const columns = homeColumns(seasons);
const national = nationalCounts(columns);

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

  test("the row count is the recount of scored fixtures on the date, met from the raw list", () => {
    for (const date of allDates) {
      const recount = seasons.flatMap((s) =>
        s.fixtures.fixtures.filter((f) => f.date === date && isScored(f)),
      );
      expect(lastNightLedger(seasons, date).length, date).toBe(recount.length);
    }
  });

  test("a silent final is counted beside the ledger, never inside it", () => {
    for (const date of allDates) {
      const inLedger = new Set(lastNightLedger(seasons, date).map((r) => r.fixture.id));
      const open = lastNightOpen(seasons, date);
      for (const s of seasons) {
        for (const f of s.fixtures.fixtures) {
          if (f.date !== date || !isCountable(f)) continue;
          if (isPlayed(f) && !hasScore(f)) {
            expect(inLedger.has(f.id), `${date}: silent final ${f.id} entered the ledger`).toBe(
              false,
            );
            expect(
              open.some((o) => o.id === f.id),
              `${date}: silent final ${f.id} not open`,
            ).toBe(true);
          }
        }
      }
      // Open and ledger never overlap: a fixture is played or open, not both.
      for (const f of open) expect(inLedger.has(f.id)).toBe(false);
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
        rows.some((r) => r.fixture.id === f.id),
        f.id,
      ).toBe(false);
      expect(
        lastNightOpen(seasons, f.date).some((o) => o.id === f.id),
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

  test("the national figures are exactly the column figures, summed", () => {
    expect(national.played).toBe(columns.reduce((n, c) => n + c.counts.played, 0));
    expect(national.total).toBe(columns.reduce((n, c) => n + c.counts.total, 0));
    expect(national.silentFinals).toBe(columns.reduce((n, c) => n + c.counts.silentFinals, 0));
    expect(national.gaps).toBe(columns.reduce((n, c) => n + c.counts.gaps, 0));
    expect(national.exhibitions).toBe(columns.reduce((n, c) => n + c.exhibitions, 0));
  });
});

describe("the lede is derived, deterministically, from counts and opener dates", () => {
  const lede = nationalLede(columns, national);

  test("its figures are the national figures", () => {
    expect(lede).toContain(`${national.played} of ${national.total} matches played`);
    expect(lede).toContain(`across ${spell(columns.length)} conferences`);
  });

  test("its first opener is the most imminent column's opener", () => {
    const first = columns.find((c) => !c.live && c.opensOn !== null);
    if (first?.opensOn) {
      expect(lede).toContain(`first in the ${first.name} on ${shortDate(first.opensOn)}`);
    }
  });

  test("it names the silences always — a zero is a figure, not a silence of ours", () => {
    // The guard came off with the counts block (tui-2lp): the ALL row was the
    // only surface that would ever have printed a division zero, and a reader
    // must not have to infer one from a sentence we chose not to write.
    if (national.silentFinals > 0) {
      const spelled = spell(national.silentFinals);
      expect(lede).toContain(
        `${spelled.charAt(0).toUpperCase()}${spelled.slice(1)} ${
          national.silentFinals === 1 ? "final stands" : "finals stand"
        } without a published score.`,
      );
    } else {
      expect(lede).toContain("No final stands without a published score.");
    }
    // Whatever the count, the page states it.
    expect(lede).toContain("without a published score.");
  });

  test("the zero sentence is prose, not a spelled nought", () => {
    const none = nationalLede(columns, { ...national, silentFinals: 0 });
    expect(none).toContain("No final stands without a published score.");
    expect(none).not.toContain("Zero finals");
  });

  test("the same inputs produce the same prose — no model call anywhere in it", () => {
    expect(nationalLede(columns, national)).toBe(lede);
    expect(nationalLede(homeColumns(seasons))).toBe(lede);
  });
});

/**
 * The reconciliation the page stopped printing.
 *
 * Until tui-2lp the foot of the national page wrote the division's sums out
 * as a list of addends — GAC, GSC, LSC, then ALL — so a reader could add them
 * up by hand. That block was the accounting made visible, and it retired. The
 * obligation did not: the lede's division figures still have to be the sum of
 * what the columns show, and the linked season pages still have to agree with
 * both.
 *
 * So this reads the figures back out of the prose the page actually prints,
 * and compares them against a sum recounted from the fixtures — not against
 * nationalCounts(), which is that sum and could only ever agree with itself.
 * The last test perturbs a column and proves the check goes red, because a
 * reconciliation that cannot fail is a comment.
 */
describe("the reconciliation the page stopped printing", () => {
  const NUMBER = new Map<string, number>();
  for (let n = 0; n <= 40; n++) NUMBER.set(spell(n), n);

  /** Every way the lede and the columns beneath it can disagree. Empty is
   *  the only passing answer; each entry says which figure parted company. */
  function disagreements(text: string, cols: readonly HomeColumn[]): string[] {
    const out: string[] = [];
    const sum = (pick: (c: HomeColumn) => number): number => cols.reduce((n, c) => n + pick(c), 0);

    const matches = /(\d+) of (\d+) matches played across ([a-z]+) (conference|conferences)\./.exec(
      text,
    );
    if (!matches) {
      out.push("the lede does not state played of total at all");
    } else {
      const played = Number(matches[1]);
      const total = Number(matches[2]);
      const conferences = NUMBER.get(matches[3] as string);
      if (played !== sum((c) => c.counts.played)) {
        out.push(`played: lede ${played}, columns ${sum((c) => c.counts.played)}`);
      }
      if (total !== sum((c) => c.counts.total)) {
        out.push(`total: lede ${total}, columns ${sum((c) => c.counts.total)}`);
      }
      if (conferences !== cols.length) {
        out.push(`conferences: lede ${matches[3]}, columns ${cols.length}`);
      }
    }

    const none = text.includes("No final stands without a published score.");
    const some = /(\w+) (?:final stands|finals stand) without a published score\./.exec(text);
    const silent = none ? 0 : NUMBER.get((some?.[1] ?? "").toLowerCase());
    if (silent === undefined) {
      out.push("the lede does not state the silent finals at all");
    } else if (silent !== sum((c) => c.counts.silentFinals)) {
      out.push(`silent: lede ${silent}, columns ${sum((c) => c.counts.silentFinals)}`);
    }
    return out;
  }

  test("the lede's division figures are the columns' figures, added up", () => {
    expect(disagreements(nationalLede(columns, national), columns)).toEqual([]);
  });

  test("and the columns are the linked season pages, recounted from the fixtures", () => {
    // The other half of the promise: each addend equals what its own season
    // page shows, so agreeing with the lede is worth something.
    for (const c of columns) {
      const s = loadSeason(c.key);
      expect(c.counts, c.key).toEqual(seasonCounts(s));
      expect(c.counts.gaps, c.key).toBe(boxScoreGaps(s).length);
    }
  });

  test("gaps reconcile the same way, though no surface adds them up now", () => {
    // The ALL row was the only place the division's gap total was ever
    // written. Nothing prints it today, and it still has to be true.
    expect(national.gaps).toBe(
      columns.reduce((n, c) => n + boxScoreGaps(loadSeason(c.key)).length, 0),
    );
  });

  test("it goes red when a column figure moves", () => {
    // The teeth. Perturb one column and leave the lede alone — exactly the
    // drift the retired block would have shown a reader — and the check must
    // name the figure that parted company.
    expect(columns.length).toBeGreaterThan(0);
    const moved = columns.map((c, i) =>
      i === 0 ? { ...c, counts: { ...c.counts, played: c.counts.played + 1 } } : c,
    );
    const found = disagreements(nationalLede(columns, national), moved);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join(" ")).toContain("played:");

    // A silence that drifts is caught too, and separately.
    const quieter = columns.map((c, i) =>
      i === 0 ? { ...c, counts: { ...c.counts, silentFinals: c.counts.silentFinals + 2 } } : c,
    );
    expect(disagreements(nationalLede(columns, national), quieter).join(" ")).toContain("silent:");
  });
});
