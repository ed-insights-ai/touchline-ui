// The rib's published contract fixtures, parsed under this site's schemas.
//
// The rib (keelson-rib-touchline) publishes one sample document per schema
// it writes across the repo boundary, under contracts/, and its own CI holds
// every writer to the shape its fixture carries. This file is the other half:
// every fixture must parse under the strict schema this site reads with. So a
// writer-side addition fails in the rib's CI (the fixture must move with the
// writer), and a reader-side tightening fails here, in this repo's gate, and
// never on the published build.
//
// The fixtures are read from the rib checkout, never copied here: a copy is a
// second source of truth that drifts. `TOUCHLINE_CONTRACTS_DIR` names the
// directory; the default is a sibling checkout of the rib next to this repo.
// When neither exists the suite skips with the path it looked at in the test
// name, so an absent checkout reads as absent and not as green.
//
// The journal is out of scope here: its writer is this repo, not the rib.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { COVERAGE_SCHEMA, coverageFileSchema } from "./coverage.ts";
import {
  FIXTURES_SCHEMA,
  fixturesFileSchema,
  MATCHES_SCHEMA,
  matchesFileSchema,
  ROSTERS_SCHEMA,
  rostersFileSchema,
  STATS_SCHEMA,
  statsFileSchema,
} from "./model.ts";
import { PROGRAMMES_SCHEMA, programmesFileSchema } from "./programmes.ts";

/** The one file every published contracts/ directory carries. */
const MARKER = "coverage-1.json";
const SIBLING = resolve(import.meta.dir, "..", "..", "..", "keelson-rib-touchline", "contracts");

function expandTilde(p: string): string {
  return p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p;
}

/** Where the rib's contracts/ directory is, mirroring how `dataRoot()` reads
 *  `TOUCHLINE_DATA_DIR`. Being pointed at the rib checkout rather than its
 *  contracts/ directory is a likely enough slip to recognise. */
export function contractsDir(): string {
  const override = process.env.TOUCHLINE_CONTRACTS_DIR?.trim();
  const dir = resolve(override ? expandTilde(override) : SIBLING);
  if (!existsSync(join(dir, MARKER)) && existsSync(join(dir, "contracts", MARKER))) {
    return join(dir, "contracts");
  }
  return dir;
}

const dir = contractsDir();
const present = existsSync(join(dir, MARKER));

/** One fixture per schema this site reads; the file name carries the version. */
const contracts = [
  { file: "coverage-1.json", schema: COVERAGE_SCHEMA, parse: coverageFileSchema.parse },
  { file: "fixtures-2.json", schema: FIXTURES_SCHEMA, parse: fixturesFileSchema.parse },
  { file: "rosters-1.json", schema: ROSTERS_SCHEMA, parse: rostersFileSchema.parse },
  { file: "stats-1.json", schema: STATS_SCHEMA, parse: statsFileSchema.parse },
  { file: "matches-1.json", schema: MATCHES_SCHEMA, parse: matchesFileSchema.parse },
  { file: "programmes-2.json", schema: PROGRAMMES_SCHEMA, parse: programmesFileSchema.parse },
] as const;

function read(file: string): unknown {
  return JSON.parse(readFileSync(join(dir, file), "utf8"));
}

describe("the rib's contract fixtures parse under this site's schemas", () => {
  if (!present) {
    test.skip(`skipped: no rib contracts directory at ${dir} (set TOUCHLINE_CONTRACTS_DIR)`, () => {});
    return;
  }

  for (const c of contracts) {
    test(`${c.file} parses as ${c.schema}`, () => {
      const raw = read(c.file);
      // The file name and the schema string inside it must agree, so a fixture
      // renamed for a new version cannot be parsed as the old one by mistake.
      expect((raw as { schema: string }).schema).toBe(c.schema);
      expect(() => c.parse(raw)).not.toThrow();
    });
  }

  test("the coverage fixture promises verified: unchanged, and the site admits it", () => {
    // The first re-collect to write this marker (GLVC, 2026-09-02) was refused
    // by this site's strict schema; the fixture now carries it so the refusal
    // cannot recur without failing here first.
    const file = coverageFileSchema.parse(read("coverage-1.json"));
    const reused = Object.values(file.cells).filter((cell) => cell.verified === "unchanged");
    expect(reused.length).toBeGreaterThan(0);
  });

  test("the fixtures fixture carries the live status no collect has produced yet", () => {
    const file = fixturesFileSchema.parse(read("fixtures-2.json"));
    expect(file.fixtures.some((f) => f.status === "live")).toBe(true);
  });

  test("the matches fixture carries a card of unknown colour", () => {
    const file = matchesFileSchema.parse(read("matches-1.json"));
    const cards = Object.values(file.matches).flatMap((m) => m.cards ?? []);
    expect(cards.some((card) => card.type === "unknown")).toBe(true);
  });
});
