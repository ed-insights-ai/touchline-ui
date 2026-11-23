// Which home a fact test is reading. Many tests here hold the site to a real,
// named row of the Division II files (Fort Hays State's keeper, the GAC
// journal, the Rogers State tournament): true of that home and of no other.
// Each such test runs only where that home is read, and says so by calling
// this; every test that reasons over whatever this build loads runs in every
// build, Division I's included, over that build's own files and its own
// sample conference and programme (site.config `home`, `sampleProgramme`).
//
// A sample home (data/sample.json) is the Division II home cut to one
// conference and one season, so it holds GAC's named rows and nothing else.
// A test that reads another conference, another season, or what two
// conferences share says so with the Full forms below; it runs against the
// full home and is skipped, by name, on the sample.
//
// Test-only, like density.ts: nothing the site builds imports it.

import { describe, test } from "bun:test";
import { type Gender, sample, site } from "../../site.config.ts";

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

/** Whether this run reads a full home rather than a sample cut from one. */
export const readsFullHome = (): boolean => sample === null;

/** Whether this build follows more than one conference, so that a match, a
 *  programme or a distance can span two of them. A sample home follows one. */
export const spansConferences = (): boolean => site.conferences.length > 1;

/** Whether this run reads the full Division II home, of `gender` when named:
 *  the files of every configured conference and every collected season. */
export const readsFullD2 = (gender?: Gender): boolean => readsD2(gender) && readsFullHome();

/** describeD2, for a body that reads Division II files a sample home does not
 *  hold (another conference, another season). */
export function describeFullD2(name: string, body: () => void, gender?: Gender): void {
  if (readsFullD2(gender)) describe(name, body);
  else test.skip(`${name} (reads the full Division II ${gender ?? ""} home)`, () => {});
}
