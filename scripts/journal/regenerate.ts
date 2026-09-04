// The one regeneration.
//
// A journal whose validate step dropped a line for restating another line
// (checker "words_moved") gets the model asked once more, with the report's
// own words for what clashed appended to the prompt. Once, never a loop: if
// the second reply carries the same restatement the drop stands, and the
// console says so. Pure over its two steps so that the decision — retry or
// not, resolved or not — is testable with a fake model and no file.

import type { RestatementDrop } from "./validate.ts";

export interface Validated {
  code: number;
  /** The words_moved drops on this pass's report. */
  restated: RestatementDrop[];
}

export interface Steps {
  /** Ask the model and write the journal; the restatements are those the
   *  previous reply's validate dropped, empty on the first ask. Resolves to
   *  the step's exit code. */
  generate(restatements: readonly string[]): Promise<number>;
  /** Validate what generate wrote (and write the report). */
  validate(): Validated;
  /** Whether a model was asked in this process at all. A dry run or a
   *  replayed reply has nothing to ask again. */
  mayRetry: boolean;
}

export interface Outcome {
  code: number;
  retried: boolean;
  /** Restatements still dropped when the run settled — empty when the first
   *  reply had none, or the retry cleared them. */
  unresolved: RestatementDrop[];
  /** The retry's generate step failed; the first reply's validated journal
   *  stands and its drops are what `unresolved` names. */
  retryFailed: boolean;
}

export async function generateThenValidate(steps: Steps): Promise<Outcome> {
  const first = await steps.generate([]);
  if (first !== 0) return { code: first, retried: false, unresolved: [], retryFailed: false };
  let v = steps.validate();
  if (v.restated.length === 0 || !steps.mayRetry) {
    return { code: v.code, retried: false, unresolved: v.restated, retryFailed: false };
  }
  const again = await steps.generate(v.restated.map((r) => r.why));
  if (again !== 0)
    return { code: v.code, retried: true, unresolved: v.restated, retryFailed: true };
  v = steps.validate();
  return { code: v.code, retried: true, unresolved: v.restated, retryFailed: false };
}
