// The one roster this site holds from a PrestoSports page, held to the
// vocabulary the site's parsers read.
//
// classAbbr, tenureOf and positionLine were written against what SideArm
// rosters print ("Senior", "Midfielder", 6'1", "165 lbs"). A PrestoSports
// page prints the same facts differently ("Grad.", "For.", "6-4", "200"), and
// the rib's recipe for that platform (rib #72) normalises them to the SideArm
// forms before they reach the data home. This fixture is that recipe's output
// for Tampa 2025, and every row of it must land where the pages place it: a
// class year on a tenure step, a position on one of the four lines, a height
// and a weight in the printed forms. A row that does not is a vocabulary trip
// in the rib, caught here rather than on a published page.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classAbbr, positionLine } from "./format.ts";
import { rosterSchema } from "./model.ts";
import { tenureOf } from "./tenure.ts";

const fixture = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures", "presto-roster-tampa-2025.json"), "utf8"),
) as { note: string; roster: unknown };
const roster = rosterSchema.parse(fixture.roster);

describe("a PrestoSports roster, as the rib writes it", () => {
  test("is a rosters row this site accepts, and says where it came from", () => {
    expect(roster.programme).toBe("tampa");
    expect(roster.players.length).toBe(42);
    expect(fixture.note).toContain("PrestoSports");
  });

  test("every class year lands on a tenure step", () => {
    const unplaced = roster.players
      .filter((p) => tenureOf(p.class_year).step === null)
      .map((p) => `${p.name}: ${p.class_year ?? "(none)"}`);
    expect(unplaced).toEqual([]);
  });

  test("a graduate student takes the top step, in the words the recipe writes", () => {
    const grads = roster.players.filter((p) => /grad/i.test(p.class_year ?? ""));
    expect(grads.length).toBeGreaterThan(0);
    for (const p of grads) {
      expect(classAbbr(p.class_year)).toBe(p.class_year as string);
      expect(tenureOf(p.class_year).step).toBe("5Y");
    }
  });

  test("every position lands on one of the four lines", () => {
    const unplaced = roster.players
      .filter((p) => positionLine(p.position) === null)
      .map((p) => `${p.name}: ${p.position ?? "(none)"}`);
    expect(unplaced).toEqual([]);
  });

  test("heights and weights are in the forms the pages print", () => {
    const odd = roster.players
      .filter(
        (p) =>
          (p.height !== undefined && !/^\d'\d{1,2}"$/.test(p.height)) ||
          (p.weight !== undefined && !/^\d{2,3} lbs$/.test(p.weight)),
      )
      .map((p) => `${p.name}: ${p.height ?? "-"} ${p.weight ?? "-"}`);
    expect(odd).toEqual([]);
    // The fields are present, not just well-formed when present: a recipe
    // that dropped them would pass the shape check and fail the reader.
    expect(roster.players.filter((p) => p.height).length).toBeGreaterThan(30);
  });
});
