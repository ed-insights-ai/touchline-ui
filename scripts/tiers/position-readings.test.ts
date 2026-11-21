// The frozen tier files (tiers/d2, tiers/d1) were built by asking the site's position
// reader, positionLine in src/lib/format.ts, about every roster and box-score
// label of 2022 to 2026 (ruling R-F, and N3 for a roster label's parts). The
// build wrote each label and the answer it got to tiers/position-readings.json
// (Division I: tiers/position-readings.d1.json for its men, frozen 2026-11-20,
// and tiers/position-readings.d1.women.json for its women, frozen a day later).
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

// One readings file per freeze, beside its tier files: Division II's (men and
// women together) is the first freeze's name, Division I's carries its key,
// and Division I's women, frozen on their own day, their gender too. `files`
// names the tier files that freeze wrote.
const LEVELS = [
  {
    level: "d2",
    files: /^\d{4}-(men|women)\.json$/,
    file: "position-readings.json",
    name: "Division II",
    build: "tiers:build",
  },
  {
    level: "d1",
    files: /^\d{4}-men\.json$/,
    file: "position-readings.d1.json",
    name: "Division I men's",
    build: "tiers:build:d1",
  },
  {
    level: "d1",
    files: /^\d{4}-women\.json$/,
    file: "position-readings.d1.women.json",
    name: "Division I women's",
    build: "tiers:build:d1:women",
  },
] as const;

for (const { level, files: frozenFiles, file: readingsFile, name, build } of LEVELS) {
  const snapshot = JSON.parse(readFileSync(join(TIERS, readingsFile), "utf8")) as Readings;

  describe(`the position reader answers as it did when the ${name} tiers were frozen`, () => {
    test("the readings file belongs to the committed tier files", () => {
      expect(snapshot.schema).toBe(READINGS_SCHEMA);
      const files = readdirSync(join(TIERS, level)).filter((f) => frozenFiles.test(f));
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        const tiers = JSON.parse(readFileSync(join(TIERS, level, f), "utf8")) as {
          frozen_at: string;
        };
        expect(`${f} frozen at ${tiers.frozen_at}`).toBe(`${f} frozen at ${snapshot.frozen_at}`);
      }
      // Five seasons of rosters and box scores print hundreds of distinct labels.
      expect(Object.keys(snapshot.readings).length).toBeGreaterThan(250);
    });

    test("no label the tiers were built on is read differently now", () => {
      const changed: string[] = [];
      for (const [label, line] of Object.entries(snapshot.readings)) {
        const now = positionLine(label);
        if (now !== line)
          changed.push(`${JSON.stringify(label)}: ${line} at the freeze, ${now} now`);
      }
      if (changed.length > 0) {
        throw new Error(
          [
            `positionLine reads ${changed.length} ${name} label(s) differently from the freeze of ${snapshot.frozen_at}:`,
            ...changed.slice(0, 20).map((c) => `  ${c}`),
            ...(changed.length > 20 ? [`  and ${changed.length - 20} more`] : []),
            "",
            `The tier files in tiers/${level} were built on the old reading, so a sheet's position chip`,
            "and its tier may now disagree for players with these labels. Either keep the old",
            `reading for these labels, or rebuild the tiers (bun run ${build}), which rewrites`,
            `tiers/${readingsFile}. Tiers are set once a season and not moved after, so a`,
            "rebuild between freezes is the owner's decision.",
          ].join("\n"),
        );
      }
    });
  });
}

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
