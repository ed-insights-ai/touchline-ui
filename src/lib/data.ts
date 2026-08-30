// Reading the data home. Everything here happens at build time; nothing in it
// ever runs in a browser.
//
// Two rules from ARCHITECTURE.md are enforced in this file and nowhere else:
// the data home is READ-ONLY to this repo (nothing here opens a file for
// writing), and a file whose `schema` string is not the one we understand is
// an error, not something to guess at.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type CoverageFile, coverageFileSchema } from "./coverage.ts";
import {
  type FixturesFile,
  fixturesFileSchema,
  type MatchesFile,
  matchesFileSchema,
  type RostersFile,
  rostersFileSchema,
  type StatsFile,
  statsFileSchema,
} from "./model.ts";

const DEFAULT_ROOT = join(homedir(), "keelson", "d2-soccer");

function expandTilde(p: string): string {
  return p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p;
}

/** The data home's root — the directory that CONTAINS `data/`.
 *
 *  `TOUCHLINE_DATA_DIR` names it, exactly as it does for the rib. Being
 *  pointed at the `data/` directory itself is a common enough slip that we
 *  recognise it rather than failing with an empty site. */
export function dataRoot(): string {
  const override = process.env.TOUCHLINE_DATA_DIR?.trim();
  const root = resolve(override ? expandTilde(override) : DEFAULT_ROOT);
  if (!existsSync(join(root, "data", "fixtures")) && existsSync(join(root, "fixtures"))) {
    return dirname(root);
  }
  return root;
}

export interface DataHome {
  root: string;
  fixturesDir: string;
  rostersDir: string;
  statsDir: string;
  matchesDir: string;
  coverageFile: string;
}

export function dataHome(root: string = dataRoot()): DataHome {
  return {
    root,
    fixturesDir: join(root, "data", "fixtures"),
    rostersDir: join(root, "data", "rosters"),
    statsDir: join(root, "data", "stats"),
    matchesDir: join(root, "data", "matches"),
    coverageFile: join(root, "data", "coverage.json"),
  };
}

/** One season-file key: `2026-men-gac`. */
export function seasonKey(season: number, gender: string, conference: string): string {
  return `${season}-${gender}-${conference}`;
}

// A build renders many pages from the same handful of files. Parse each once.
const cache = new Map<string, unknown>();

function readParsed<T>(path: string, parse: (raw: unknown) => T, required: boolean): T | null {
  const hit = cache.get(path);
  if (hit !== undefined) return hit as T | null;
  if (!existsSync(path)) {
    if (required) {
      throw new Error(
        `Touchline: required data file is missing: ${path}\n` +
          `  Set TOUCHLINE_DATA_DIR to the data home root (the directory containing data/).`,
      );
    }
    console.warn(`[touchline] absent, rendering its designed empty state: ${path}`);
    cache.set(path, null);
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Touchline: ${path} is not valid JSON — ${(err as Error).message}`);
  }
  let value: T;
  try {
    value = parse(raw);
  } catch (err) {
    // A reader that meets an unknown schema says so rather than guessing.
    const found =
      raw && typeof raw === "object" && "schema" in raw ? String((raw as any).schema) : "none";
    throw new Error(
      `Touchline: ${path} does not match the contract this site reads ` +
        `(schema found: ${found}).\n${(err as Error).message}`,
    );
  }
  cache.set(path, value);
  return value;
}

export function loadFixtures(
  season: number,
  gender: string,
  conference: string,
  home: DataHome = dataHome(),
): FixturesFile {
  const path = join(home.fixturesDir, `${seasonKey(season, gender, conference)}.json`);
  return readParsed(path, (r) => fixturesFileSchema.parse(r), true) as FixturesFile;
}

export function loadRosters(
  season: number,
  gender: string,
  conference: string,
  home: DataHome = dataHome(),
): RostersFile | null {
  const path = join(home.rostersDir, `${seasonKey(season, gender, conference)}.json`);
  return readParsed(path, (r) => rostersFileSchema.parse(r), false);
}

export function loadStats(
  season: number,
  gender: string,
  conference: string,
  home: DataHome = dataHome(),
): StatsFile | null {
  const path = join(home.statsDir, `${seasonKey(season, gender, conference)}.json`);
  return readParsed(path, (r) => statsFileSchema.parse(r), false);
}

export function loadMatches(
  season: number,
  gender: string,
  conference: string,
  home: DataHome = dataHome(),
): MatchesFile | null {
  const path = join(home.matchesDir, `${seasonKey(season, gender, conference)}.json`);
  return readParsed(path, (r) => matchesFileSchema.parse(r), false);
}

export function loadCoverage(home: DataHome = dataHome()): CoverageFile | null {
  return readParsed(home.coverageFile, (r) => coverageFileSchema.parse(r), false);
}
