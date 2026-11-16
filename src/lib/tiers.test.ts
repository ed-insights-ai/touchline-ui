// The player-tiers artifact, as the site reads it: the committed files under
// tiers/d2 parse under the strict schema and hold no key outside ALGORITHM.md
// section 10, the loader finds them at the repository root, and the two
// lookups the pages will use answer as documented.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { section10Violations } from "../../scripts/tiers/output.ts";
import { ncaaDivision } from "../site.config.ts";
import {
  foldKey,
  loadTiers,
  type TierEntry,
  type TiersFile,
  teamFigures,
  tierFor,
  tiersFileSchema,
} from "./tiers.ts";

const ROOT = resolve(import.meta.dir, "..", "..");
const DIR = join(ROOT, "tiers", "d2");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

describe("the committed artifacts in tiers/d2", () => {
  test("are the ten files: 2022 to 2026, men and women", () => {
    const expected = [2022, 2023, 2024, 2025, 2026].flatMap((y) => [
      `${y}-men.json`,
      `${y}-women.json`,
    ]);
    expect(files).toEqual(expected.sort());
  });

  test.each(files)("%s parses under the strict schema and says what it is", (name) => {
    const raw = JSON.parse(readFileSync(join(DIR, name), "utf8"));
    const parsed = tiersFileSchema.safeParse(raw);
    if (!parsed.success) throw new Error(parsed.error.message);
    const [season, gender] = name.replace(".json", "").split("-");
    expect(parsed.data.level).toBe("d2");
    expect(String(parsed.data.season)).toBe(season as string);
    expect(parsed.data.gender).toBe(gender as never);
  });

  test.each(files)("%s holds no key outside section 10", (name) => {
    const raw = JSON.parse(readFileSync(join(DIR, name), "utf8"));
    expect(section10Violations(raw)).toEqual([]);
  });

  test.each(
    files,
  )("%s: every key is the fold of its name, and lists are in section 10's order", (name) => {
    const a = loadTiers("d2", Number(name.slice(0, 4)), name.slice(5, -5), ROOT) as TiersFile;
    for (const list of Object.values(a.players)) {
      for (const e of list) expect(e.key).toBe(foldKey(e.name));
      const keys = list.map((e) => `${e.key}\u0000${e.number ?? "￿"}`);
      expect(keys).toEqual([...keys].sort());
    }
  });
});

describe("loadTiers", () => {
  test("reads tiers/{level}/{season}-{gender}.json under the repository root", () => {
    const a = loadTiers(ncaaDivision, 2026, "men", ROOT);
    expect(a?.season).toBe(2026);
    expect(a?.gender).toBe("men");
  });

  test("returns null when no file was built", () => {
    expect(loadTiers("d1", 2026, "men", ROOT)).toBeNull();
  });

  test("throws, naming the file, on a schema mismatch", () => {
    const root = mkdtempSync(join(tmpdir(), "tiers-"));
    mkdirSync(join(root, "tiers", "d2"), { recursive: true });
    writeFileSync(
      join(root, "tiers", "d2", "2026-men.json"),
      JSON.stringify({ schema: "touchline-ui.tiers/1", season: 2026, estimate: 1 }),
    );
    expect(() => loadTiers("d2", 2026, "men", root)).toThrow(/2026-men\.json does not match/);
  });
});

describe("foldKey", () => {
  test("NFKD, combining marks stripped, lower-case, letters only", () => {
    expect(foldKey("As The Source Prints It")).toBe("asthesourceprintsit");
    expect(foldKey("Noé Coutiño")).toBe("noecoutino");
    expect(foldKey("Edoardo Degl'Innocenti")).toBe("edoardodeglinnocenti");
    expect(foldKey("Jean-Luc O’Neil Jr.")).toBe("jeanluconeiljr");
    expect(foldKey("ﬁfi")).toBe("fifi");
  });
});

const fixture = (players: TierEntry[]): TiersFile => ({
  schema: "touchline-ui.tiers/1",
  level: "d2",
  season: 2026,
  gender: "men",
  spec: "player-tiers/0.6",
  frozen_at: "2026-11-16",
  data_commit: "abc1234",
  division: { teams: 1, shots_faced_per_match: 12.3, pct_in: 12.8 },
  teams: {
    harding: {
      matches: 18,
      workload: "heavy",
      shots_faced_per_match: 22.8,
      pct_in: 13.2,
      goals_conceded: 54,
      opponents_usual: 27.4,
    },
  },
  players: { harding: players },
});

const e = (over: Partial<TierEntry>): TierEntry => ({
  name: "Ann Lee",
  key: "annlee",
  player_id: null,
  number: null,
  group: "D",
  kind: "team_defence",
  status: "needs_second_season",
  tier: null,
  reason: null,
  basis: { minutes: 1620, matches: 18, seasons: [2026], class_year: null },
  ...over,
});

describe("tierFor", () => {
  test("matches on player_id when both sides carry one", () => {
    const hit = e({ player_id: "77", name: "Annie Lee", key: "annielee" });
    const t = fixture([e({ player_id: "12" }), hit]);
    expect(tierFor(t, "harding", { playerId: "77", foldedName: "annlee" })).toBe(hit);
  });

  test("an entry whose id differs is a different player, even with the same name", () => {
    const t = fixture([e({ player_id: "12" })]);
    expect(tierFor(t, "harding", { playerId: "77", foldedName: "annlee" })).toBeNull();
  });

  test("falls back to the folded name when either side has no id", () => {
    const hit = e({ player_id: null });
    const t = fixture([hit, e({ key: "beakim", name: "Bea Kim" })]);
    expect(tierFor(t, "harding", { playerId: "77", foldedName: "annlee" })).toBe(hit);
    expect(tierFor(t, "harding", { foldedName: "annlee" })).toBe(hit);
  });

  test("the shirt number breaks a tie, and an unbroken tie is no answer", () => {
    const four = e({ number: "4" });
    const nine = e({ number: "9" });
    const t = fixture([four, nine]);
    expect(tierFor(t, "harding", { foldedName: "annlee", number: "9" })).toBe(nine);
    expect(tierFor(t, "harding", { foldedName: "annlee", number: "2" })).toBeNull();
    expect(tierFor(t, "harding", { foldedName: "annlee" })).toBeNull();
  });

  test("an unknown programme or player is null", () => {
    const t = fixture([e({})]);
    expect(tierFor(t, "ouachita-baptist", { foldedName: "annlee" })).toBeNull();
    expect(tierFor(t, "harding", { foldedName: "nobody" })).toBeNull();
  });
});

describe("teamFigures", () => {
  test("the programme's figures beside the division's", () => {
    const t = fixture([]);
    expect(teamFigures(t, "harding")).toEqual({
      team: t.teams.harding,
      division: t.division,
    } as never);
    expect(teamFigures(t, "aum")).toBeNull();
  });
});

describe("the debug rows stay out of the site", () => {
  test("nothing under src/ reads tiers/.debug", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, d.name);
        if (d.isDirectory()) walk(p);
        else if (/\.(ts|astro|mjs|js)$/.test(d.name) && !d.name.endsWith(".test.ts")) {
          if (readFileSync(p, "utf8").includes(".debug")) hits.push(p);
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(hits).toEqual([]);
  });
});
