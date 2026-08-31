#!/usr/bin/env bun
// The journal CLI — the AI step of the pipeline, and the validator that keeps
// it honest. Run by the collect pipeline, never by the site build.
//
//   bun run journal brief    --conference gac
//   bun run journal generate --conference gac [--model <id>] [--dry-run]
//   bun run journal validate --conference gac [--write]
//   bun run journal run      --conference gac        # generate, then validate
//
// Nothing here ever writes into the data home.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Season } from "../../src/lib/derive.ts";
import { loadSeason } from "../../src/lib/derive.ts";
import { type JournalFile, journalFileSchema } from "../../src/lib/journal.ts";
import { site } from "../../src/site.config.ts";
import { buildBrief, fixtureIndex } from "./brief.ts";
import { buildPrompt } from "./prompt.ts";
import { validateJournal } from "./validate.ts";

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
  };
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

function generate(args: Args, season: Season): number {
  const brief = buildBrief(season);
  const prompt = buildPrompt({
    brief,
    fixtures: fixtureIndex(season),
    previous: readJournal(journalPath(args, season)),
  });
  mkdirSync(args.out, { recursive: true });

  if (args.dryRun) {
    const promptFile = join(args.out, `journal-${keyOf(season)}.prompt.txt`);
    const briefFile = join(args.out, `journal-${keyOf(season)}.brief.json`);
    writeFileSync(promptFile, prompt);
    writeFileSync(briefFile, `${JSON.stringify(brief, null, 2)}\n`);
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
  writeFileSync(journalPath(args, season), `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(`${keyOf(season)}: wrote ${journalPath(args, season)}`);
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
  writeFileSync(reportPath(args, season), `${JSON.stringify(report, null, 2)}\n`);

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
    writeFileSync(path, `${JSON.stringify(cleaned, null, 2)}\n`);
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
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
