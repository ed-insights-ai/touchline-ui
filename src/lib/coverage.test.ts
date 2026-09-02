import { describe, expect, test } from "bun:test";
import { COVERAGE_SCHEMA, coverageCellSchema, coverageFileSchema } from "./coverage.ts";

const cell = {
  season: 2026,
  gender: "men",
  programme: "lincoln",
  layer: "schedule",
  state: "complete",
  collector: "sidearm-live",
  confirmed_at: "2026-09-02T00:15:11+00:00",
  count: 18,
};

describe("the coverage contract admits what the collector writes", () => {
  test("a reused page's cell carries verified: unchanged", () => {
    // The first re-collect (GLVC 2024-2026, 2026-09-02) wrote this marker and
    // the whole data home stopped loading. A marker is not a state.
    const parsed = coverageCellSchema.parse({ ...cell, verified: "unchanged" });
    expect(parsed.verified).toBe("unchanged");
    expect(parsed.state).toBe("complete");
    expect(coverageCellSchema.parse(cell).verified).toBeUndefined();
  });

  test("and only that value; the contract stays strict for everything else", () => {
    expect(() => coverageCellSchema.parse({ ...cell, verified: "fresh" })).toThrow();
    expect(() => coverageCellSchema.parse({ ...cell, verifed: "unchanged" })).toThrow();
  });

  test("the file is version-guarded", () => {
    const file = { schema: COVERAGE_SCHEMA, updated_at: "2026-09-02T00:15:11+00:00", cells: {} };
    expect(coverageFileSchema.parse(file).schema).toBe(COVERAGE_SCHEMA);
    expect(() => coverageFileSchema.parse({ ...file, schema: "touchline.coverage/2" })).toThrow();
  });
});
