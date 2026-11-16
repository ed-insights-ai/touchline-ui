// Which home a fact test is reading. Many tests here hold the site to a real,
// named row of the Division II files (Fort Hays State's keeper, the GAC
// journal, the Rogers State tournament): true of that home and of no other.
// Each such test runs only where that home is read, and says so by calling
// this; every test that reasons over whatever this build loads runs in every
// build, Division I's included, over that build's own files and its own
// sample conference and programme (site.config `home`, `sampleProgramme`).
//
// Test-only, like density.ts: nothing the site builds imports it.

import { describe, test } from "bun:test";
import { type Gender, site } from "../../site.config.ts";

/** Whether this run reads the Division II home, of `gender` when one is named. */
export const readsD2 = (gender?: Gender): boolean =>
  site.ncaaDivision === "d2" && (gender === undefined || site.gender === gender);

/** A describe whose body reads named Division II files. Under any other
 *  build its body never runs (bun runs a skipped describe's body, and these
 *  bodies load files the build's home does not hold); one skipped test says
 *  what was left out and why. */
export function describeD2(name: string, body: () => void, gender?: Gender): void {
  if (readsD2(gender)) describe(name, body);
  else test.skip(`${name} (reads the Division II ${gender ?? ""} files)`, () => {});
}
