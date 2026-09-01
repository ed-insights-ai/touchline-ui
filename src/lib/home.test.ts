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
import { daysBetween, dowShort, shortDate, spell } from "./format.ts";
import {
  type HomeColumn,
  homeColumns,
  homeSeasons,
  lastNightLedger,
  lastNightOf,
  lastNightOpen,
  mostImminentKey,
  type NationalLede,
  nationalAsOf,
  nationalCounts,
  nationalDescription,
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
      // And the row resolves to the conference the home side plays in.
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

  test("the national figures are exactly the column figures, summed", () => {
    expect(national.played).toBe(columns.reduce((n, c) => n + c.counts.played, 0));
    expect(national.total).toBe(columns.reduce((n, c) => n + c.counts.total, 0));
    expect(national.silentFinals).toBe(columns.reduce((n, c) => n + c.counts.silentFinals, 0));
    expect(national.gaps).toBe(columns.reduce((n, c) => n + c.counts.gaps, 0));
    expect(national.exhibitions).toBe(columns.reduce((n, c) => n + c.exhibitions, 0));
  });
});

describe("the masthead is derived, deterministically, from counts and opener dates", () => {
  const asOf = nationalAsOf(seasons);
  const lede = nationalLede(columns, asOf, national);

  test("the kicker is the scope and the national collect date", () => {
    expect(lede.kicker).toBe(
      `${site.division} · ${dowShort(asOf)} ${shortDate(asOf)}`.toUpperCase(),
    );
    // It is the only place above the footer that names the division. The row
    // that used to say it a second time is gone.
    expect(lede.kicker).toContain(site.division.toUpperCase());
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
    expect(lede.strip).toEqual([
      `${national.played} OF ${national.total} PLAYED`,
      `${national.silentFinals} SILENT ${national.silentFinals === 1 ? "FINAL" : "FINALS"}`,
    ]);
  });

  test("it names the silences always — a zero is a figure, not a silence of ours", () => {
    // Nothing else on this page prints a division zero, so the strip is the
    // only place one can appear, and a reader must not have to infer a clean
    // collect from a cell we chose not to render. The doctrine moved here
    // from the prose sentence; the obligation did not move.
    const clean = nationalLede(columns, asOf, { ...national, silentFinals: 0 });
    expect(clean.strip).toContain("0 SILENT FINALS");
    const one = nationalLede(columns, asOf, { ...national, silentFinals: 1 });
    expect(one.strip).toContain("1 SILENT FINAL");
  });

  test("the same inputs produce the same parts — no model call anywhere in it", () => {
    expect(nationalLede(columns, asOf, national)).toEqual(lede);
    expect(nationalLede(columns, asOf)).toEqual(lede);
  });

  test("the description keeps the prose the masthead stopped printing", () => {
    // The share card and the search result have no cards and no strip beneath
    // them. Every figure the page split across altitudes has to survive as one
    // paragraph for the surfaces that get nothing else.
    const text = nationalDescription(columns, national);
    expect(text).toContain(`${national.played} of ${national.total} matches played`);
    expect(text).toContain(`across ${spell(columns.length)} conferences`);
    expect(text).toContain("without a published score.");
  });
});

/**
 * The reconciliation the page does not print.
 *
 * Nothing on the national page lays the division's sums out as addends for a
 * reader to check by hand. The obligation stands anyway: the division figures
 * have to be the sum of what the pages beneath them show, and those pages have
 * to agree with the fixtures.
 *
 * So this reads the figures back out of the two surfaces that publish them —
 * the masthead strip a reader meets and the description a share card meets —
 * and compares them against a sum recounted from the fixtures, not against
 * nationalCounts(), which is that sum and could only ever agree with itself.
 * Each check has a matching test that perturbs an input and proves it goes
 * red, because a reconciliation that cannot fail is a comment.
 *
 * The columns print played of total and nothing else, so that pair is what a
 * reader can add up on this page. The silences are not in the columns; they
 * are in the strip, and printed per conference on the season pages a reader
 * gets to from here — one click further on, and just as addable.
 */
describe("the reconciliation the page stopped printing", () => {
  const NUMBER = new Map<string, number>();
  for (let n = 0; n <= 40; n++) NUMBER.set(spell(n), n);

  const asOf = nationalAsOf(seasons);
  const sum = (cols: readonly HomeColumn[], pick: (c: HomeColumn) => number): number =>
    cols.reduce((n, c) => n + pick(c), 0);

  /** A strip cell, found by what it says rather than by where it sits: the
   *  order of the row is a design decision and this is not a test of it. */
  function cell(strip: readonly string[], re: RegExp): RegExpExecArray | null {
    for (const c of strip) {
      const m = re.exec(c);
      if (m) return m;
    }
    return null;
  }

  /** Every way the strip and the columns beneath it can disagree. Empty is
   *  the only passing answer; each entry says which figure parted company. */
  function stripDisagreements(lede: NationalLede, cols: readonly HomeColumn[]): string[] {
    const out: string[] = [];
    const m = cell(lede.strip, /^(\d+) OF (\d+) PLAYED$/);
    if (!m) {
      out.push("the strip does not state played of total at all");
      return out;
    }
    const played = Number(m[1]);
    const total = Number(m[2]);
    if (played !== sum(cols, (c) => c.counts.played)) {
      out.push(`played: strip ${played}, columns ${sum(cols, (c) => c.counts.played)}`);
    }
    if (total !== sum(cols, (c) => c.counts.total)) {
      out.push(`total: strip ${total}, columns ${sum(cols, (c) => c.counts.total)}`);
    }
    return out;
  }

  /** The same, for the paragraph the description publishes. It states one
   *  figure the strip does not — how many conferences were added up — so the
   *  two surfaces are checked separately rather than one standing for both. */
  function descriptionDisagreements(text: string, cols: readonly HomeColumn[]): string[] {
    const out: string[] = [];
    const m = /(\d+) of (\d+) matches played across ([a-z]+) (conference|conferences)\./.exec(text);
    if (!m) {
      out.push("the description does not state played of total at all");
      return out;
    }
    const played = Number(m[1]);
    const total = Number(m[2]);
    const conferences = NUMBER.get(m[3] as string);
    if (played !== sum(cols, (c) => c.counts.played)) {
      out.push(`played: description ${played}, columns ${sum(cols, (c) => c.counts.played)}`);
    }
    if (total !== sum(cols, (c) => c.counts.total)) {
      out.push(`total: description ${total}, columns ${sum(cols, (c) => c.counts.total)}`);
    }
    if (conferences !== cols.length) {
      out.push(`conferences: description ${m[3]}, columns ${cols.length}`);
    }
    return out;
  }

  /** The silent-finals figure the strip prints, read back out of its cell.
   *  Null means the cell is not there at all, which is its own failure: the
   *  zero case is a cell too. */
  function silentInStrip(lede: NationalLede): number | null {
    const m = cell(lede.strip, /^(\d+) SILENT (?:FINAL|FINALS)$/);
    return m ? Number(m[1]) : null;
  }

  /** And out of the description's prose, where it is spelled. */
  function silentInDescription(text: string): number | null {
    if (text.includes("No final stands without a published score.")) return 0;
    const some = /(\w+) (?:final stands|finals stand) without a published score\./.exec(text);
    const spelled = NUMBER.get((some?.[1] ?? "").toLowerCase());
    return spelled === undefined ? null : spelled;
  }

  /** The division's silences, recounted from the fixture lists themselves —
   *  the same arithmetic each season page's masthead is held to. */
  const silentFromFixtures = (): number =>
    columns.reduce(
      (n, c) =>
        n +
        loadSeason(c.key).fixtures.fixtures.filter(
          (f) => isCountable(f) && isPlayed(f) && !hasScore(f),
        ).length,
      0,
    );

  test("the strip's played of total is the columns' played of total, added up", () => {
    expect(stripDisagreements(nationalLede(columns, asOf, national), columns)).toEqual([]);
  });

  test("and the description's is too, conference count included", () => {
    expect(descriptionDisagreements(nationalDescription(columns, national), columns)).toEqual([]);
  });

  test("and the columns are the linked season pages, recounted from the fixtures", () => {
    // The other half of the promise: each addend equals what its own season
    // page shows, so agreeing with the strip is worth something.
    for (const c of columns) {
      const s = loadSeason(c.key);
      expect(c.counts, c.key).toEqual(seasonCounts(s));
      expect(c.counts.gaps, c.key).toBe(boxScoreGaps(s).length);
    }
  });

  test("the silences on both surfaces are the fixtures' silences, recounted", () => {
    // The columns do not print this; the strip does as a figure, the
    // description does in words, and the season pages name every one of them.
    // Read the figure back out of each and count the silent finals again from
    // the files.
    expect(silentInStrip(nationalLede(columns, asOf, national))).toBe(silentFromFixtures());
    expect(silentInDescription(nationalDescription(columns, national))).toBe(silentFromFixtures());
  });

  test("and both go red when the silences drift from the files", () => {
    // The teeth for the figure the columns do not back up. Move the count the
    // masthead is built from and the recount must refuse it.
    const drift = { ...national, silentFinals: national.silentFinals + 2 };
    expect(silentInStrip(nationalLede(columns, asOf, drift))).not.toBe(silentFromFixtures());
    expect(silentInDescription(nationalDescription(columns, drift))).not.toBe(silentFromFixtures());
    // And the cell must be there at all: a strip that stopped stating the
    // count would otherwise pass a comparison it never took part in.
    expect(silentInStrip(nationalLede(columns, asOf, national))).not.toBeNull();
    expect(silentInDescription(nationalDescription(columns, national))).not.toBeNull();
  });

  test("gaps reconcile the same way, though nothing adds them up now", () => {
    // No surface prints the division's gap total, and no column prints its
    // own. Nothing shows this figure anywhere, and it still has to be true.
    expect(national.gaps).toBe(
      columns.reduce((n, c) => n + boxScoreGaps(loadSeason(c.key)).length, 0),
    );
  });

  test("it goes red when a column figure moves", () => {
    // The teeth. Perturb one column and leave the masthead alone — exactly the
    // drift the retired block would have shown a reader — and the check must
    // name the figure that parted company.
    expect(columns.length).toBeGreaterThan(0);
    const lede = nationalLede(columns, asOf, national);
    const description = nationalDescription(columns, national);
    const moved = columns.map((c, i) =>
      i === 0 ? { ...c, counts: { ...c.counts, played: c.counts.played + 1 } } : c,
    );
    expect(stripDisagreements(lede, moved).join(" ")).toContain("played:");
    expect(descriptionDisagreements(description, moved).join(" ")).toContain("played:");

    // A total that drifts is caught too, and named separately.
    const larger = columns.map((c, i) =>
      i === 0 ? { ...c, counts: { ...c.counts, total: c.counts.total + 3 } } : c,
    );
    expect(stripDisagreements(lede, larger).join(" ")).toContain("total:");
    expect(descriptionDisagreements(description, larger).join(" ")).toContain("total:");
  });
});
