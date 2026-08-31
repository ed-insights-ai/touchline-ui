/**
 * The numeral audit.
 *
 * Two rounds of wrong figures reached the published site through prose no
 * checker could reach — "Twenty matches in" beside a page saying fifteen, and
 * "Seven matches carry no box-score link" when the honest count was one. Both
 * were spelled words, not digits, which is why nothing looking for numbers
 * had ever seen them.
 *
 * These tests hold the audit to the two things that make it worth reading: it
 * must catch a number nothing vouches for, and it must not cry wolf on one
 * that is accounted for.
 */

import { describe, expect, test } from "bun:test";
import { loadSeason, unresolved } from "../../src/lib/derive.ts";
import type { JournalFile } from "../../src/lib/journal.ts";
import { validateJournal } from "./validate.ts";

const season = loadSeason("gac");

/** A journal with only the fields under test filled in. */
function journal(over: Partial<JournalFile>): JournalFile {
  return {
    schema: "touchline.journal/1",
    season: 2026,
    gender: "men",
    conference: "GAC",
    generated_at: "2026-08-30T21:30:00Z",
    data_collected_at: season.collectedAt,
    headline: "A headline with no numbers in it at all.",
    findings: [],
    players_to_watch: [],
    ...over,
  } as JournalFile;
}

const paths = (j: JournalFile): string[] =>
  validateJournal(j, season, "test").report.review.map((r) => r.path);

const unbacked = (j: JournalFile, path: string): string[] =>
  validateJournal(j, season, "test").report.review.find((r) => r.path === path)?.unbacked ?? [];

describe("numbers a reader will believe", () => {
  test("a spelled number in the headline with no basis is flagged", () => {
    const j = journal({ headline: "Twenty matches in, the table is still empty." });
    expect(unbacked(j, "headline")).toContain("20");
  });

  test("the same number is not flagged once the lede basis vouches for it", () => {
    const j = journal({
      headline: "Twenty matches in, the table is still empty.",
      lede_basis: { matches_played: 20 },
    });
    expect(paths(j)).not.toContain("headline");
  });

  test("digits are caught as well as words", () => {
    const j = journal({ headline: "Seven matches carry no box score." });
    expect(unbacked(j, "headline")).toContain("7");
    const k = journal({ headline: "7 matches carry no box score." });
    expect(unbacked(k, "headline")).toContain("7");
  });

  test("a figure inside a basis string counts, so records vouch for their parts", () => {
    const j = journal({
      headline: "Seven wins, no draws, five losses.",
      lede_basis: { record: "7-0-5" },
    });
    expect(paths(j)).not.toContain("headline");
  });

  test("the season's own dateline is not a claim", () => {
    // The kicker's date and the day conference play opens vary with no
    // author's involvement; flagging them would bury the numerals that matter.
    const opens = "September 17";
    const j = journal({ headline: `Conference play opens on ${opens}.` });
    expect(paths(j)).not.toContain("headline");
  });

  test('"every one of them" is a pronoun, not a count', () => {
    const j = journal({ headline: "The silences are Lubbock Christian's, every one of them." });
    expect(paths(j)).not.toContain("headline");
  });

  test("a finding is audited against its own basis, not another claim's", () => {
    const j = journal({
      findings: [
        {
          label: "signal",
          text: "Ten of the eleven shots on target were saved.",
          basis: { saves: 10 },
        },
      ],
    });
    // 10 is vouched; the eleven the writer worked out is not.
    expect(unbacked(j, "findings[0].text")).toEqual(["11"]);
  });

  test("a claim whose every number is vouched produces no line at all", () => {
    // Read from the data home, not pinned: a stale basis is CONTRADICTED and
    // the claim is dropped, which also produces no review line — so this
    // would keep passing while testing nothing.
    const u = unresolved(season);
    const j = journal({
      findings: [
        {
          label: "observed",
          text: `${u.finalsWithoutScore.length} matches are marked final with no score.`,
          basis: {
            source: "fixtures",
            finals_without_score: u.finalsWithoutScore.length,
            past_date_no_result: u.pastDateNoResult.length,
          },
        },
      ],
    });
    expect(validateJournal(j, season, "test").report.totals.dropped).toBe(0);
    expect(paths(j)).toEqual([]);
  });
});

describe("the audit is advisory", () => {
  test("an unbacked numeral is never a reason to drop a claim", () => {
    // The basis is READ from the data home, not pinned to a snapshot of it.
    // A collect lands daily; this claim was written with the silences at 3
    // and 5, a collect moved them to 4 and 4, and the claim was then dropped
    // for being CONTRADICTED — leaving no prose for the audit to read and no
    // review line, so the test failed for the opposite of its own reason.
    const u = unresolved(season);
    const j = journal({
      findings: [
        {
          label: "observed",
          // 907 is the unbacked one: too large to be a date part, so no
          // collect can ever accidentally vouch for it.
          text: `${u.finalsWithoutScore.length} matches are marked final with no score, and 907 people watched the last of them.`,
          basis: {
            source: "fixtures",
            finals_without_score: u.finalsWithoutScore.length,
            past_date_no_result: u.pastDateNoResult.length,
          },
        },
      ],
    });
    const { journal: out, report } = validateJournal(j, season, "test");
    expect(report.totals.dropped).toBe(0);
    expect(out.findings).toHaveLength(1);
    expect(unbacked(j, "findings[0].text")).toContain("907");
  });
});
