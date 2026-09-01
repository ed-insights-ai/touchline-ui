#!/usr/bin/env bun
// The journal CLI — the AI step of the pipeline, and the validator that keeps
// it honest. Run by the collect pipeline, never by the site build.
//
//   bun run journal brief    --conference gac
//   bun run journal generate --conference gac [--model <id>] [--dry-run]
//   bun run journal validate --conference gac [--write]
//   bun run journal run      --conference gac        # generate, then validate
//
// The division's own journal is the same four commands with --national in
// place of --conference. It is a separate scope, not a fourth conference: it
// reads every collected file at once and writes one journal beside the others.
//
//   bun run journal brief    --national
//
// Nothing here ever writes into the data home.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Season } from "../../src/lib/derive.ts";
import { loadSeason } from "../../src/lib/derive.ts";
import { homeSeasons } from "../../src/lib/home.ts";
import {
  type JournalFile,
  journalFileSchema,
  type NationalJournalFile,
  nationalJournalFile,
  nationalJournalSchema,
} from "../../src/lib/journal.ts";
import { site } from "../../src/site.config.ts";
import { buildBrief, fixtureIndex } from "./brief.ts";
import { buildNationalBrief } from "./national.ts";
import { validateNationalJournal } from "./national-validate.ts";
import { buildPrompt } from "./prompt.ts";
import { CHECKERS, validateJournal } from "./validate.ts";
import { standingDate, standingNote } from "./wire.ts";

interface Args {
  command: string;
  conferences: string[];
  model?: string;
  modelCommand: string;
  out: string;
  dryRun: boolean;
  from?: string;
  write: boolean;
  strict: boolean;
  /** The division's journal rather than a conference's. */
  national: boolean;
}

function parseArgs(argv: string[]): Args {
  const [command = "run", ...rest] = argv;
  const flag = (name: string): string | undefined => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const bool = (name: string): boolean => rest.includes(`--${name}`);
  const conference = flag("conference");
  return {
    command,
    conferences: bool("all") || !conference ? [...site.conferences] : conference.split(","),
    model: flag("model"),
    modelCommand: flag("command") ?? "claude",
    out: flag("out") ?? join(process.cwd(), "journal"),
    dryRun: bool("dry-run"),
    from: flag("from"),
    write: bool("write"),
    strict: bool("strict"),
    national: bool("national"),
  };
}

/** Write JSON the way the site's own formatter prints it. `JSON.stringify`
 *  expands every array and object; biome packs whatever fits its line width —
 *  so a plain stringify left `just verify` red after every regeneration until
 *  someone reformatted by hand (tl-38r). Formatting is part of writing, at the
 *  source. A formatter failure never costs the file itself: the journal is the
 *  record of a model call, and unformatted beats absent — warn and keep it. */
function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  const fmt = spawnSync("bunx", ["biome", "format", "--write", path], { encoding: "utf8" });
  if (fmt.error || fmt.status !== 0) {
    const why = fmt.error?.message ?? fmt.stderr?.trim() ?? `exit ${fmt.status}`;
    console.warn(`  WARNING: biome did not format ${path} (${why}) — 'bun run check' will be red.`);
  }
}

const keyOf = (s: Season): string => `${s.fixtures.season}-${s.fixtures.gender}-${s.key}`;
const journalPath = (args: Args, s: Season): string => join(args.out, `journal-${keyOf(s)}.json`);
const reportPath = (args: Args, s: Season): string =>
  join(args.out, `journal-${keyOf(s)}.validation.json`);

function readJournal(path: string): JournalFile | null {
  if (!existsSync(path)) return null;
  return journalFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

/** Pull one JSON object out of a model's reply, fenced or not. A model that
 *  answered with prose around its JSON is still answerable; one that answered
 *  with no JSON at all is a failure we name rather than paper over. */
function extractJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  const body = fenced?.[1] ?? reply;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("the model's reply contained no JSON object");
  return JSON.parse(body.slice(start, end + 1));
}

/** Ask a model. Model-agnostic on purpose: any command that reads a prompt on
 *  stdin and writes a reply on stdout will do. */
function askModel(args: Args, prompt: string): string {
  const argv = ["-p", ...(args.model ? ["--model", args.model] : [])];
  const run = spawnSync(args.modelCommand, argv, {
    input: prompt,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (run.error) throw new Error(`could not run \`${args.modelCommand}\`: ${run.error.message}`);
  if (run.status !== 0)
    throw new Error(`\`${args.modelCommand}\` exited ${run.status}: ${run.stderr?.trim() ?? ""}`);
  return run.stdout;
}

/** The wire's last-updated date, over the previous journal on disk. The rule
 *  itself lives in wire.ts, because the national headline will want it too. */
function stampWire(next: JournalFile, previous: JournalFile | null, season: Season): void {
  if (!next.wire) return;
  next.wire.updated = standingDate(next.wire.line, previous?.wire, season.asOf);
  next.wire.displaced_by = standingNote(next.wire.line, previous?.wire, next.wire.displaced_by);
}

function generate(args: Args, season: Season): number {
  const brief = buildBrief(season);
  const previous = readJournal(journalPath(args, season));
  const prompt = buildPrompt({ brief, fixtures: fixtureIndex(season), previous });
  mkdirSync(args.out, { recursive: true });

  if (args.dryRun) {
    const promptFile = join(args.out, `journal-${keyOf(season)}.prompt.txt`);
    const briefFile = join(args.out, `journal-${keyOf(season)}.brief.json`);
    writeFileSync(promptFile, prompt);
    writeJson(briefFile, brief);
    console.log(
      `${keyOf(season)}: dry run — wrote ${promptFile} and ${briefFile}, called no model.`,
    );
    return 0;
  }

  const reply = args.from ? readFileSync(args.from, "utf8") : askModel(args, prompt);
  let parsed: JournalFile;
  try {
    parsed = journalFileSchema.parse(extractJson(reply));
  } catch (err) {
    console.error(
      `${keyOf(season)}: the reply is not a touchline.journal/1 — ${(err as Error).message}`,
    );
    const rejected = join(args.out, `journal-${keyOf(season)}.rejected.txt`);
    writeFileSync(rejected, reply);
    console.error(`  the reply is at ${rejected}; nothing was written to the journal.`);
    return 1;
  }
  // The two files spell the same instant differently ("…Z" and "…+00:00"),
  // so compare moments — a false staleness warning teaches people to ignore it.
  const wrote = Date.parse(parsed.data_collected_at);
  const have = Date.parse(season.collectedAt);
  if (
    Number.isNaN(wrote) || Number.isNaN(have)
      ? parsed.data_collected_at !== season.collectedAt
      : wrote !== have
  ) {
    console.warn(
      `${keyOf(season)}: the journal names collect ${parsed.data_collected_at}, the data home holds ${season.collectedAt}.`,
    );
  }
  stampWire(parsed, previous, season);
  writeJson(journalPath(args, season), parsed);
  console.log(`${keyOf(season)}: wrote ${journalPath(args, season)}`);
  if (parsed.wire) {
    const carried = previous?.wire?.line === parsed.wire.line;
    console.log(
      `  wire ${carried ? "stands" : "displaced"}${parsed.wire.updated ? `, last changed ${parsed.wire.updated}` : ", last change unknown"}`,
    );
  }
  return 0;
}

function validate(args: Args, season: Season): number {
  const path = journalPath(args, season);
  const journal = readJournal(path);
  if (!journal) {
    console.log(`${keyOf(season)}: no journal at ${path} — nothing to validate.`);
    return 0;
  }
  const { journal: cleaned, report } = validateJournal(
    journal,
    season,
    `journal-${keyOf(season)}.json`,
  );
  mkdirSync(args.out, { recursive: true });
  writeJson(reportPath(args, season), report);

  const t = report.totals;
  console.log(
    `${keyOf(season)}: ${t.checked} claims — ${t.verified} verified, ${t.contradicted} contradicted, ${t.unverifiable} unverifiable, ${t.dropped} dropped.`,
  );
  for (const n of report.normalizations) {
    console.log(`  NORMALIZE ${n.path}`);
    console.log(`       "${n.from}"  →  "${n.to}"`);
  }
  for (const c of report.claims.filter((c) => c.note && !c.path.startsWith("featured"))) {
    console.log(`  NOTE ${c.path}: ${c.note}`);
  }
  for (const c of report.claims.filter((c) => c.unchecked_figures?.length)) {
    console.log(
      `  UNCHECKED ${c.path}: ${c.unchecked_figures?.join(", ")} — no checker reads these`,
    );
  }
  for (const c of report.claims.filter((c) => c.dropped)) {
    console.log(`  DROP ${c.path} [${c.label}] ${c.text.slice(0, 72)}`);
    for (const m of c.mismatches) console.log(`       ${m}`);
  }
  // REVIEW is not a verdict. It is the validator saying: a reader will believe
  // this number and nothing here recomputed it.
  for (const r of report.review) {
    console.log(`  REVIEW ${r.path} — unbacked ${r.unbacked.join(", ")}`);
    console.log(`       ${r.text.length > 96 ? `${r.text.slice(0, 96)}…` : r.text}`);
  }
  if (report.review.length > 0) {
    console.log(
      `  ${report.review.length} passage${report.review.length === 1 ? "" : "s"} carry numbers no basis accounts for.`,
    );
  }
  console.log(`  report: ${reportPath(args, season)}`);

  if (args.write) {
    writeJson(path, cleaned);
    console.log(`  wrote the validated journal back to ${path}`);
  } else if (t.dropped > 0 || report.normalizations.length > 0) {
    console.log(
      "  (dry run — pass --write to publish the journal with these claims removed and refs rewritten)",
    );
  }
  return args.strict && t.dropped > 0 ? 1 : 0;
}

function brief(season: Season): number {
  console.log(JSON.stringify(buildBrief(season), null, 2));
  return 0;
}

const nationalPath = (args: Args): string =>
  join(args.out, nationalJournalFile(site.season, site.gender));

function readNationalJournal(path: string): NationalJournalFile | null {
  if (!existsSync(path)) return null;
  return nationalJournalSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function validateNational(args: Args): number {
  const path = nationalPath(args);
  const journal = readNationalJournal(path);
  if (!journal) {
    console.log(`national: no journal at ${path} — nothing to validate.`);
    return 0;
  }
  const seasons = homeSeasons();
  const { journal: cleaned, report } = validateNationalJournal(
    journal,
    seasons,
    nationalJournalFile(site.season, site.gender),
    CHECKERS,
  );
  mkdirSync(args.out, { recursive: true });
  const reportFile = join(
    args.out,
    `${nationalJournalFile(site.season, site.gender).replace(/\.json$/, "")}.validation.json`,
  );
  writeJson(reportFile, report);

  const t = report.totals;
  console.log(
    `national: ${t.checked} claims — ${t.verified} verified, ${t.contradicted} contradicted, ${t.unverifiable} unverifiable, ${t.dropped} dropped.`,
  );
  for (const c of report.claims) {
    if (c.note) console.log(`  NOTE ${c.path}: ${c.note}`);
    if (!c.dropped) continue;
    console.log(`  DROP ${c.path} — the masthead falls back to its floor`);
    for (const m of c.mismatches) console.log(`       ${m}`);
  }
  for (const r of report.review) {
    console.log(`  REVIEW ${r.path} — unbacked ${r.unbacked.join(", ")}`);
    console.log(`       ${r.text.length > 96 ? `${r.text.slice(0, 96)}…` : r.text}`);
  }
  console.log(`  report: ${reportFile}`);

  if (args.write && t.dropped > 0) {
    // A national journal is its lede and nothing else, so a dropped lede
    // leaves no journal — and writing an empty headline back would leave a
    // file the schema itself refuses to parse, which the next generate would
    // die on. Removing it is the honest state: there is no journal, and the
    // masthead renders the floor it renders when none was ever written.
    rmSync(path, { force: true });
    console.log(`  the lede did not survive — removed ${path}; the masthead falls back`);
  } else if (args.write) {
    writeJson(path, cleaned);
    console.log(`  wrote the validated journal back to ${path}`);
  } else if (t.dropped > 0) {
    console.log("  (dry run — pass --write to remove the journal whose lede did not survive)");
  }
  return args.strict && t.dropped > 0 ? 1 : 0;
}

/** The division's commands. A separate scope from the conference loop below:
 *  it reads every collected file at once, so it runs once rather than once per
 *  conference, and it is deliberately runnable on its own — the prompt has to
 *  be evaluated against the real brief without touching the cadence. */
function national(args: Args): number {
  switch (args.command) {
    case "brief":
      console.log(JSON.stringify(buildNationalBrief(homeSeasons()), null, 2));
      return 0;
    case "validate":
      return validateNational(args);
    default:
      console.error(
        `"${args.command} --national" is not in this checkout — the division's prompt and its generation land with their own patch.`,
      );
      return 2;
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.national) process.exit(national(args));
  let code = 0;
  for (const key of args.conferences) {
    let season: Season;
    try {
      season = loadSeason(key);
    } catch (err) {
      console.error(`${key}: ${(err as Error).message}`);
      code = 1;
      continue;
    }
    switch (args.command) {
      case "brief":
        code = brief(season) || code;
        break;
      case "generate":
        code = generate(args, season) || code;
        break;
      case "validate":
        code = validate(args, season) || code;
        break;
      case "run":
        code = generate(args, season) || validate(args, season) || code;
        break;
      default:
        console.error(`unknown command "${args.command}" — brief | generate | validate | run`);
        process.exit(2);
    }
  }
  process.exit(code);
}

main();
