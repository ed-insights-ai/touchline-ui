/**
 * The division's validator.
 *
 * Its whole reason for existing is that a division claim has no single season
 * behind it. A conference validator asked to check "more goals than any other
 * programme in the division" resolves the subject, fails to resolve the
 * rivals, and drops the claim — every time, silently, as a resolution failure
 * rather than as the thing it is: the best claim this surface can make, with
 * nothing able to check it.
 *
 * So these hold two things. A comparative ranges across the conference lines
 * and is judged on the real ranking. And a division count is a count of
 * matches: a claim carrying the sum of the conferences' own figures is
 * contradicted, because that sum is not what the page prints.
 */

import { describe, expect, test } from "bun:test";
import { divisionCounts } from "../../src/lib/division.ts";
import { homeColumns, homeSeasons } from "../../src/lib/home.ts";
import type { NationalJournalFile } from "../../src/lib/journal.ts";
import { buildNationalBrief } from "./national.ts";
import { validateNationalJournal } from "./national-validate.ts";
import { CHECKERS } from "./validate.ts";

const seasons = homeSeasons();
const counts = divisionCounts(seasons);
const brief = buildNationalBrief(seasons);

function journal(over: Partial<NationalJournalFile>): NationalJournalFile {
  return {
    schema: "touchline.national/1",
    season: 2026,
    gender: "men",
    generated_at: "2026-09-01T12:00:00Z",
    data_collected_at: seasons[0]?.collectedAt ?? "",
    headline: "A headline with no numbers in it at all.",
    ...over,
  } as NationalJournalFile;
}

const run = (j: NationalJournalFile) => validateNationalJournal(j, seasons, "test", CHECKERS);
const claim = (j: NationalJournalFile) => run(j).report.claims[0];

describe("a division count is a count of matches", () => {
  test("the folded figures verify", () => {
    const j = journal({
      headline: `${counts.played} of ${counts.total} matches played across the division.`,
      basis: { source: "division", matches_played: counts.played, matches_total: counts.total },
    });
    expect(claim(j)?.verdict).toBe("verified");
    expect(run(j).journal.headline).toBe(j.headline);
  });

  test("and the conferences' sum is contradicted, because it is not what the page prints", () => {
    // The exact defect this surface shipped: 48 of 363 where the honest
    // figures are 45 of 342. A validator that accepted the sum would have let
    // it back in.
    const columns = homeColumns(seasons);
    const sum = (pick: (c: (typeof columns)[number]) => number): number =>
      columns.reduce((n, c) => n + pick(c), 0);
    const j = journal({
      headline: "The division has played a great many matches.",
      basis: {
        source: "division",
        matches_played: sum((c) => c.counts.played),
        matches_total: sum((c) => c.counts.total),
      },
    });
    expect(claim(j)?.verdict).toBe("contradicted");
    // And the headline is emptied, so the masthead falls back to its floor.
    expect(run(j).journal.headline).toBe("");
  });
});

describe("a comparative ranges across the conference lines", () => {
  const ranked = brief.across.goals_for as {
    programme: string;
    conference: string;
    goals: number;
  }[];
  const leader = ranked[0] as { programme: string; conference: string; goals: number };
  const rest = ranked.slice(1);
  // A side level with the leader is not beaten by it. Six conferences in, the
  // top of the ranking is shared (Midwestern State and UCCS on 11 at the RMAC
  // add), so the claim the brief can honestly make is over the sides the
  // leader out-scores — and the tie, named, must read as contradicted.
  const beaten = rest.filter((r) => r.goals < leader.goals);
  const level = rest.filter((r) => r.goals === leader.goals);

  test("the division's top scorer beats every programme it out-scores, in every conference", () => {
    // The claim only this page can make, and the one the conference validator
    // could never check: the rivals named here are in other files.
    const j = journal({
      headline: `No side in the division has scored more than ${leader.programme}.`,
      basis: {
        comparative: "greater_than_each",
        metric: "gf",
        programme: leader.programme,
        of: beaten.map((r) => r.programme),
      },
    });
    const c = claim(j);
    expect(c?.checker, JSON.stringify(c?.mismatches)).toBe("comparative");
    expect(c?.verdict, JSON.stringify(c?.mismatches)).toBe("verified");
  });

  test("and a side level with the leader is a contradiction, not a rival beaten", () => {
    if (level.length === 0) return; // No tie in today's data; nothing to hold.
    const j = journal({
      headline: `No side in the division has scored more than ${leader.programme}.`,
      basis: {
        comparative: "greater_than_each",
        metric: "gf",
        programme: leader.programme,
        of: level.map((r) => r.programme),
      },
    });
    expect(claim(j)?.verdict).toBe("contradicted");
  });

  test("and the same claim for a side that is not top is contradicted, not unresolvable", () => {
    // The failure that matters: a wrong comparative must fail as a wrong
    // comparative. Under the conference ctx it failed to RESOLVE, which reads
    // as "the validator did not understand" rather than "the claim is false".
    const notTop = rest[rest.length - 1] as { programme: string };
    const j = journal({
      headline: `No side in the division has scored more than ${notTop.programme}.`,
      basis: {
        comparative: "greater_than_each",
        metric: "gf",
        programme: notTop.programme,
        of: [leader.programme],
      },
    });
    const c = claim(j);
    expect(c?.verdict).toBe("contradicted");
    expect(c?.mismatches.join(" ")).toContain(leader.programme);
  });

  test("a programme's own record is read from its own conference's file", () => {
    // The shared checker, under the division's ctx. Pick a programme from the
    // LAST conference in the list, so a ctx that quietly used the first
    // season's file would fail to resolve it.
    const last = seasons[seasons.length - 1] as (typeof seasons)[number];
    const slug = last.fixtures.programmes[0]?.slug as string;
    const record = brief.across.records.find((r) => r.programme === slug);
    const j = journal({
      headline: "A record read from the right file.",
      basis: {
        programme: slug,
        wins: record?.wins ?? 0,
        draws: record?.draws ?? 0,
        losses: record?.losses ?? 0,
      },
    });
    expect(claim(j)?.verdict, JSON.stringify(claim(j)?.mismatches)).toBe("verified");
  });
});

describe("the division's ctx refuses to stand in for one conference", () => {
  test("a claim naming no conference cannot ask when 'the table' opens", () => {
    // Three answers, and the page prints all three. A division claim has to
    // say which, and the checker says so rather than picking one.
    const j = journal({
      headline: "Conference play begins soon.",
      basis: { conference_opens: "2026-09-11" },
    });
    expect(claim(j)?.verdict).toBe("contradicted");
    expect(claim(j)?.mismatches.join(" ")).toContain("must name the conference");
  });

  test("and naming it resolves to that conference's own date", () => {
    const first = brief.across.openers[0] as { conference: string; opens_on: string };
    const j = journal({
      headline: "The division's first table goes live before the others.",
      basis: { conference: first.conference, conference_opens: first.opens_on },
    });
    expect(claim(j)?.verdict).toBe("verified");
  });
});

describe("what a missing basis means, and what it does not", () => {
  test("a lede with no basis stands, and is put up for review", () => {
    // The conference headline's contract, kept: no basis is not evidence of
    // falsehood, and emptying a true sentence for lacking a receipt would make
    // the page prefer its floor over a correct story. What it gets instead is
    // a REVIEW line for every numeral nothing recomputed.
    const j = journal({ headline: "Something true, for all anyone here can tell." });
    const result = run(j);
    expect(result.report.claims[0]?.verdict).toBe("unverifiable");
    expect(result.journal.headline).toBe(j.headline);
  });

  test("but a numeral in it with nothing behind it is named", () => {
    const j = journal({ headline: "Fourteen sides in the division are still unbeaten." });
    expect(run(j).report.review.find((r) => r.path === "headline")?.unbacked).toContain("14");
  });

  test("and a basis no checker recognises DOES empty it", () => {
    // The difference that matters. Citing nothing is a gap; citing something
    // unreadable is a claim dressed as an audited one, and the masthead has a
    // floor beneath it that is always true.
    const j = journal({
      headline: "A claim resting on a key nobody can read.",
      basis: { vibes: 3 },
    });
    const result = run(j);
    expect(result.report.claims[0]?.verdict).toBe("unverifiable");
    expect(result.journal.headline).toBe("");
  });

  test("a dropped headline takes its dek with it", () => {
    // They are one lede. A dek exists to stand the headline up, and left alone
    // it is a sentence supporting nothing.
    const j = journal({
      headline: "A claim resting on a key nobody can read.",
      dek: "And a second sentence standing under it.",
      basis: { vibes: 3 },
    });
    expect(run(j).journal.dek).toBeUndefined();
  });
});

describe("a dek that is the headline with the words moved", () => {
  test("is dropped, and the headline stands with the journal", () => {
    const j = journal({
      headline: "Harding have scored more goals than any other side in the division.",
      dek: "More goals than any other side in the division: Harding have scored them.",
    });
    const result = validateNationalJournal(j, seasons, "test", CHECKERS);
    expect(result.journal.headline).toBe(j.headline);
    expect(result.journal.dek).toBeUndefined();
    const claim = result.report.claims.find((c) => c.checker === "words_moved");
    expect(claim).toMatchObject({ path: "dek", label: "restatement", dropped: true });
    expect(result.report.review.some((r) => r.path === "dek")).toBe(false);
  });

  test("a dek that stands the headline up is kept", () => {
    const j = journal({
      headline: "Nothing decided anywhere yet.",
      dek: "Every conference is still inside its non-conference weeks.",
    });
    const result = validateNationalJournal(j, seasons, "test", CHECKERS);
    expect(result.journal.dek).toBe(j.dek);
    expect(result.report.claims.some((c) => c.checker === "words_moved")).toBe(false);
  });
});
