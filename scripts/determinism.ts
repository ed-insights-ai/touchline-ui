/**
 * Prove the build is incremental: the deploy syncs dist/ to its host by
 * content, so a page whose data did not change must come out byte-identical.
 *
 *   bun scripts/determinism.ts [data-home]
 *   (default: $TOUCHLINE_DATA_DIR, else ../touchline-contracts/samples/d2-soccer)
 *
 * It copies the data home to a scratch directory and builds three times:
 *
 *   A, B  the same data twice. The only difference allowed is the build stamp,
 *         a <meta name="touchline-build"> on the home page and nowhere else.
 *   C     one scheduled game turned into a 2–1 final, with the file's
 *         collected_at moved later in the same day, as a collect would. The game's
 *         match page must change; besides it only the two sides' team pages,
 *         the build's freshness.js and the hub pages (every page that is not a
 *         team or match page) may. Every other team and match page — nearly
 *         all of the site's bytes — must be untouched.
 *
 * Exits non-zero on any violation, naming the files. The build honours the
 * same environment as `bun run build` (TOUCHLINE_GENDER, TOUCHLINE_NCAA_DIVISION…).
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const source = resolve(
  process.argv[2] ??
    process.env.TOUCHLINE_DATA_DIR ??
    join(import.meta.dir, "..", "..", "touchline-contracts", "samples", "d2-soccer"),
);
if (!existsSync(join(source, "data"))) {
  console.error(`no data home at ${source} (expected a data/ directory)`);
  process.exit(2);
}
const gender = process.env.TOUCHLINE_GENDER?.trim() || "men";
const scratch = mkdtempSync(join(tmpdir(), "touchline-determinism-"));
const STAMP = /<meta name="touchline-build" content="[^"]*">/g;

function build(home: string, out: string): void {
  const r = spawnSync("bun", ["run", "build"], {
    cwd: join(import.meta.dir, ".."),
    env: { ...process.env, TOUCHLINE_DATA_DIR: home, TOUCHLINE_OUT_DIR: out },
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`build into ${out} failed`);
  }
}

function hashes(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.set(relative(dir, p), createHash("sha256").update(readFileSync(p)).digest("hex"));
    }
  };
  walk(dir);
  return out;
}

function changed(a: Map<string, string>, b: Map<string, string>): string[] {
  const all = new Set([...a.keys(), ...b.keys()]);
  return [...all].filter((f) => a.get(f) !== b.get(f)).sort();
}

const failures: string[] = [];
try {
  const home = join(scratch, "home");
  cpSync(source, home, { recursive: true });

  // ── Same data, twice ────────────────────────────────────────────────────
  const [a, b] = [join(scratch, "a"), join(scratch, "b")];
  build(home, a);
  build(home, b);
  const ha = hashes(a);
  const same = changed(ha, hashes(b));
  for (const f of same) {
    const strip = (d: string) => readFileSync(join(d, f), "utf8").replace(STAMP, "");
    if (f !== "index.html" || strip(a) !== strip(b)) failures.push(`same data, ${f} differs`);
  }
  for (const f of ha.keys()) {
    if (
      f !== "index.html" &&
      f.endsWith(".html") &&
      readFileSync(join(a, f), "utf8").includes('name="touchline-build"')
    ) {
      failures.push(`${f} carries the build stamp (home page only)`);
    }
  }
  console.log(
    `same data:     ${same.length} of ${ha.size} files differ (${same.slice(0, 5).join(", ") || "none"}${same.length > 5 ? ", …" : ""})`,
  );

  // ── One game ────────────────────────────────────────────────────────────
  const fixturesDir = join(home, "data", "fixtures");
  const file = readdirSync(fixturesDir)
    .filter((f) => f.includes(`-${gender}-`) && f.endsWith(".json"))
    .sort()
    .find((f) =>
      JSON.parse(readFileSync(join(fixturesDir, f), "utf8")).fixtures.some(
        (x: { status: string }) => x.status === "scheduled",
      ),
    );
  if (!file) throw new Error(`no ${gender} fixtures file with a scheduled game in ${fixturesDir}`);
  const path = join(fixturesDir, file);
  const data = JSON.parse(readFileSync(path, "utf8"));
  const game = data.fixtures.find((x: { status: string }) => x.status === "scheduled");
  Object.assign(game, { status: "final", home_score: 2, away_score: 1 });
  // A later collect on the SAME day: the stamp every page used to print moves,
  // but "today" does not, so the date-driven changes a new day legitimately
  // brings (a game slipping into the past, the TODAY rule) stay out of it.
  const day = String(data.collected_at).slice(0, 10);
  const late = `${day}T23:59:00+00:00`;
  data.collected_at = data.collected_at === late ? `${day}T23:58:00+00:00` : late;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

  const c = join(scratch, "c");
  build(home, c);
  const moved = changed(ha, hashes(c));
  const slug = game.id.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const matchPage = (f: string) => /(^|\/)match\/[^/]+\/index\.html$/.test(f);
  const teamPage = (f: string) => /(^|\/)team\/[^/]+\/index\.html$/.test(f);
  const allowed = (f: string): boolean =>
    f === "freshness.js" ||
    f.endsWith(`/match/${slug}/index.html`) ||
    [game.home, game.away].some((s: string) => f.endsWith(`/team/${s}/index.html`)) ||
    (f.endsWith(".html") && !matchPage(f) && !teamPage(f));
  for (const f of moved.filter((f) => !allowed(f))) failures.push(`one game, ${f} changed`);
  if (!moved.some((f) => f.endsWith(`/match/${slug}/index.html`))) {
    failures.push(`one game, its match page /${slug}/ did not change`);
  }
  const leaves = [...ha.keys()].filter((f) => matchPage(f) || teamPage(f)).length;
  console.log(
    `one game (${game.id} in ${file}): ${moved.length} of ${ha.size} files differ, ` +
      `${moved.filter((f) => matchPage(f) || teamPage(f)).length} of ${leaves} team and match pages`,
  );
  for (const f of moved) console.log(`  ${f}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  process.exit(1);
}
console.log("ok — the build is deterministic and a one-game change stays local");
