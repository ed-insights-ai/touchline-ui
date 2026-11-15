// A fixture's postseason stage, as the ledger and the Match Centre tag it.
//
// The tag ("GAC SF", "NCAA R2") is postseason.ts's stageTag, folded across
// every configured conference's records; this module only hands it to the
// surfaces that hold a Fixture rather than a match identity — the team page's
// strip and next-up figure, the player sheet's log, the conference cards — and
// gives it a phrase for a sentence ("NCAA second round"). Nothing here places
// a round: an unplaced tie keeps its owner and drops the label, exactly as the
// Match Centre trims it.

import { type Fixture, matchIdentity } from "./derive.ts";
import { type Competition, type Postseason, roundNameOf, stageTag } from "./postseason.ts";
import { divisionPostseason } from "./postseason-division.ts";

export interface StageChip {
  /** "GAC SF", "NCAA R2"; just the owner ("NCAA") when the round is unplaced. */
  text: string;
  competition: Competition;
  /** Who runs the tournament ("GAC", "NCAA"): the text before the round. */
  owner: string;
  /** The round's short label ("SF", "R2", "FINAL"); empty when unplaced, and
   *  then the text is the owner alone. A cell too narrow for the whole tag
   *  prints this, the fill or outline still saying whose round it is. */
  label: string;
  /** For a sentence: "NCAA second round", "GAC final", "NCAA tournament". */
  phrase: string;
}

/** The phrase for an owner and a short label: ("NCAA", "R2") is "NCAA second
 *  round"; an empty label is the owner's tournament. */
export function stagePhrase(owner: string, label: string): string {
  return label ? `${owner} ${roundNameOf(label).toLowerCase()}` : `${owner} tournament`;
}

/** The chip for one identity in a given fold, or null for a match that is not
 *  a postseason tie. Exposed for tests; surfaces call stageChipOf. */
export function chipFrom(p: Postseason, identity: string): StageChip | null {
  const tag = stageTag(p, identity);
  const tie = p.byIdentity.get(identity);
  if (!tag || !tie) return null;
  const text = tag.text.trim();
  const owner = tie.label ? text.slice(0, -tie.label.length).trim() : text;
  return {
    text,
    competition: tag.competition,
    owner,
    label: tie.label,
    phrase: stagePhrase(owner, tie.label),
  };
}

/** The fixture's chip in the division's postseason, or null. */
export const stageChipOf = (f: Fixture): StageChip | null =>
  chipFrom(divisionPostseason(), matchIdentity(f));
