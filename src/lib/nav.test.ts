// The shared header's list and the home ledger's fold, held to their rules.

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { homeSeasons } from "./home.ts";
import { conferenceEntries, ledgerSummary, splitLedger } from "./nav.ts";

describe("the conference entries are the collected conferences, in config order", () => {
  const seasons = homeSeasons();
  const entries = conferenceEntries(seasons);

  test("every collected conference exactly once, none invented, config order kept", () => {
    expect(entries.map((e) => e.key)).toEqual(seasons.map((s) => s.key));
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
    const order = entries.map((e) => site.conferences.indexOf(e.key));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const e of entries) expect(site.conferences).toContain(e.key);
  });

  test("the abbreviation is the file's and the name is the config's", () => {
    for (const e of entries) {
      const season = seasons.find((s) => s.key === e.key);
      expect(e.abbr).toBe(season?.fixtures.conference ?? "");
      expect(e.name).toBe(site.conferenceNames[e.key] ?? e.abbr);
    }
  });

  test("a conference the data home did not collect is absent, not broken", () => {
    const dropped = seasons.slice(1);
    const keys = conferenceEntries(dropped).map((e) => e.key);
    expect(keys).toEqual(dropped.map((s) => s.key));
    expect(keys).not.toContain(seasons[0]?.key ?? "");
  });
});

describe("the ledger folds past the cap and never entirely", () => {
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  test("the first cap rows stay open and the rest fold, in order", () => {
    const { open, folded } = splitLedger(rows, 8);
    expect(open).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(folded).toEqual([9, 10]);
  });

  test("a cap at or past the length folds nothing", () => {
    expect(splitLedger(rows, 10).folded).toEqual([]);
    expect(splitLedger(rows, 50).open).toEqual(rows);
    expect(splitLedger([], 8)).toEqual({ open: [], folded: [] });
  });

  test("a cap below one still leaves one row in the open", () => {
    expect(splitLedger(rows, 0).open).toEqual([1]);
    expect(splitLedger(rows, -3).open).toEqual([1]);
  });

  test("the site's cap is a positive whole number", () => {
    expect(Number.isInteger(site.homeLedgerCap)).toBe(true);
    expect(site.homeLedgerCap).toBeGreaterThan(0);
  });

  test("the summary counts every result of the night, not the folded remainder", () => {
    expect(ledgerSummary(63)).toBe("All 63 results");
  });
});
