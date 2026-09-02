#!/usr/bin/env bun
// The journal CLI — the AI step of the pipeline, and the validator that keeps
// it honest. Run by the collect pipeline, never by the site build.
//
//   bun run journal brief    --conference gac
//   bun run journal generate --conference gac [--model <id>] [--dry-run]
//   bun run journal validate --conference gac [--write]
//   bun run journal run      --conference gac        # generate, then validate
//
// Under --all (or several keys in --conference) the conferences run side by
// side, at most --concurrency N at a time (default 4), each validating the
// moment its own reply is in. One conference's failure is reported under its
// key and costs nobody else their run; the exit code says whether any failed,
// and a timing block at the end says what each one cost.
//
// The division's own journal is the same four commands with --national in
// place of --conference. It is a separate scope, not a fourth conference: it
// reads every collected file at once and writes one journal beside the others
// — so it runs on its own, AFTER every conference journal has validated,
// because its brief reads them.
//
//   bun run journal brief    --national
//   bun run journal generate --national [--dry-run]
//   bun run journal validate --national [--write]
//   bun run journal run      --national
//
// Nothing here ever writes into the data home.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Season } from "../../src/lib/derive.ts";
import { loadSeason } from "../../src/lib/derive.ts";
import { homeSeasons, nationalAsOf } from "../../src/lib/home.ts";
import {
  type JournalFile,
  journalFileSchema,
  type NationalJournalFile,
  nationalJournalFile,
  nationalJournalSchema,
} from "../../src/lib/journal.ts";
import { site } from "../../src/site.config.ts";
import { buildBrief, fixtureIndex } from "./brief.ts";
import { buildNationalBrief, nationalFixtureIndex } from "./national.ts";
import { buildNationalPrompt } from "./national-prompt.ts";
import { validateNationalJournal } from "./national-validate.ts";
import { pool } from "./pool.ts";
import { buildPrompt } from "./prompt.ts";
import { CHECKERS, type ValidationTiming, validateJournal } from "./validate.ts";
import { ledeKey, standingDate, standingLede, standingNote } from "./wire.ts";

const COMMANDS = new Set(["brief", "generate", "validate", "run"]);

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
  /** How many conferences may be asking a model at once. */
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const [command = "run", ...rest] = argv;
  const flag = (name: string): string | undefined => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const bool = (name: string): boolean => rest.includes(`--${name}`);
  const conference = flag("conference");
  const concurrency = flag("concurrency");
  const cap = concurrency === undefined ? 4 : Number(concurrency);
  if (!Number.isInteger(cap) || cap < 1) {
    console.error(`--concurrency takes a whole number of at least 1, not "${concurrency}"`);
    process.exit(2);
  }
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
    concurrency: cap,
  };
}

/** One task's console. With several conferences in flight their lines would
 *  land interleaved, so each task keeps its own and puts them out in one
 *  piece when it settles. Every line's wording is what it always was; only
 *  the moment it reaches the terminal moved. A task running alone writes
 *  straight through, so a single conference still reports as it goes. */
class Lines {
  private readonly held: ["log" | "warn" | "error", string][] = [];
  private readonly buffered: boolean;

  constructor(buffered: boolean) {
    this.buffered = buffered;
  }

  log(line: string): void {
    this.put("log", line);
  }

  warn(line: string): void {
    this.put("warn", line);
  }

  error(line: string): void {
    this.put("error", line);
  }

  flush(): void {
    for (const [via, line] of this.held.splice(0)) console[via](line);
  }

  private put(via: "log" | "warn" | "error", line: string): void {
    if (this.buffered) this.held.push([via, line]);
    else console[via](line);
  }
}

/** Write JSON the way the site's own formatter prints it. `JSON.stringify`
 *  expands every array and object; biome packs whatever fits its line width —
 *  so a plain stringify left `just verify` red after every regeneration until
 *  someone reformatted by hand (tl-38r). Formatting is part of writing, at the
 *  source. A formatter failure never costs the file itself: the journal is the
 *  record of a model call, and unformatted beats absent — warn and keep it. */
function writeJson(path: string, value: unknown, lines: Lines): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  const fmt = spawnSync("bunx", ["biome", "format", "--write", path], { encoding: "utf8" });
  if (fmt.error || fmt.status !== 0) {
    const why = fmt.error?.message ?? fmt.stderr?.trim() ?? `exit ${fmt.status}`;
    lines.warn(`  WARNING: biome did not format ${path} (${why}) — 'bun run check' will be red.`);
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

/** A reply longer than this is not a journal, whatever else it is. */
const REPLY_CAP = 32 * 1024 * 1024;

/** Ask a model. Model-agnostic on purpose: any command that reads a prompt on
 *  stdin and writes a reply on stdout will do. Asynchronous so that several
 *  conferences can be asking at once: the reply streams into a buffer while
 *  the other tasks carry on, and the promise settles when the command does. */
function askModel(args: Args, prompt: string): Promise<string> {
  const argv = ["-p", ...(args.model ? ["--model", args.model] : [])];
  return new Promise((resolve, reject) => {
    const child = spawn(args.modelCommand, argv, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    let failed = false;
    const fail = (message: string): void => {
      failed = true;
      reject(new Error(message));
    };
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > REPLY_CAP) {
        child.kill();
        fail(`could not run \`${args.modelCommand}\`: the reply passed ${REPLY_CAP >> 20} MiB`);
        return;
      }
      out.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    // A command that exits before reading its prompt closes the pipe under
    // us; the close handler names the exit, so the EPIPE itself is not news.
    child.stdin.on("error", () => {});
    child.on("error", (e) => fail(`could not run \`${args.modelCommand}\`: ${e.message}`));
    child.on("close", (status) => {
      if (failed) return;
      if (status !== 0) {
        fail(
          `\`${args.modelCommand}\` exited ${status}: ${Buffer.concat(err).toString("utf8").trim()}`,
        );
        return;
      }
      resolve(Buffer.concat(out).toString("utf8"));
    });
    child.stdin.end(prompt);
  });
}

/** The wire's last-updated date, over the previous journal on disk. The rule
 *  itself lives in wire.ts, because the national headline will want it too. */
function stampWire(next: JournalFile, previous: JournalFile | null, season: Season): void {
  if (!next.wire) return;
  next.wire.updated = standingDate(next.wire.line, previous?.wire, season.asOf);
  next.wire.displaced_by = standingNote(next.wire.line, previous?.wire, next.wire.displaced_by);
}

/** The lede's last-changed date, over the previous journal on disk. The wire's
 *  rule, over the headline and the dek together. Reports which happened. */
function stampLede(
  next: JournalFile,
  previous: JournalFile | null,
  season: Season,
): "written" | "stands" | "displaced" {
  const before = previous
    ? { headline: previous.headline, dek: previous.dek, updated: previous.lede_updated }
    : undefined;
  const stamped = standingLede(next, before, season.asOf);
  next.lede_updated = stamped.updated;
  next.displaced_by = stamped.displaced_by;
  return previous === null ? "written" : stamped.stood ? "stands" : "displaced";
}

/** What the runner has measured by the time validate stamps the report. */
interface Measured {
  started_at: string;
  /** performance.now() when the scope's task began. */
  started: number;
  generate_ms: number | null;
  concurrency: number;
}

/** The report's timing block as validate assembles it: the steps so far, and
 *  the wall from the task's start to this instant. The report and the journal
 *  are written after this, so those two writes are the one part of the task
 *  no figure here covers. */
function stamp(m: Measured, validateStart: number): Omit<ValidationTiming, "concurrency"> {
  const now = performance.now();
  return {
    started_at: m.started_at,
    generate_ms: m.generate_ms,
    validate_ms: Math.round(now - validateStart),
    wall_ms: Math.round(now - m.started),
  };
}

/** The `timing` block of the report already at `path`, if one is there. A
 *  sidecar that does not parse is about to be replaced; its timing was the
 *  one thing it held that this pass cannot recompute, and it is gone. */
function priorTiming<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const prior = JSON.parse(readFileSync(path, "utf8"));
    return prior && typeof prior.timing === "object" && prior.timing !== null
      ? (prior.timing as T)
      : undefined;
  } catch {
    return undefined;
  }
}

async function generate(args: Args, season: Season, lines: Lines): Promise<number> {
  const brief = buildBrief(season);
  const previous = readJournal(journalPath(args, season));
  const prompt = buildPrompt({ brief, fixtures: fixtureIndex(season), previous });
  mkdirSync(args.out, { recursive: true });

  if (args.dryRun) {
    const promptFile = join(args.out, `journal-${keyOf(season)}.prompt.txt`);
    const briefFile = join(args.out, `journal-${keyOf(season)}.brief.json`);
    writeFileSync(promptFile, prompt);
    writeJson(briefFile, brief, lines);
    lines.log(`${keyOf(season)}: dry run — wrote ${promptFile} and ${briefFile}, called no model.`);
    return 0;
  }

  const reply = args.from ? readFileSync(args.from, "utf8") : await askModel(args, prompt);
  let parsed: JournalFile;
  try {
    parsed = journalFileSchema.parse(extractJson(reply));
  } catch (err) {
    lines.error(
      `${keyOf(season)}: the reply is not a touchline.journal/1 — ${(err as Error).message}`,
    );
    const rejected = join(args.out, `journal-${keyOf(season)}.rejected.txt`);
    writeFileSync(rejected, reply);
    lines.error(`  the reply is at ${rejected}; nothing was written to the journal.`);
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
    lines.warn(
      `${keyOf(season)}: the journal names collect ${parsed.data_collected_at}, the data home holds ${season.collectedAt}.`,
    );
  }
  const lede = stampLede(parsed, previous, season);
  stampWire(parsed, previous, season);
  writeJson(journalPath(args, season), parsed, lines);
  lines.log(`${keyOf(season)}: wrote ${journalPath(args, season)}`);
  lines.log(
    `  lede ${lede}${parsed.lede_updated ? `, last changed ${parsed.lede_updated}` : ", last change unknown"}`,
  );
  if (parsed.displaced_by) lines.log(`  displaced by: ${parsed.displaced_by}`);
  if (parsed.wire) {
    const carried = previous?.wire?.line === parsed.wire.line;
    lines.log(
      `  wire ${carried ? "stands" : "displaced"}${parsed.wire.updated ? `, last changed ${parsed.wire.updated}` : ", last change unknown"}`,
    );
  }
  return 0;
}

function validate(args: Args, season: Season, lines: Lines, measured?: Measured): number {
  const path = journalPath(args, season);
  const journal = readJournal(path);
  if (!journal) {
    lines.log(`${keyOf(season)}: no journal at ${path} — nothing to validate.`);
    return 0;
  }
  const validateStart = performance.now();
  const { journal: cleaned, report } = validateJournal(
    journal,
    season,
    `journal-${keyOf(season)}.json`,
  );
  const sidecar = reportPath(args, season);
  // A run stamps what it measured. A validate on its own called no model and
  // has nothing truer to write, so the last run's block stays on the report
  // rather than being erased by the pass that re-reads it (tl-4an.1).
  const timing = measured
    ? { ...stamp(measured, validateStart), concurrency: measured.concurrency }
    : priorTiming<ValidationTiming>(sidecar);
  if (timing) report.timing = timing;
  mkdirSync(args.out, { recursive: true });
  writeJson(sidecar, report, lines);

  const t = report.totals;
  lines.log(
    `${keyOf(season)}: ${t.checked} claims — ${t.verified} verified, ${t.contradicted} contradicted, ${t.unverifiable} unverifiable, ${t.dropped} dropped.`,
  );
  for (const n of report.normalizations) {
    lines.log(`  NORMALIZE ${n.path}`);
    lines.log(`       "${n.from}"  →  "${n.to}"`);
  }
  for (const c of report.claims.filter((c) => c.note && !c.path.startsWith("featured"))) {
    lines.log(`  NOTE ${c.path}: ${c.note}`);
  }
  for (const c of report.claims.filter((c) => c.unchecked_figures?.length)) {
    lines.log(`  UNCHECKED ${c.path}: ${c.unchecked_figures?.join(", ")} — no checker reads these`);
  }
  for (const c of report.claims.filter((c) => c.dropped)) {
    lines.log(`  DROP ${c.path} [${c.label}] ${c.text.slice(0, 72)}`);
    for (const m of c.mismatches) lines.log(`       ${m}`);
  }
  // REVIEW is not a verdict. It is the validator saying: a reader will believe
  // this number and nothing here recomputed it.
  for (const r of report.review) {
    lines.log(`  REVIEW ${r.path} — unbacked ${r.unbacked.join(", ")}`);
    lines.log(`       ${r.text.length > 96 ? `${r.text.slice(0, 96)}…` : r.text}`);
  }
  if (report.review.length > 0) {
    lines.log(
      `  ${report.review.length} passage${report.review.length === 1 ? "" : "s"} carry numbers no basis accounts for.`,
    );
  }
  lines.log(`  report: ${sidecar}`);

  if (args.write) {
    writeJson(path, cleaned, lines);
    lines.log(`  wrote the validated journal back to ${path}`);
  } else if (t.dropped > 0 || report.normalizations.length > 0) {
    lines.log(
      "  (dry run — pass --write to publish the journal with these claims removed and refs rewritten)",
    );
  }
  return args.strict && t.dropped > 0 ? 1 : 0;
}

function brief(season: Season, lines: Lines): number {
  lines.log(JSON.stringify(buildBrief(season), null, 2));
  return 0;
}

const nationalPath = (args: Args): string =>
  join(args.out, nationalJournalFile(site.season, site.gender));

function readNationalJournal(path: string): NationalJournalFile | null {
  if (!existsSync(path)) return null;
  return nationalJournalSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

/** The division's headline is a standing line, on the wire's terms and with
 *  the same module deciding: the date carries forward when the text does, and
 *  the note describing a displacement is kept only when one happened. */
function stampNational(
  next: NationalJournalFile,
  previous: NationalJournalFile | null,
  collectDate: string,
): void {
  // Keyed on the whole lede, headline and dek together, as the conference
  // lede is: a dek rewritten under a standing headline is a change a reader
  // sees, and the stamp must move with it (tui-uvo).
  const before = previous
    ? { line: ledeKey(previous.headline, previous.dek), updated: previous.updated }
    : undefined;
  const line = ledeKey(next.headline, next.dek);
  next.updated = standingDate(line, before, collectDate);
  next.displaced_by = standingNote(line, before, next.displaced_by);
}

async function generateNational(args: Args, lines: Lines): Promise<number> {
  const seasons = homeSeasons();
  const brief = buildNationalBrief(seasons);
  const previous = readNationalJournal(nationalPath(args));
  const prompt = buildNationalPrompt({
    brief,
    fixtures: nationalFixtureIndex(seasons),
    previous,
  });
  mkdirSync(args.out, { recursive: true });

  const stem = nationalJournalFile(site.season, site.gender).replace(/\.json$/, "");
  if (args.dryRun) {
    const promptFile = join(args.out, `${stem}.prompt.txt`);
    const briefFile = join(args.out, `${stem}.brief.json`);
    writeFileSync(promptFile, prompt);
    writeJson(briefFile, brief, lines);
    lines.log(`national: dry run — wrote ${promptFile} and ${briefFile}, called no model.`);
    return 0;
  }

  const reply = args.from ? readFileSync(args.from, "utf8") : await askModel(args, prompt);
  let parsed: NationalJournalFile;
  try {
    parsed = nationalJournalSchema.parse(extractJson(reply));
  } catch (err) {
    lines.error(`national: the reply is not a touchline.national/1 — ${(err as Error).message}`);
    const rejected = join(args.out, `${stem}.rejected.txt`);
    writeFileSync(rejected, reply);
    lines.error(`  the reply is at ${rejected}; nothing was written to the journal.`);
    return 1;
  }
  stampNational(parsed, previous, nationalAsOf(seasons));
  writeJson(nationalPath(args), parsed, lines);
  lines.log(`national: wrote ${nationalPath(args)}`);
  lines.log(
    `  headline ${previous?.headline === parsed.headline ? "stands" : "displaced"}${parsed.updated ? `, last changed ${parsed.updated}` : ", last change unknown"}`,
  );
  if (parsed.displaced_by) lines.log(`  displaced by: ${parsed.displaced_by}`);
  return 0;
}

function validateNational(args: Args, lines: Lines, measured?: Measured): number {
  const path = nationalPath(args);
  const journal = readNationalJournal(path);
  if (!journal) {
    lines.log(`national: no journal at ${path} — nothing to validate.`);
    return 0;
  }
  const validateStart = performance.now();
  const seasons = homeSeasons();
  const { journal: cleaned, report } = validateNationalJournal(
    journal,
    seasons,
    nationalJournalFile(site.season, site.gender),
    CHECKERS,
  );
  const reportFile = join(
    args.out,
    `${nationalJournalFile(site.season, site.gender).replace(/\.json$/, "")}.validation.json`,
  );
  // On the conference report's terms: the run's own measurement, or the
  // last one carried forward.
  const timing = measured
    ? stamp(measured, validateStart)
    : priorTiming<Omit<ValidationTiming, "concurrency">>(reportFile);
  if (timing) report.timing = timing;
  mkdirSync(args.out, { recursive: true });
  writeJson(reportFile, report, lines);

  const t = report.totals;
  lines.log(
    `national: ${t.checked} claims — ${t.verified} verified, ${t.contradicted} contradicted, ${t.unverifiable} unverifiable, ${t.dropped} dropped.`,
  );
  for (const c of report.claims) {
    if (c.note) lines.log(`  NOTE ${c.path}: ${c.note}`);
    if (!c.dropped) continue;
    lines.log(`  DROP ${c.path} — the masthead falls back to its floor`);
    for (const m of c.mismatches) lines.log(`       ${m}`);
  }
  for (const r of report.review) {
    lines.log(`  REVIEW ${r.path} — unbacked ${r.unbacked.join(", ")}`);
    lines.log(`       ${r.text.length > 96 ? `${r.text.slice(0, 96)}…` : r.text}`);
  }
  lines.log(`  report: ${reportFile}`);

  if (args.write && t.dropped > 0) {
    // A national journal is its lede and nothing else, so a dropped lede
    // leaves no journal — and writing an empty headline back would leave a
    // file the schema itself refuses to parse, which the next generate would
    // die on. Removing it is the honest state: there is no journal, and the
    // masthead renders the floor it renders when none was ever written.
    rmSync(path, { force: true });
    lines.log(`  the lede did not survive — removed ${path}; the masthead falls back`);
  } else if (args.write) {
    writeJson(path, cleaned, lines);
    lines.log(`  wrote the validated journal back to ${path}`);
  } else if (t.dropped > 0) {
    lines.log("  (dry run — pass --write to remove the journal whose lede did not survive)");
  }
  return args.strict && t.dropped > 0 ? 1 : 0;
}

/** One journal's commands over one scope — a conference, or the division —
 *  so the runner below measures, reports and recovers the same way for both.
 *  The division's is a separate scope, not a fourth conference: it reads
 *  every collected file at once, so it runs once rather than once per
 *  conference, and it is deliberately runnable on its own — the prompt has
 *  to be evaluated against the real brief without touching the cadence. */
interface Scope {
  key: string;
  brief(lines: Lines): number;
  generate(lines: Lines): Promise<number>;
  validate(lines: Lines, measured?: Measured): number;
}

const conferenceScope = (args: Args, season: Season): Scope => ({
  key: keyOf(season),
  brief: (lines) => brief(season, lines),
  generate: (lines) => generate(args, season, lines),
  validate: (lines, measured) => validate(args, season, lines, measured),
});

const nationalScope = (args: Args): Scope => ({
  key: "national",
  brief: (lines) => {
    lines.log(JSON.stringify(buildNationalBrief(homeSeasons()), null, 2));
    return 0;
  },
  generate: (lines) => generateNational(args, lines),
  validate: (lines, measured) => validateNational(args, lines, measured),
});

/** What one scope's task came to, for the exit code and the timing block. */
interface Outcome {
  key: string;
  code: number;
  /** The first line of the error a task threw, when it did not finish. */
  failed?: string;
  generate_ms: number | null;
  validate_ms: number | null;
  wall_ms: number;
}

/** Run the command over one scope: the steps in order, each timed, the
 *  console held until the scope settles, and any error caught here so that
 *  it costs this scope its run and nobody else theirs. `width` is how many
 *  scopes are running at once, which is what the report records and what
 *  decides whether the console has to be held. */
async function run(args: Args, scope: Scope, width: number): Promise<Outcome> {
  const lines = new Lines(width > 1);
  const started_at = new Date().toISOString();
  const started = performance.now();
  const outcome: Outcome = {
    key: scope.key,
    code: 0,
    generate_ms: null,
    validate_ms: null,
    wall_ms: 0,
  };
  // Each step's time is kept whether or not the step finished: a model call
  // that fails after fifty seconds cost fifty seconds, and the log should
  // say so. A dry run or a replayed reply asked no model, and its time is
  // then a fact about the disk, not the cost the cadence wants to know.
  const generate = async (): Promise<number> => {
    const from = performance.now();
    try {
      return await scope.generate(lines);
    } finally {
      if (!args.dryRun && !args.from) outcome.generate_ms = Math.round(performance.now() - from);
    }
  };
  const validate = (measured?: Measured): number => {
    const from = performance.now();
    try {
      return scope.validate(lines, measured);
    } finally {
      outcome.validate_ms = Math.round(performance.now() - from);
    }
  };
  try {
    switch (args.command) {
      case "brief":
        outcome.code = scope.brief(lines);
        break;
      case "generate":
        outcome.code = await generate();
        break;
      case "validate":
        outcome.code = validate();
        break;
      case "run":
        outcome.code =
          (await generate()) ||
          validate({ started_at, started, generate_ms: outcome.generate_ms, concurrency: width });
        break;
      default:
        throw new Error(`unknown command "${args.command}"`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lines.error(`${scope.key}: ${message}`);
    outcome.failed = message.split("\n", 1)[0] ?? message;
    outcome.code = 1;
  } finally {
    outcome.wall_ms = Math.round(performance.now() - started);
    lines.flush();
  }
  return outcome;
}

const secs = (ms: number | null): string =>
  (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`).padStart(6);

const span = (ms: number): string => {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** The run's cost, one line per scope and a total, printed once everything
 *  has settled so it lands in the cadence log beside the journal lines. The
 *  sequential estimate is the sum of the wall times: what the same run would
 *  have cost one conference at a time. */
function printTiming(outcomes: readonly Outcome[], under: string, total_ms: number): void {
  if (outcomes.length === 0) return;
  const width = Math.max(...outcomes.map((o) => o.key.length));
  console.log(`journal timing (${under})`);
  for (const o of outcomes) {
    const cells = `generate ${secs(o.generate_ms)}  validate ${secs(o.validate_ms)}  wall ${secs(o.wall_ms)}`;
    const tail = o.failed ? `   FAILED: ${o.failed}` : o.code ? `   exit ${o.code}` : "";
    console.log(`  ${o.key.padEnd(width + 4)}${cells}${tail}`);
  }
  const sequential = outcomes.reduce((sum, o) => sum + o.wall_ms, 0);
  console.log(`  total wall ${span(total_ms)}, sequential estimate ${span(sequential)}`);
}

function unknownCommand(command: string): number {
  console.error(`unknown command "${command}" — brief | generate | validate | run`);
  return 2;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!COMMANDS.has(args.command)) return unknownCommand(args.command);

  if (args.national) {
    const outcome = await run(args, nationalScope(args), 1);
    if (args.command !== "brief") printTiming([outcome], "national", outcome.wall_ms);
    return outcome.code;
  }

  // Every season first: a key that does not load is reported under its key
  // and the ones that do still run. The pool never sees a key that is not a
  // season.
  let code = 0;
  const seasons: Season[] = [];
  for (const key of args.conferences) {
    try {
      seasons.push(loadSeason(key));
    } catch (err) {
      console.error(`${key}: ${(err as Error).message}`);
      code = 1;
    }
  }

  // brief prints one JSON document per conference; side by side they would
  // be unreadable, and printing costs nothing worth sharing.
  const cap = args.command === "brief" ? 1 : args.concurrency;
  const width = Math.min(cap, seasons.length);
  const from = performance.now();
  const settled = await pool(seasons, cap, (season) =>
    run(args, conferenceScope(args, season), width),
  );
  const outcomes: Outcome[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // run() catches its own errors; this is the pool's word that one got
    // past it, and the conference is still one line in the account.
    const key = keyOf(seasons[i] as Season);
    const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
    console.error(`${key}: ${message}`);
    return {
      key,
      code: 1,
      failed: message.split("\n", 1)[0] ?? message,
      generate_ms: null,
      validate_ms: null,
      wall_ms: 0,
    };
  });
  if (args.command !== "brief") {
    printTiming(outcomes, `concurrency ${width}`, performance.now() - from);
  }
  return outcomes.some((o) => o.code !== 0) ? 1 : code;
}

process.exit(await main());
