// The frozen tier files (tiers/d2) were built by asking the site's position
// reader, positionLine in src/lib/format.ts, about every roster and box-score
// label of 2022 to 2026 (ruling R-F, and N3 for a roster label's parts). The
// build wrote each label and the answer it got to tiers/position-readings.json.
//
// The reader is shared with the rest of the site and keeps learning labels:
// the Division I build (#68) taught it six codes and five spellings. None of
// those is on a Division II roster or box score, so nothing moved. This test
// is what would say so if one did. It fails when positionLine reads a label
// differently from the freeze, because a sheet's position chip is read live
// and its tier is frozen, and the two would then disagree for that player.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { positionLine } from "../../src/lib/format.ts";
import { READINGS_SCHEMA, recordReadings, serializeReadings } from "./position.ts";

const TIERS = join(import.meta.dir, "..", "..", "tiers");

interface Readings {
  schema: string;
  frozen_at: string;
  readings: Record<string, string | null>;
}

const snapshot = JSON.parse(
  readFileSync(join(TIERS, "position-readings.json"), "utf8"),
) as Readings;

describe("the position reader answers as it did when the tiers were frozen", () => {
  test("the readings file belongs to the committed tier files", () => {
    expect(snapshot.schema).toBe(READINGS_SCHEMA);
    const files = readdirSync(join(TIERS, "d2")).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const file = JSON.parse(readFileSync(join(TIERS, "d2", f), "utf8")) as { frozen_at: string };
      expect(`${f} frozen at ${file.frozen_at}`).toBe(`${f} frozen at ${snapshot.frozen_at}`);
    }
    // Five seasons of rosters and box scores print about a thousand distinct labels.
    expect(Object.keys(snapshot.readings).length).toBeGreaterThan(500);
  });

  test("no label the tiers were built on is read differently now", () => {
    const changed: string[] = [];
    for (const [label, line] of Object.entries(snapshot.readings)) {
      const now = positionLine(label);
      if (now !== line) changed.push(`${JSON.stringify(label)}: ${line} at the freeze, ${now} now`);
    }
    if (changed.length > 0) {
      throw new Error(
        [
          `positionLine reads ${changed.length} Division II label(s) differently from the freeze of ${snapshot.frozen_at}:`,
          ...changed.slice(0, 20).map((c) => `  ${c}`),
          ...(changed.length > 20 ? [`  and ${changed.length - 20} more`] : []),
          "",
          "The tier files in tiers/d2 were built on the old reading, so a sheet's position chip",
          "and its tier may now disagree for players with these labels. Either keep the old",
          "reading for these labels, or rebuild the tiers (bun run tiers:build), which rewrites",
          "tiers/position-readings.json. Tiers are set once a season and not moved after, so a",
          "rebuild between freezes is the owner's decision.",
        ].join("\n"),
      );
    }
  });
});

describe("serializeReadings", () => {
  test("labels in code-unit order, one a line, and a null for a label nobody can place", () => {
    const readings = new Map<string, "GK" | "DEF" | "MID" | "FWD" | null>([
      ["Midfielder", "MID"],
      ["D/M", "DEF"],
      ["N/A", null],
    ]);
    expect(serializeReadings("2026-11-16", readings)).toBe(
      [
        "{",
        `  "schema": "${READINGS_SCHEMA}",`,
        '  "frozen_at": "2026-11-16",',
        '  "readings": {',
        '    "D/M": "DEF",',
        '    "Midfielder": "MID",',
        '    "N/A": null',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("recording is off until a build turns it on, and then keeps every label asked", async () => {
    const { group } = await import("./position.ts");
    const map = recordReadings();
    expect([group("Keeper"), group("Utility"), group(undefined)]).toEqual(["GK", null, null]);
    expect([...map.entries()]).toEqual([
      ["Keeper", "GK"],
      ["Utility", null],
    ]);
  });
});
