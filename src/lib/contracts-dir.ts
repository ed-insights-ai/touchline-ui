// Where the rib's published contracts/ directory is.
//
// The rib (keelson-rib-touchline) publishes one sample document per schema it
// writes across the repo boundary, under contracts/. Two suites here read them
// — contracts.test.ts parses each under this site's strict schemas, and
// model-drift.test.ts holds model.ts's field inventory to theirs — and both
// must look in the same place, so the lookup lives once.
//
// The fixtures are read from a checkout, never copied here: a copy is a second
// source of truth that drifts. `TOUCHLINE_CONTRACTS_DIR` names the directory.
// Unset, the default is a sibling checkout of touchline-contracts (the rib's
// published copy, which readers use), then a sibling checkout of the rib
// itself, so an existing workspace with only the rib keeps working.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The one file every published contracts/ directory carries. */
export const CONTRACTS_MARKER = "coverage-1.json";
const ABOVE = resolve(import.meta.dir, "..", "..", "..");
const SIBLINGS = [
  join(ABOVE, "touchline-contracts", "contracts"),
  join(ABOVE, "keelson-rib-touchline", "contracts"),
];

function expandTilde(p: string): string {
  return p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p;
}

/** Mirrors how `dataRoot()` reads `TOUCHLINE_DATA_DIR`. Being pointed at the
 *  rib checkout rather than its contracts/ directory is a likely enough slip
 *  to recognise. */
export function contractsDir(): string {
  const override = process.env.TOUCHLINE_CONTRACTS_DIR?.trim();
  const dir = resolve(
    override
      ? expandTilde(override)
      : (SIBLINGS.find((d) => existsSync(join(d, CONTRACTS_MARKER))) ?? (SIBLINGS[0] as string)),
  );
  if (
    !existsSync(join(dir, CONTRACTS_MARKER)) &&
    existsSync(join(dir, "contracts", CONTRACTS_MARKER))
  ) {
    return join(dir, "contracts");
  }
  return dir;
}

/** Whether a published contracts/ directory is at `dir`. */
export const contractsPresent = (dir: string): boolean => existsSync(join(dir, CONTRACTS_MARKER));
