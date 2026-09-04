/**
 * Where a published position puts a player.
 *
 * This file exists because reading the first letter of a position is a rule
 * that looks right and is wrong in two directions at once.
 *
 * It was wrong about words it recognised: "Defensive Midfielder" starts with a
 * d, so a midfielder stood on the back line. And it was silent about words it
 * did not: a roster writing "Right Back", "Winger" or "Striker" placed nobody
 * at all, which put 4.8% of a division's published minutes — 58% of one
 * programme's — inside the season totals and inside no line of the grid that
 * takes a share of them.
 *
 * So the tests below assert both halves. Every form the data actually
 * publishes lands where a football reader would put it, AND a word this table
 * does not know still places nobody: the mapping widens what is recognised and
 * never guesses.
 */

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { loadRosters } from "./data.ts";
import { loadSeason, squadByLine, squadOf } from "./derive.ts";
import { LINE_ORDER, positionLine } from "./format.ts";
import { originOf } from "./origin.ts";

const seasons = site.conferences.map((k) => loadSeason(k));

describe("the words a roster prints", () => {
  test("the plain nouns, and the letters a box score shortens them to", () => {
    for (const p of ["Goalkeeper", "Goal Keeper", "GoalKeeper", "GK", "G"]) {
      expect(positionLine(p), p).toBe("GK");
    }
    for (const p of ["Defender", "Defense", "DEF", "D"]) expect(positionLine(p), p).toBe("DEF");
    for (const p of ["Midfielder", "Midfield", "MID", "MF", "M"]) {
      expect(positionLine(p), p).toBe("MID");
    }
    for (const p of ["Forward", "FWD", "F"]) expect(positionLine(p), p).toBe("FWD");
  });

  test("the granular vocabulary a football roster writes", () => {
    for (const p of ["Right Back", "Left Back", "Center Back", "Centre Back", "Wing Back"]) {
      expect(positionLine(p), p).toBe("DEF");
    }
    for (const p of ["Winger", "Wing", "Left Wing", "W", "Striker", "Second Striker"]) {
      expect(positionLine(p), p).toBe("FWD");
    }
    for (const p of [
      "Defensive Midfielder",
      "Center Defensive Midfielder",
      "Attacking Midfielder",
      "Holding Midfielder",
    ]) {
      expect(positionLine(p), p).toBe("MID");
    }
  });

  test("the words nest, and the order they are read in decides", () => {
    // Each of these contains the name of a line it does not belong to.
    expect(positionLine("Defensive Midfielder")).toBe("MID");
    expect(positionLine("Wing Back")).toBe("DEF");
    expect(positionLine("Attacking Midfielder")).toBe("MID");
  });

  test("two positions means the first one", () => {
    expect(positionLine("Midfielder/Defender")).toBe("MID");
    expect(positionLine("Defender/Midfielder")).toBe("DEF");
    expect(positionLine("Forward/Midfielder")).toBe("FWD");
    expect(positionLine("Midfielder / Defender")).toBe("MID");
    expect(positionLine("M/F")).toBe("MID");
    expect(positionLine("D/M")).toBe("DEF");
  });

  test("the misspellings these rosters actually publish", () => {
    expect(positionLine("Foward")).toBe("FWD");
    expect(positionLine("Miidfielder")).toBe("MID");
    expect(positionLine("Midfielder/Foward")).toBe("MID");
  });

  test("a published misspelling maps through the explicit list, not by resemblance", () => {
    // Drury's 2026 roster prints "Midielder". The alias names that roster and
    // maps the word; a misspelling nobody has published stays unplaced.
    expect(positionLine("Midielder")).toBe("MID");
    expect(positionLine("Midielder/Forward")).toBe("MID");
    expect(positionLine("Midfeidler")).toBe("MID");
    expect(positionLine("Derfender")).toBe("DEF");
    expect(positionLine("Milfielder")).toBe("MID");
    expect(positionLine("Goalkeper")).toBe("GK");
    expect(positionLine("De")).toBe("DEF");
    // Westminster 2026: "Center/ Midfieler" is one position, read whole.
    expect(positionLine("Center/ Midfieler")).toBe("MID");
    // Adams State 2026: "OB", an outside back, beside "RB/ST/CDM".
    expect(positionLine("OB")).toBe("DEF");
    // Missouri S&T 2026: initials joined by a hyphen, first listed first.
    expect(positionLine("F-M")).toBe("FWD");
    expect(positionLine("M-B")).toBe("MID");
    expect(positionLine("B")).toBe("DEF");
    expect(positionLine("CM")).toBe("MID");
    expect(positionLine("Midfelder")).toBeNull();
  });

  test("the two-letter positional codes Southwest Baptist 2023 writes", () => {
    // glvc/southwest-baptist, 2023 roster: every player is a code, most are
    // several joined by a slash, and the first listed is the position.
    for (const p of ["RB", "CB", "LB", "RB/CB/CDM", "LB/RB/CM"]) {
      expect(positionLine(p), p).toBe("DEF");
    }
    for (const p of ["CM", "CDM", "CAM", "CM/CAM/RW", "CDM/CM/CAM/CB", "CAM/CM/LW"]) {
      expect(positionLine(p), p).toBe("MID");
    }
    for (const p of ["LW", "RW", "ST", "LW/RW/ST", "ST/RW", "LW/RW/CAM"]) {
      expect(positionLine(p), p).toBe("FWD");
    }
  });

  test("the archive's vocabulary, found by reading every collected season", () => {
    // Each of these is cited in format.ts to the roster that printed it.
    for (const p of ["GKP", "Goalie"]) expect(positionLine(p), p).toBe("GK");
    for (const p of ["DF", "DF/FW", "FB", "C/B", "L/B"]) expect(positionLine(p), p).toBe("DEF");
    for (const p of [
      "ACM",
      "AM",
      "HCM",
      "C/M",
      "Center Mid",
      "Mid Fielder",
      "Right Mid Fielder",
      "Mid Fielder / Forward",
      "Center Middlefielder",
      "Midfilder/Forward",
      "Midifelder",
      "MD",
    ]) {
      expect(positionLine(p), p).toBe("MID");
    }
    for (const p of ["FW", "FOR", "S", "W/S", "L/R Forward", "Left/Right Forward"]) {
      expect(positionLine(p), p).toBe("FWD");
    }
    // A slash inside one position is read whole only for the printed forms.
    expect(positionLine("C/F")).toBeNull();
  });

  test("a word this table does not know places nobody", () => {
    // Widening what is recognised is not the same as guessing. "Team IMPACT"
    // is a real roster entry and not a position at all.
    for (const p of ["Team IMPACT", "Sweeper", "Libero", "Utility", "", "  ", "12", undefined]) {
      expect(positionLine(p), JSON.stringify(p)).toBeNull();
    }
  });
});

describe("against the rosters this site actually collects", () => {
  test("only a roster that published nothing leaves a player unlisted", () => {
    // The check that would have caught the original gap: after the table, a
    // player with no line must be a player with no PUBLISHED POSITION, or one
    // of the handful of entries that name something other than a position.
    // "1": Illinois Springfield's 2026 roster prints a number in the position
    // column for one player; a number is not a position and places nobody.
    // "Student Manager": William Jewell 2025 lists two managers on the roster.
    // "Student Assistant": William Jewell 2023. "HS" and "TR": Spring Hill
    // 2020 prints them for one player each beside spelled-out positions;
    // neither is evidently a position, so neither is guessed at. "A": Saint
    // Leo 2025 (ssc/saint-leo) prints it for one player beside GK, M, D and
    // F; it is not one of that roster's own four letters, so it is not read.
    const KNOWN_NON_POSITIONS = [
      "team impact",
      "1",
      "student manager",
      "student assistant",
      "hs",
      "tr",
      // psac/e-stroudsburg 2022, one row: a single letter the roster
      // published in the position column (Pieter Neerhof, "q").
      "q",
      // ecc/district-of-columbia, staff rows the roster lists among the
      // players once its columns read straight (rib #91).
      "team manager",
      "manager",
    ];
    // Every collected season, not just the two the site renders: the
    // vocabulary is authored once for the whole archive, and Southwest
    // Baptist's 2023 codes (tui-6e0) sat unplaced for as long as this read
    // only the current season and the one before it.
    const FIRST_COLLECTED_SEASON = 2016;
    let checked = 0;
    let seasonsRead = 0;
    for (const conference of site.conferences) {
      for (let year = FIRST_COLLECTED_SEASON; year <= site.season; year++) {
        const file = loadRosters(year, "men", conference);
        if (!file) continue;
        seasonsRead++;
        for (const slug of Object.keys(file.rosters)) {
          const players = file?.rosters[slug]?.players ?? [];
          for (const player of players) {
            checked++;
            if (positionLine(player.position) !== null) continue;
            const published = (player.position ?? "").trim().toLowerCase();
            expect(
              published === "" || KNOWN_NON_POSITIONS.includes(published),
              `${conference}/${slug}: ${JSON.stringify(player.position)}`,
            ).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1500);
    // 32 conference-seasons are on disk today; fewer means a file went missing.
    expect(seasonsRead).toBeGreaterThanOrEqual(32);
  });
});

describe("what placing a player must not touch", () => {
  test("where a player is from does not depend on where they play", () => {
    // The bead's requirement, stated as the invariant behind it: origin is
    // read off a hometown, so moving a player onto a line cannot change their
    // classification. What CAN change is how many players a page renders, and
    // therefore what the provenance line counts — that is a population, not a
    // reclassification, and the two must not be confused.
    let compared = 0;
    for (const season of seasons) {
      for (const slug of Object.keys(season.rosters?.rosters ?? {})) {
        const byName = new Map(
          squadOf(season, slug).map((m) => [m.player.name, originOf(m.player.hometown)]),
        );
        for (const line of LINE_ORDER) {
          for (const m of squadByLine(season, slug, line)) {
            compared++;
            expect(originOf(m.player.hometown), `${slug}: ${m.player.name}`).toEqual(
              byName.get(m.player.name) as ReturnType<typeof originOf>,
            );
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(800);
  });

  test("every player the four lines draw is a player on the roster, once", () => {
    for (const season of seasons) {
      for (const slug of Object.keys(season.rosters?.rosters ?? {})) {
        const drawn = LINE_ORDER.flatMap((l) => squadByLine(season, slug, l));
        const roster = squadOf(season, slug);
        expect(drawn.length).toBeLessThanOrEqual(roster.length);
        expect(new Set(drawn.map((m) => m.player.name)).size, slug).toBe(drawn.length);
        const unlisted = roster.filter((m) => m.line === null).length;
        expect(drawn.length + unlisted, slug).toBe(roster.length);
      }
    }
  });
});
