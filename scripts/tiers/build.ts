#!/usr/bin/env bun
// The player-tiers build: ALGORITHM.md (version 2.2, with the contract 2.3
// rulings) over the data home.
//
//   bun run scripts/tiers/build.ts --out tiers/d2 --frozen-at 2026-11-16 [--require-clean]
//
// [N5] --require-clean refuses to build when the data home's working tree is
// modified (`git status --porcelain` not empty), so the commit the artifacts
// print carries no "+dirty". It is not the default: the collector leaves
// files modified between its runs.
//
// Reads every season 2022 to 2026, men and women, through the site's own
// loaders (src/lib/data.ts), fits the opponent model jointly over the five
// seasons, and writes one artifact per season and gender into --out. Beside
// it, in a `.debug/` directory next to --out (tiers/.debug, gitignored), it
// writes the comparison rows and the measured report the build log quotes.
// Those hold intermediate estimates and must never be committed or imported.
// Next to --out it also writes position-readings.json (tiers/, committed):
// every position label the build asked the site's reader about and the answer
// it got, which position-readings.test.ts holds the reader to afterwards.
// The report's acceptance 11.4 table needs a second computation of each gender
// with the roster pass of 4.2 switched off; nothing of it is written but the
// two counts.
//
// The data home is read-only: nothing here opens a file in it for writing,
// and an --out inside it is refused.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  dataHome,
  dataRoot,
  loadFixtures,
  loadMatches,
  loadRosters,
  loadStats,
} from "../../src/lib/data.ts";
import type { Gender } from "../../src/lib/model.ts";
import { loadProgrammes } from "../../src/lib/programmes.ts";
import type { TiersFile } from "../../src/lib/tiers.ts";
import { ncaaDivision } from "../../src/site.config.ts";
import { computeGender, FIRST_SEASON, LAST_SEASON } from "./compute.ts";
import type { ConferenceSeason } from "./matches.ts";
import { buildArtifact, serialize } from "./output.ts";
import { recordReadings, serializeReadings } from "./position.ts";
import { debugFile, reportMarkdown, statsChangesCsv } from "./report.ts";

const GENDERS: readonly Gender[] = ["men", "women"];

interface Args {
  out: string;
  frozenAt: string;
  requireClean: boolean;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseArgs(argv: readonly string[]): Args {
  let out: string | null = null;
  let frozenAt = today();
  let requireClean = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i] ?? null;
    else if (a === "--frozen-at") frozenAt = argv[++i] ?? "";
    else if (a === "--require-clean") requireClean = true;
    else throw new Error(`tiers: unknown argument ${a}`);
  }
  if (!out) throw new Error("tiers: --out <dir> is required (e.g. --out tiers/d2)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(frozenAt)) throw new Error("tiers: --frozen-at is YYYY-MM-DD");
  return { out: resolve(out), frozenAt, requireClean };
}

/** [N5] Throw when the data home's working tree is modified. */
export function assertClean(root: string): void {
  const status = execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
  if (status.trim() !== "") {
    throw new Error(
      `tiers: --require-clean: the data home ${root} has uncommitted changes:\n${status.trimEnd()}`,
    );
  }
}

/** HEAD of the data home, "+dirty" when its working tree is modified. */
export function dataCommit(root: string): string {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const head = git("rev-parse", "--short", "HEAD");
  return git("status", "--porcelain") === "" ? head : `${head}+dirty`;
}

/** The conference keys the data home holds a fixtures file for. */
function conferenceKeys(fixturesDir: string, season: number, gender: Gender): string[] {
  const prefix = `${season}-${gender}-`;
  return readdirSync(fixturesDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((f) => f.slice(prefix.length, -".json".length))
    .sort();
}

function loadGender(gender: Gender): Map<number, ConferenceSeason[]> {
  const home = dataHome();
  const data = new Map<number, ConferenceSeason[]>();
  for (let season = FIRST_SEASON; season <= LAST_SEASON; season++) {
    data.set(
      season,
      conferenceKeys(home.fixturesDir, season, gender).map((key) => ({
        key,
        fixtures: loadFixtures(season, gender, key, home),
        rosters: loadRosters(season, gender, key, home),
        stats: loadStats(season, gender, key, home),
        matches: loadMatches(season, gender, key, home),
      })),
    );
  }
  return data;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (ncaaDivision !== "d2") {
    console.log(`tiers: the contract covers Division II only; ${ncaaDivision} writes nothing.`);
    return;
  }
  const root = dataRoot();
  if (!relative(root, args.out).startsWith("..")) {
    throw new Error(`tiers: --out ${args.out} is inside the data home ${root}, which is read-only`);
  }
  if (args.requireClean) assertClean(root);
  const commit = dataCommit(root);
  const debugDir = join(dirname(args.out), ".debug");
  mkdirSync(args.out, { recursive: true });
  mkdirSync(debugDir, { recursive: true });

  const nicknames = new Map(
    Object.entries(loadProgrammes().programmes).map(([slug, row]) => [slug, row.nickname]),
  );
  const readings = recordReadings();
  const results = [];
  const before = [];
  const files: TiersFile[] = [];
  for (const gender of GENDERS) {
    const started = Date.now();
    const data = loadGender(gender);
    const loaded = Date.now();
    const g = computeGender(gender, data, { rosterPass: true, nicknames });
    console.log(
      `tiers: ${gender} loaded in ${((loaded - started) / 1000).toFixed(1)}s, computed in ${((Date.now() - loaded) / 1000).toFixed(1)}s`,
    );
    for (const r of g.seasons) {
      const artifact = buildArtifact({
        level: ncaaDivision,
        season: r.season,
        gender,
        frozenAt: args.frozenAt,
        dataCommit: commit,
        teams: r.teams,
        players: r.entries,
      });
      const name = `${r.season}-${gender}.json`;
      writeFileSync(join(args.out, name), serialize(artifact));
      writeFileSync(join(debugDir, name), `${JSON.stringify(debugFile(r))}\n`);
      files.push(artifact);
      console.log(`tiers: wrote ${join(args.out, name)}`);
    }
    results.push(g);
    before.push(computeGender(gender, data, { rosterPass: false, nicknames }));
  }
  const readingsPath = join(dirname(args.out), "position-readings.json");
  writeFileSync(readingsPath, serializeReadings(args.frozenAt, readings));
  console.log(`tiers: wrote ${readingsPath} (${readings.size} labels)`);
  const header = `Built ${args.frozenAt} from data home ${root} at ${commit}.\n\n`;
  writeFileSync(join(debugDir, "report.md"), header + reportMarkdown(results, files, before));
  writeFileSync(join(debugDir, "stats-penalties.csv"), statsChangesCsv(results));
  console.log(`tiers: report at ${join(debugDir, "report.md")}`);
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
