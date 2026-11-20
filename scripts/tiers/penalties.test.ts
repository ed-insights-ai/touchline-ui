// ALGORITHM.md 4.6 (version 2.2): which penalty plays are attempts, which are
// goals, and who the text names. The play texts are the shapes the data home
// prints; the names are invented.

import { describe, expect, test } from "bun:test";
import type { MatchDetail, MatchPlay } from "../../src/lib/model.ts";
import {
  firstLetter,
  givenInitial,
  isPenaltyAttempt,
  isPenaltyGoalText,
  namedText,
  readPenalties,
  resolveNamed,
} from "./penalties.ts";

/** A play; team null leaves the team index out. */
const play = (text: string, team: number | null = 0, type = "penalty"): MatchPlay =>
  (team === null ? { period: "1", type, text } : { period: "1", team, type, text }) as MatchPlay;

describe("an attempt, and a goal", () => {
  test("AWARDED is the award, not the kick; a play beginning * is a note", () => {
    expect(isPenaltyAttempt(play("PENALTY KICK AWARDED to Hillsdale"))).toBe(false);
    expect(isPenaltyAttempt(play("*Penalty kick awarded after a foul on Ann Lee"))).toBe(false);
    expect(isPenaltyAttempt(play("HC Ann Lee PENALTY KICK GOAL."))).toBe(true);
    // The contract's word is AWARDED, as printed; the data prints it no other way.
    expect(isPenaltyAttempt(play("penalty kick awarded"))).toBe(true);
    // A * later in the text is not a note.
    expect(isPenaltyAttempt(play("Ann Lee PENALTY KICK GOAL. *low left"))).toBe(true);
    // Only type penalty: a shootout kick is no attempt.
    expect(isPenaltyAttempt(play("Ann Lee PENALTY KICK GOAL.", 0, "shootout"))).toBe(false);
  });

  test("a goal is PENALTY KICK GOAL or FOR A GOAL, in any case", () => {
    expect(isPenaltyGoalText("HC Ann Lee PENALTY KICK GOAL.")).toBe(true);
    expect(isPenaltyGoalText("hc ann lee penalty kick goal")).toBe(true);
    expect(isPenaltyGoalText("25:53 Penalty Kick by Bea Kim (UWF) for a GOAL")).toBe(true);
    expect(isPenaltyGoalText("PENALTY KICK by HC Ann Lee FOR A GOAL")).toBe(true);
    expect(isPenaltyGoalText("PENALTY KICK by HC Ann Lee SAVED, save Bea Kim.")).toBe(false);
    expect(isPenaltyGoalText("PENALTY KICK by HC Ann Lee WIDE.")).toBe(false);
  });
});

describe("the text that names the kicker", () => {
  test("the text before PENALTY KICK", () => {
    expect(namedText("FHSU Juan Linares PENALTY KICK GOAL.")).toBe("FHSU Juan Linares");
    expect(namedText("Linares, Juan penalty kick goal")).toBe("Linares, Juan");
  });

  test("after PENALTY KICK by, cut at the first outcome word, case ignored", () => {
    expect(namedText("PENALTY KICK by COKERM Celestin Blondel WIDE.")).toBe(
      "COKERM Celestin Blondel",
    );
    expect(namedText("PENALTY KICK by AUMS Martin Carpena MISSED, save Ann Lee.")).toBe(
      "AUMS Martin Carpena",
    );
    expect(namedText("PENALTY KICK by Carson-Newman Jan Schuler Wide.")).toBe(
      "Carson-Newman Jan Schuler",
    );
    expect(namedText("PENALTY KICK by HC Ann Lee SAVED")).toBe("HC Ann Lee");
    expect(namedText("PENALTY KICK by HC Ann Lee null")).toBe("HC Ann Lee");
    // "MISS" cuts too, and so does a shorter word inside a longer one.
    expect(namedText("PENALTY KICK by HC Ann Lee MISS")).toBe("HC Ann Lee");
  });

  test("a leading clock and anything in brackets are dropped before anything else", () => {
    // The clock comes off before the by-form test, or this play would read as
    // "the text before PENALTY KICK", which is the clock alone.
    expect(namedText("25:53 Penalty Kick by Bea Kim (UWF) for a GOAL")).toBe("Bea Kim");
    expect(namedText("HC Ann Lee [12:30] PENALTY KICK GOAL")).toBe("HC Ann Lee");
    expect(namedText("PENALTY KICK by (HC) Ann Lee SAVED")).toBe("Ann Lee");
    // [v2.2] Brackets first, so a bracketed note ahead of the clock goes too.
    expect(namedText("[2nd half] 61:04 PENALTY KICK by Ann Lee WIDE")).toBe("Ann Lee");
    // A bracket holding an outcome word cannot cut the name short.
    expect(namedText("PENALTY KICK by Ann Lee (missed earlier) SAVED")).toBe("Ann Lee");
  });

  test("no PENALTY KICK in the text: nothing named", () => {
    expect(namedText("Penalty shot by Ann Lee")).toBe("");
  });
});

describe("resolving the text to a line", () => {
  const names = ["Juan Linares", "Rhys Laws", "Lee, Ann", "Bea Lee", "Pedro Linares"];

  test("the folded full name, as it stands, then with leading words removed", () => {
    expect(resolveNamed("Rhys Laws", names)).toEqual([1]);
    expect(resolveNamed("FHSU Rhys Laws", names)).toEqual([1]);
    expect(resolveNamed("Ann Lee", names)).toEqual([2]);
    expect(resolveNamed("Laws, Rhys", names)).toEqual([1]);
  });

  test("else the only line with the folded surname and, when given, the same initial", () => {
    expect(resolveNamed("FHSU R. Laws", names)).toEqual([1]);
    expect(resolveNamed("Laws", names)).toEqual([1]);
    expect(resolveNamed("J Linares", names)).toEqual([0]);
    expect(resolveNamed("B. Lee", names)).toEqual([3]);
    // Two lines with surname Linares and no initial to tell them apart.
    expect(resolveNamed("Linares", names)).toBeNull();
    // An initial no line has: nobody on the first try, but a later try drops
    // "Z." as if it were part of a team name, and the one-word try "Laws"
    // takes no first-letter test. The contract's rule, as written.
    expect(resolveNamed("Z. Laws", names)).toEqual([1]);
    expect(resolveNamed("FHSU Z. Laws", names)).toEqual([1]);
  });

  test("S3: the line's letter is its given name's; a one-word line has none", () => {
    // "L. Laws" against a one-word line "Laws" and "Lewis Laws". The try's
    // letter is l. "Lewis Laws" has given name Lewis: l, a match. "Laws" has
    // no given name, so it fails the test (read by its first word it would
    // pass, two lines would match and the try would fall through to "Laws",
    // crediting the one-word line).
    expect(resolveNamed("L. Laws", ["Laws", "Lewis Laws"])).toEqual([1]);
    // "Laws, Lewis" swaps to Lewis Laws: given name Lewis, letter l.
    expect(resolveNamed("L. Laws", ["Laws", "Laws, Lewis"])).toEqual([1]);
    // A one-word try still takes no letter test and finds "Laws" by its fold.
    expect(resolveNamed("Laws", ["Laws", "Rhys Laws"])).toEqual([0]);
  });

  test("two lines that fold alike are one player printed twice, and resolve together", () => {
    expect(resolveNamed("Ann Lee", ["Ann Lee", "Rhys Laws", "Lee, Ann"])).toEqual([0, 2]);
  });

  test("[v2.2] a team name of several words in front is read past", () => {
    // "Franklin Pierce Rodrigues, Braudilio": the third try is "Rodrigues,
    // Braudilio", which folds to braudiliorodrigues.
    expect(
      resolveNamed(namedText("Franklin Pierce Rodrigues, Braudilio PENALTY KICK GOAL"), [
        "Rodrigues, Braudilio",
      ]),
    ).toEqual([0]);
    expect(resolveNamed("St. Thomas Aquinas Ann Lee", ["Bea Kim", "Ann Lee"])).toEqual([1]);
    expect(resolveNamed("Seton Hill A. Lee", ["Bea Kim", "Ann Lee"])).toEqual([1]);
    // The first try that resolves wins, even when a later one would differ.
    expect(resolveNamed("Lee Kim", ["Lee Kim", "Kim"])).toEqual([0]);
  });

  test("[v2.2] the first letter is the first word's once 'Last, First' is swapped", () => {
    expect(firstLetter("Lee, Ann")).toBe("a");
    expect(firstLetter("Ann Lee")).toBe("a");
    expect(firstLetter("Øystein Lee")).toBe("o");
    expect(firstLetter("Pelé")).toBe("p");
    // "Lee, A." is surname lee, first letter a: it finds Ann Lee, not Bea Lee.
    expect(resolveNamed("Lee, A.", ["Bea Lee", "Ann Lee"])).toEqual([1]);
    // One word: no first-letter test, so two Lees leave it unresolved.
    expect(resolveNamed("Lee", ["Bea Lee", "Ann Lee"])).toBeNull();
  });

  test("the given initial: after the comma, else every word but the last", () => {
    expect(givenInitial("Lee, Ann")).toBe("a");
    expect(givenInitial("Ann Lee")).toBe("a");
    expect(givenInitial("Lee")).toBe("");
    expect(givenInitial("Øystein Lee")).toBe("o");
  });
});

describe("readPenalties: every penalty play of one box score", () => {
  const detail = (plays: MatchPlay[]): MatchDetail =>
    ({
      source_url: "https://example.test/boxscore/1",
      teams: [
        {
          name: "Fort Hays St.",
          periods: [1, 0],
          players: [{ name: "Juan Linares" }, { name: "Rhys Laws" }],
        },
        {
          name: "Coker",
          periods: [0, 0],
          players: [{ name: "Celestin Blondel" }, { name: "Rhys Laws" }],
        },
      ],
      plays,
    }) as MatchDetail;

  test("credited to the side the play names, a goal when its text says so", () => {
    const r = readPenalties(
      detail([
        play("FHSU Juan Linares PENALTY KICK GOAL.", 0),
        play("PENALTY KICK by COKERM Celestin Blondel WIDE.", 1),
        play("10:02 Penalty Kick by Juan Linares for a GOAL", 0),
      ]),
    );
    expect(r.unattributed).toHaveLength(0);
    expect(r.credits).toEqual([
      { side: 0, lines: [0], goal: true },
      { side: 1, lines: [0], goal: false },
      { side: 0, lines: [0], goal: true },
    ]);
  });

  test("AWARDED and * plays are counted apart and credited to nobody", () => {
    const r = readPenalties(
      detail([
        play("PENALTY KICK AWARDED to FHSU", 0),
        play("*penalty kick", 0),
        play("FHSU Juan Linares PENALTY KICK GOAL.", 0),
      ]),
    );
    expect(r.notAttempts).toBe(2);
    expect(r.credits).toHaveLength(1);
    expect(r.unattributed).toHaveLength(0);
  });

  test("no team index: credited only when exactly one side resolves it", () => {
    const one = readPenalties(detail([play("Celestin Blondel PENALTY KICK GOAL", null)]));
    expect(one.credits).toEqual([{ side: 1, lines: [0], goal: true }]);
    // Rhys Laws is on both sheets: nobody's.
    const both = readPenalties(detail([play("Rhys Laws PENALTY KICK GOAL", null)]));
    expect(both.credits).toHaveLength(0);
    expect(both.unattributed).toHaveLength(1);
  });

  test("an attempt no line answers to is unattributed", () => {
    const r = readPenalties(detail([play("FHSU Nobody Here PENALTY KICK GOAL.", 0)]));
    expect(r.credits).toHaveLength(0);
    expect(r.unattributed).toHaveLength(1);
  });
});
