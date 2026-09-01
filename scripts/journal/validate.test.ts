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
import {
  boxScoreGaps,
  fixtureCount,
  goalsForByProgramme,
  loadSeason,
  memberSlugs,
  programmeCounts,
  unresolved,
} from "../../src/lib/derive.ts";
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

  test("a hyphenated compound is one number, vouched for as one (tui-k17)", () => {
    const j = journal({
      headline: "Twenty-eight conceded across the conference.",
      lede_basis: { goals_against: 28 },
    });
    expect(paths(j)).not.toContain("headline");
    const k = journal({ headline: "Twenty-eight conceded across the conference." });
    expect(unbacked(k, "headline")).toEqual(["28"]);
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

/** A one-finding journal, for the checkers that judge a single basis. */
function finding(label: string, text: string, basis: Record<string, unknown>): JournalFile {
  return journal({ findings: [{ label, text, basis }] } as Partial<JournalFile>);
}

const claimOf = (j: JournalFile) =>
  validateJournal(j, season, "test").report.claims.find((c) => c.path === "findings[0]");

// The data home is re-collected daily and these tests read it live. Every
// expectation below is computed from the same collect the checker reads, or is
// true by construction whatever the collect holds — never pinned to a snapshot.
describe("comparative claims", () => {
  const rows = goalsForByProgramme(season);
  const top = rows[0];
  const bottom = rows[rows.length - 1];
  if (!top || !bottom) throw new Error("the conference has no programmes to compare");

  test("greater_than_each is held to the ranked data, beside the plain figures", () => {
    const j = finding("derived", `${top.slug} outscore ${bottom.slug}.`, {
      comparative: "greater_than_each",
      metric: "gf",
      programme: top.slug,
      of: [bottom.slug],
      gf: top.goals,
      [`${bottom.slug}_gf`]: bottom.goals,
    });
    const c = claimOf(j);
    expect(c?.checker).toContain("comparative");
    // The figure checkers ride along on the same basis.
    expect(c?.checker).toContain("team_goals");
    expect(c?.verdict).toBe(top.goals > bottom.goals ? "verified" : "contradicted");
  });

  test("the sum no collect can satisfy contradicts, and the claim drops", () => {
    // The weakest reading can never exceed the strongest two others together:
    // each of them holds at least its value. True whatever the data says.
    const j = finding("derived", "A claim the ranked data must refuse.", {
      comparative: "greater_than_sum",
      metric: "gf",
      programme: bottom.slug,
      of_any: 2,
    });
    const { journal: out, report } = validateJournal(j, season, "test");
    const c = report.claims.find((x) => x.path === "findings[0]");
    expect(c?.verdict).toBe("contradicted");
    expect(c?.dropped).toBe(true);
    expect(out.findings).toHaveLength(0);
  });

  test('"any two others" is held against the strongest two, and the note names them', () => {
    const others = rows.filter((r) => r.slug !== top.slug);
    const strongest = (others[0]?.goals ?? 0) + (others[1]?.goals ?? 0);
    const j = finding("derived", "More than any two other programmes together.", {
      comparative: "greater_than_sum",
      metric: "gf",
      programme: top.slug,
      of_any: 2,
    });
    const c = claimOf(j);
    expect(c?.verdict).toBe(top.goals > strongest ? "verified" : "contradicted");
    expect(c?.note).toContain(others[0]?.slug ?? "");
  });

  test('"played" ranges over finals with a published score, the vocabulary\'s reading', () => {
    const [a, b] = [...memberSlugs(season)].sort();
    if (!a || !b) throw new Error("the conference has fewer than two members");
    const own = programmeCounts(season, a).played;
    const theirs = programmeCounts(season, b).played;
    const j = finding("derived", `${a} have played more than ${b}.`, {
      comparative: "greater_than_each",
      metric: "played",
      programme: a,
      of: [b],
    });
    expect(claimOf(j)?.verdict).toBe(own > theirs ? "verified" : "contradicted");
  });

  test("an unknown relation is named, never guessed at", () => {
    const j = finding("derived", "A relation nothing defines.", {
      comparative: "at_least_sum",
      metric: "gf",
      programme: top.slug,
      of_any: 2,
    });
    const c = claimOf(j);
    expect(c?.verdict).toBe("contradicted");
    expect(c?.mismatches.join(" ")).toContain("not a relation");
  });
});

describe("set claims", () => {
  const u = unresolved(season);
  const silences = [...u.finalsWithoutScore, ...u.pastDateNoResult];

  test("the set's count is recomputed, not trusted", () => {
    const good = finding("observed", "The silences, counted.", {
      set: "silences",
      count: silences.length,
    });
    expect(claimOf(good)?.verdict).toBe("verified");
    const bad = finding("observed", "The silences, miscounted.", {
      set: "silences",
      count: silences.length + 1,
    });
    const c = claimOf(bad);
    expect(c?.verdict).toBe("contradicted");
    expect(c?.dropped).toBe(true);
  });

  test("all_of checks every member of the set, not the count alone", () => {
    // Whoever the first silence involves: the claim that ALL of them are that
    // programme's is exactly as true as the data makes it today.
    const candidate = silences[0]?.home ?? [...memberSlugs(season)][0];
    if (!candidate) throw new Error("no programme to test against");
    const holds =
      silences.length > 0 && silences.every((f) => f.home === candidate || f.away === candidate);
    const j = finding("observed", `All are ${candidate}'s.`, {
      set: "silences",
      all_of: candidate,
      count: silences.length,
    });
    expect(claimOf(j)?.verdict).toBe(holds ? "verified" : "contradicted");
  });

  test("a programme outside every silence contradicts an all_of", () => {
    // If the set is empty the claim is vacuous and contradicts too — a reader
    // told "all of them are X's" about nothing has still been misled.
    const involved = new Set(silences.flatMap((f) => [f.home, f.away]));
    const outsider = [...memberSlugs(season)].find((s) => !involved.has(s));
    if (!outsider) throw new Error("every member is in a silence — pick a different conference");
    const j = finding("observed", `All are ${outsider}'s.`, {
      set: "silences",
      all_of: outsider,
    });
    expect(claimOf(j)?.verdict).toBe("contradicted");
  });

  test("box-score gaps are a set the validator can enumerate", () => {
    const j = finding("observed", "The gaps, counted.", {
      set: "box_score_gaps",
      count: boxScoreGaps(season).length,
    });
    expect(claimOf(j)?.verdict).toBe("verified");
  });

  test("a set nothing enumerates is named, never guessed at", () => {
    const j = finding("observed", "A set nothing defines.", {
      set: "postponements",
      count: 2,
    });
    const c = claimOf(j);
    expect(c?.verdict).toBe("contradicted");
    expect(c?.mismatches.join(" ")).toContain("not a set");
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

/**
 * The wire — the conference's one line on the national page's card.
 *
 * It is one sentence standing for a whole conference on a page that links to
 * three of them, so it is held exactly as a finding is: a basis is recomputed
 * and a contradicted one drops the line. The card then falls back to the
 * season headline it used to render, which is the same fallback an old journal
 * with no wire at all takes.
 */
describe("the wire is checked like a finding, and drops like one", () => {
  const wireOf = (j: JournalFile) => validateJournal(j, season, "test").journal.wire;

  test("a wire whose basis the data contradicts is dropped", () => {
    const j = journal({
      wire: {
        line: "Harding have scored more than anyone else in the conference.",
        basis: { programme: "harding", gf: 999, ga: 0 },
      },
    });
    expect(wireOf(j)).toBeUndefined();
  });

  test("a wire whose basis the data confirms survives", () => {
    const row = goalsForByProgramme(season)[0] as { slug: string; goals: number; conceded: number };
    const j = journal({
      wire: {
        line: "A line whose figures are the published ones.",
        basis: { programme: row.slug, gf: row.goals, ga: row.conceded },
      },
    });
    expect(wireOf(j)?.line).toBe("A line whose figures are the published ones.");
  });

  test("a wire with no basis is not dropped — it has no figure to be wrong about", () => {
    // The featured lines' lesson, applied deliberately rather than by omission:
    // an unverifiable claim is dropped, and a sentence carrying no number is
    // not an unverifiable claim. A wire naming a state or a run is allowed to
    // say so without inventing a basis to satisfy a checker.
    const j = journal({ wire: { line: "Nobody in the conference has kept a clean sheet yet." } });
    expect(wireOf(j)?.line).toBe("Nobody in the conference has kept a clean sheet yet.");
  });

  // The season's total is used rather than a literal because a figure the
  // dateline already vouches for is not unbacked — the conference opens on the
  // 17th, so a wire saying "seventeen" is not the audit's business.
  const total = fixtureCount(season);
  const line = `A conference of ${total} matches, and the table is still empty.`;

  test("but a number in it with nothing behind it is put up for review", () => {
    expect(unbacked(journal({ wire: { line } }), "wire")).toContain(String(total));
  });

  test("and the same number passes once the wire's own basis vouches for it", () => {
    const j = journal({ wire: { line, basis: { source: "fixtures", total } } });
    // The wire has to still be there for its silence to mean anything: a
    // dropped claim produces no review line either, and would pass this by
    // never taking part in it.
    expect(wireOf(j)?.line).toBe(line);
    expect(paths(j)).not.toContain("wire");
  });

  test("a journal with no wire at all validates exactly as it did", () => {
    // The back-compatibility promise, held rather than asserted: every journal
    // on disk the day this landed had no wire, and none of them may change.
    const j = journal({ headline: "A headline with no numbers in it at all." });
    const result = validateJournal(j, season, "test");
    expect(result.journal.wire).toBeUndefined();
    expect(result.report.claims.some((c) => c.path === "wire")).toBe(false);
    expect(result.report.review.some((r) => r.path === "wire")).toBe(false);
  });
});
