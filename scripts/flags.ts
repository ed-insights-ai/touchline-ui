/**
 * Vendor the flag artwork the origin table places — and nothing else.
 *
 * A squad row marks a player whose published hometown is outside the United
 * States. The mark is that country's flag, and the artwork is SERVED FROM THIS
 * SITE: no CDN, no font, no emoji. Emoji were ruled out because England — the
 * largest origin on these rosters — has no reliable emoji flag; a CDN was ruled
 * out because a page that renders correctly only while someone else's host is
 * up is not a static site.
 *
 * The set is lipis/flag-icons (MIT). This copies the ~60 flags the authored
 * table can actually put on a row and deletes anything else it finds, so the
 * repo never carries 250 flags to draw a dozen. src/lib/origin.test.ts holds
 * the two sets equal in both directions, which is what makes a nation added to
 * the table without its artwork a failing test rather than a broken image.
 *
 *   bun scripts/flags.ts
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { optimize } from "svgo";
import { PLACED_NATIONS } from "../src/lib/origin.ts";

/**
 * A flag heavier than this is carrying artwork nobody can see.
 *
 * Five of the sixty-three are coats of arms drawn at full detail — Serbia's
 * double-headed eagle is 181 KB — and this site draws them fourteen pixels
 * wide. Above the threshold the file goes through svgo with reduced coordinate
 * precision, which changes the FILE and not the flag: same paths, same colours,
 * fewer decimal places than a 14px box could ever resolve. The rule is the
 * threshold and not a list of countries, so a heavy flag added later is trimmed
 * without anyone remembering to add it.
 */
const HEAVY = 40 * 1024;

/**
 * Whole numbers, and the reason that is safe.
 *
 * These flags are drawn in a user space hundreds of units wide — Serbia's is
 * 1350 — inside a 640-wide viewBox that this site then draws at 14px. One
 * whole unit is a hundredth of a pixel on the page. Rounding to it removes two
 * thirds of the file and nothing a screen can show; a precision of 1 removes
 * almost nothing, because the artwork already has at most one decimal in most
 * places. Verified by rendering: original and trimmed are identical at 14px
 * and at sixteen times that.
 *
 * The guard is what keeps the rule safe for a flag nobody has added yet. A
 * drawing whose whole coordinate space is a few units across would be
 * destroyed by integer rounding, so anything under a hundred units wide is
 * copied untouched however heavy it is.
 */
const PRECISION = { multipass: true, floatPrecision: 0 } as const;
const ROOM = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) /;
const roomy = (svg: string): boolean => Number(ROOM.exec(svg)?.[1] ?? 0) >= 100;

const SET = "node_modules/flag-icons";
const FROM = join(SET, "flags", "4x3");
const TO = join("public", "flags");
const NOTICE = "LICENSE.txt";

if (!existsSync(FROM)) {
  console.error(`no flag set at ${FROM} — run \`bun install\` first`);
  process.exit(1);
}

const version = (
  JSON.parse(readFileSync(join(SET, "package.json"), "utf8")) as { version?: string }
).version;

mkdirSync(TO, { recursive: true });

/**
 * What the set itself says each code is.
 *
 * The asset keys in the origin table are authored by hand, and a typo there is
 * the one error nothing else would catch: `si` for Slovenia and `sk` for
 * Slovakia are both real files, so a wrong key ships the wrong country's flag
 * under the right country's name and every test still passes. So the set's own
 * country list is read back and has to agree.
 */
const named = new Map<string, string>(
  (
    JSON.parse(readFileSync(join(SET, "country.json"), "utf8")) as {
      code: string;
      name: string;
    }[]
  ).map((c) => [c.code, c.name]),
);
const plain = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
/** Where the two lists spell the same country differently, and nothing more. */
const SPELT_DIFFERENTLY: Record<string, string> = {
  tr: "Türkiye",
  vc: "Saint Vincent and the Grenadines",
};

const wanted = new Set<string>();
let copied = 0;
let bytes = 0;
const missing: string[] = [];
const misnamed: string[] = [];

// Everything is checked before anything is written: a run that fails must not
// leave a half-vendored directory behind for the next one to puzzle over.
for (const nation of PLACED_NATIONS) {
  wanted.add(`${nation.iso}.svg`);
  if (!existsSync(join(FROM, `${nation.iso}.svg`))) {
    missing.push(`${nation.name} (${nation.iso})`);
    continue;
  }
  const theirs = named.get(nation.iso);
  if (theirs === undefined) {
    misnamed.push(`"${nation.iso}" is a file the set does not list as a country`);
  } else if (
    !plain(theirs).includes(plain(nation.name)) &&
    !plain(nation.name).includes(plain(theirs)) &&
    SPELT_DIFFERENTLY[nation.iso] !== theirs
  ) {
    misnamed.push(`"${nation.iso}" is ${theirs} to the set and ${nation.name} to the table`);
  }
}

if (missing.length > 0) {
  console.error(`the set has no flag for: ${missing.join(", ")}`);
  process.exit(1);
}

if (misnamed.length > 0) {
  console.error("the asset keys disagree with the set's own country list:");
  for (const line of misnamed) console.error(`  ${line}`);
  console.error("fix the key, or record the spelling in SPELT_DIFFERENTLY above.");
  process.exit(1);
}

const trimmed: { nation: string; iso: string; from: number; to: number }[] = [];

for (const nation of PLACED_NATIONS) {
  const source = join(FROM, `${nation.iso}.svg`);
  const raw = readFileSync(source);
  let svg = raw;
  const text = raw.toString("utf8");
  if (raw.length > HEAVY && roomy(text)) {
    svg = Buffer.from(optimize(text, { path: source, ...PRECISION }).data, "utf8");
    trimmed.push({ nation: nation.name, iso: nation.iso, from: raw.length, to: svg.length });
  }
  bytes += svg.length;
  const dest = join(TO, `${nation.iso}.svg`);
  // Only write a file that differs, so re-running leaves the tree alone.
  if (!existsSync(dest) || !readFileSync(dest).equals(svg)) {
    writeFileSync(dest, svg);
    copied++;
  }
}

// Anything else under public/flags is artwork nothing places any more. It goes,
// because "only what the table places" has to be true in both directions.
let pruned = 0;
for (const entry of readdirSync(TO)) {
  if (entry === NOTICE || wanted.has(entry)) continue;
  rmSync(join(TO, entry), { recursive: true });
  pruned++;
}

// The notice has to describe what is actually in this directory. The MIT
// licence permits modification; a notice claiming the artwork is unmodified
// once any of it has been optimized does not.
const svgoVersion = (
  JSON.parse(readFileSync(join("node_modules", "svgo", "package.json"), "utf8")) as {
    version?: string;
  }
).version;

writeFileSync(
  join(TO, NOTICE),
  [
    "The flags in this directory are from flag-icons.",
    "",
    `  flag-icons ${version ?? "(version unknown)"} — https://github.com/lipis/flag-icons`,
    "",
    trimmed.length === 0
      ? "They are copied unmodified."
      : [
          "All but the following are copied unmodified. These carry coats of arms",
          "drawn at a detail this site cannot show — it draws every flag fourteen",
          `pixels wide — so they are passed through svgo ${svgoVersion ?? ""} with reduced`.trimEnd(),
          "coordinate precision. The paths and the colours are the artwork's own;",
          "only the number of decimal places behind them has changed.",
          "",
          ...trimmed.map(
            (t) =>
              `  ${t.nation} (${t.iso}.svg): ${Math.round(t.from / 1024)} KB to ${Math.round(t.to / 1024)} KB`,
          ),
        ].join("\n"),
    "",
    readFileSync(join(SET, "LICENSE"), "utf8").trim(),
    "",
    "Touchline itself is Apache-2.0; this notice covers the artwork only.",
    "",
  ].join("\n"),
);

const saved = trimmed.reduce((n, t) => n + (t.from - t.to), 0);
console.log(
  `flags: ${PLACED_NATIONS.length} vendored (${Math.round(bytes / 1024)} KB), ` +
    `${copied} written, ${pruned} pruned` +
    (trimmed.length > 0 ? `, ${trimmed.length} trimmed saving ${Math.round(saved / 1024)} KB` : ""),
);
