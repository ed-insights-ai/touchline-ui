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
import { divisionCounts } from "./division.ts";
import { daysBetween, dowShort, shortDate, spell } from "./format.ts";
import {
  type BandColumn,
  bandHead,
  bandMeta,
  bandSummary,
  type HomeColumn,
  homeBands,
  homeColumns,
  homeLayout,
  homeSeasons,
  lastNightLedger,
  lastNightOf,
  lastNightOpen,
  mostImminentKey,
  type NationalLede,
  nationalAsOf,
  nationalDescription,
  nationalLede,
  nationalMasthead,
  nextLeagueKickoff,
  openBandIndex,
} from "./home.ts";
import type { NationalJournalFile } from "./journal.ts";
import { type Fixture, isPlayed } from "./model.ts";
import { type RegionConfig, regionsInUse } from "./regions.ts";

const seasons = homeSeasons();
const columns = homeColumns(seasons);
const national = divisionCounts(seasons);

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
    // And the phone opens the first band, not none.
    expect(openBandIndex(bands)).toBe(0);
  });

  test("a not-live one yields exactly one imminent band, and the phone opens it", () => {
    const cols = [opener("y", "2026-09-12"), live("x"), opener("z", "2026-09-19")];
    const bands = homeBands(cols, cfg);
    expect(bands.map((b) => [b.region.key, b.imminent])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(openBandIndex(bands)).toBe(1);
  });

  test("the phone open rule: the imminent band, else the first, else nothing", () => {
    expect(openBandIndex([])).toBe(-1);
    expect(openBandIndex([{ imminent: false }, { imminent: false }])).toBe(0);
    expect(openBandIndex([{ imminent: false }, { imminent: true }])).toBe(1);
    const bands = homeBands(columns);
    const at = openBandIndex(bands);
    expect(at).toBe(bands.some((b) => b.imminent) ? bands.findIndex((b) => b.imminent) : 0);
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

  test("the head, the summary and the meta share one wording", () => {
    for (const b of homeBands(columns)) {
      const meta = bandMeta(b);
      expect(bandHead(b)).toBe(
        `${b.columns.length} ${b.columns.length === 1 ? "CONFERENCE" : "CONFERENCES"} · ${meta}`,
      );
      if (b.live > 0) {
        expect(meta.startsWith(`${b.live} LIVE`)).toBe(true);
        expect(bandSummary(b)).toBe(`${b.columns.length} · ${b.live} LIVE`);
        if (b.nextOpens)
          expect(meta).toContain(`NEXT OPENS ${shortDate(b.nextOpens).toUpperCase()}`);
      } else if (b.nextOpens) {
        expect(meta).toBe(`OPENS ${shortDate(b.nextOpens).toUpperCase()}`);
        expect(bandSummary(b)).toBe(`${b.columns.length} · ${meta}`);
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
    expect(text).toContain("without a published score.");
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
 * duplicate count recounted from the fixtures. Neither comes from
 * divisionCounts(), which is the thing under test and could only ever agree
 * with itself. Each check has a matching test that perturbs an input and
 * proves it goes red, because a reconciliation that cannot fail is a comment.
 */
describe("the reconciliation the page stopped printing", () => {
  const NUMBER = new Map<string, number>();
  for (let n = 0; n <= 40; n++) NUMBER.set(spell(n), n);

  const asOf = nationalAsOf(seasons);
  const sum = (pick: (c: HomeColumn) => number): number => columns.reduce((n, c) => n + pick(c), 0);

  /** What two conferences collected twice, recounted from the raw lists by the
   *  same identity the page must fold on — the day and the two programmes,
   *  never the id, which is the collector's own key. Counted as EXTRA records
   *  rather than as shared matches, so it stays right if one ever reaches
   *  three files. */
  function duplicatedRecords(admit: (f: Fixture) => boolean): number {
    const groups = new Map<string, number>();
    for (const c of columns) {
      for (const f of loadSeason(c.key).fixtures.fixtures) {
        if (!admit(f)) continue;
        const id = `${f.date} ${[f.home, f.away].sort().join(" v ")}`;
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
    expect(national.gaps).toBe(
      sum((c) => c.counts.gaps) -
        duplicatedRecords((f) => {
          const ids = new Set(
            columns.flatMap((c) => boxScoreGaps(loadSeason(c.key)).map((g) => g.fixtureId)),
          );
          return ids.has(f.id);
        }),
    );
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
