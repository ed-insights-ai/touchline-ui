/**
 * The one regeneration, over a fake model and the real validator.
 *
 * A validate that dropped a line for restating another gets the writer asked
 * once more; the second reply is validated on the same terms. Two fakes: one
 * that hands back the same journal twice — the CACC morning, where the
 * headline stood and the dek came back word for word — and one that fixes
 * the featured line. The first keeps the drop; the second has none.
 */

import { describe, expect, test } from "bun:test";
import { loadSeason } from "../../src/lib/derive.ts";
import type { JournalFile } from "../../src/lib/journal.ts";
import { generateThenValidate, type Steps } from "./regenerate.ts";
import { restatementDrops, validateJournal } from "./validate.ts";

const season = loadSeason("gac");
const fixture = season.fixtures.fixtures[0];
const ref = fixture ? `${fixture.date} ${fixture.home} v ${fixture.away}` : "";

const dek =
  "Georgian Court have won once and drawn twice, scoring seven and conceding four, and their " +
  "first win came at home to Staten Island after draws on the road at Bentley and Saint " +
  "Michael's. Bridgeport's record is the same shape, a win and two draws. Every other " +
  "programme in the CACC has already been beaten.";

function journal(featuredLine: string): JournalFile {
  return {
    schema: "touchline.journal/1",
    season: 2026,
    gender: "men",
    conference: "GAC",
    generated_at: "2026-09-04T12:00:00Z",
    data_collected_at: season.collectedAt,
    headline: "Bridgeport and Georgian Court alone still unbeaten",
    dek,
    findings: [],
    players_to_watch: [],
    featured: { last_match: { fixture_ref: ref, line: featuredLine } },
  } as JournalFile;
}

const restating =
  "Georgian Court's first win, and their first match at home, after draws at Bentley and at Saint Michael's.";
const fixed = "Staten Island had not conceded before the second half at Georgian Court.";

/** A model that answers each ask from a script, and a validate over what it
 *  last wrote. Records what each ask was told. */
function fake(replies: JournalFile[]): Steps & { asked: string[][]; written: JournalFile[] } {
  let slot: JournalFile | null = null;
  const asked: string[][] = [];
  const written: JournalFile[] = [];
  return {
    asked,
    written,
    mayRetry: true,
    generate: async (restatements) => {
      asked.push([...restatements]);
      slot = replies.shift() ?? null;
      if (!slot) return 1;
      written.push(slot);
      return 0;
    },
    validate: () => {
      if (!slot) throw new Error("validate before generate");
      const { report } = validateJournal(slot, season, "test");
      return { code: 0, restated: restatementDrops(report.claims) };
    },
  };
}

describe("the one regeneration", () => {
  test("a model that returns the same journal twice keeps the drop", async () => {
    const steps = fake([journal(restating), journal(restating)]);
    const out = await generateThenValidate(steps);
    expect(out.retried).toBe(true);
    expect(out.retryFailed).toBe(false);
    expect(out.unresolved.map((r) => r.path)).toEqual(["featured.last_match.line"]);
    // Asked exactly twice, the second time with the report's own words.
    expect(steps.asked).toEqual([[], ["featured.last_match.line restates dek (0.90)"]]);
  });

  test("a model that fixes it leaves no drop", async () => {
    const steps = fake([journal(restating), journal(fixed)]);
    const out = await generateThenValidate(steps);
    expect(out.retried).toBe(true);
    expect(out.unresolved).toEqual([]);
    expect(steps.asked).toHaveLength(2);
  });

  test("a first reply with nothing restated is never asked again", async () => {
    const steps = fake([journal(fixed), journal(fixed)]);
    const out = await generateThenValidate(steps);
    expect(out.retried).toBe(false);
    expect(steps.asked).toEqual([[]]);
  });

  test("a replayed or dry run cannot ask again, and the drop stands as reported", async () => {
    const steps = fake([journal(restating), journal(fixed)]);
    steps.mayRetry = false;
    const out = await generateThenValidate(steps);
    expect(out.retried).toBe(false);
    expect(out.unresolved.map((r) => r.path)).toEqual(["featured.last_match.line"]);
    expect(steps.asked).toHaveLength(1);
  });

  test("a retry whose ask fails leaves the first reply standing, and says so", async () => {
    const steps = fake([journal(restating)]);
    const out = await generateThenValidate(steps);
    expect(out.retried).toBe(true);
    expect(out.retryFailed).toBe(true);
    expect(out.code).toBe(0);
    expect(out.unresolved.map((r) => r.path)).toEqual(["featured.last_match.line"]);
  });
});
