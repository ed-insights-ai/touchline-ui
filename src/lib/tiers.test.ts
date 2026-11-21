// The player-tiers artifact, as the site reads it: the committed files under
// tiers/d2 parse under the strict schema and hold no key outside ALGORITHM.md
// section 10, the loader finds them at the repository root, and the two
// lookups the pages will use answer as documented.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { section10Violations } from "../../scripts/tiers/output.ts";
import {
  foldLetters,
  foldName,
  foldSurname,
  givenFirst,
  loadTiers,
  shirtNumber,
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
      for (const e of list) expect(e.key).toBe(foldName(e.name));
      // Key, then number, name and player_id as strings, a null first
      // (section 10, v2.2): a null sorts as "", anything else after a "#".
      const part = (x: string | null) => (x === null ? "" : `#${x}`);
      const keys = list.map((e) =>
        [e.key, part(e.number), part(e.name), part(e.player_id)].join("\u0000"),
      );
      expect(keys).toEqual([...keys].sort());
    }
    // [v2.2] teams and players hold the same programmes, in slug order.
    expect(Object.keys(a.players)).toEqual(Object.keys(a.teams));
    expect(Object.keys(a.teams)).toEqual(Object.keys(a.teams).sort());
    for (const t of Object.values(a.teams)) expect(t.matches).toBeGreaterThan(0);
  });
});

describe("loadTiers", () => {
  test("reads tiers/{level}/{season}-{gender}.json under the repository root", () => {
    // The committed files' own level, not the build's: the suite also runs
    // with TOUCHLINE_NCAA_DIVISION=d1, and the d2 files are there either way.
    const a = loadTiers("d2", 2026, "men", ROOT);
    expect(a?.season).toBe(2026);
    expect(a?.gender).toBe("men");
  });

  test("returns null when no file was built", () => {
    expect(loadTiers("d3", 2026, "men", ROOT)).toBeNull();
    expect(loadTiers("d1", 2026, "women", ROOT)).toBeNull();
  });

  test("throws, naming the file, on a schema mismatch", () => {
    const root = mkdtempSync(join(tmpdir(), "tiers-"));
    mkdirSync(join(root, "tiers", "d2"), { recursive: true });
    writeFileSync(
      join(root, "tiers", "d2", "2026-men.json"),
      JSON.stringify({ schema: "touchline-ui.tiers/2", season: 2026, estimate: 1 }),
    );
    expect(() => loadTiers("d2", 2026, "men", root)).toThrow(/2026-men\.json does not match/);
  });
});

describe("foldName: the collector's fold_name (4.1)", () => {
  test("given names first: 'Last, First' becomes 'First Last'", () => {
    expect(givenFirst("Høihjelle, Iver")).toBe("Iver Høihjelle");
    expect(givenFirst("Iver Høihjelle")).toBe("Iver Høihjelle");
    // Nothing after the comma: the name as it stands (the fold drops the comma).
    expect(givenFirst("Pelé,")).toBe("Pelé,");
    expect(foldName("Pelé,")).toBe("pele");
    // Only the first comma splits.
    expect(givenFirst("Lee, Ann, Jr.")).toBe("Ann, Jr. Lee");
  });

  test("both orders of one name fold alike; the letter table and NFKD do the rest", () => {
    expect(foldName("Høihjelle, Iver")).toBe("iverhoihjelle");
    expect(foldName("Iver Hoihjelle")).toBe("iverhoihjelle");
    expect(foldName("As The Source Prints It")).toBe("asthesourceprintsit");
    expect(foldName("Noé Coutiño")).toBe("noecoutino");
    expect(foldName("Edoardo Degl'Innocenti")).toBe("edoardodeglinnocenti");
    expect(foldName("Jean-Luc O’Neil Jr.")).toBe("jeanluconeiljr");
    expect(foldName("ﬁfi")).toBe("fifi");
  });

  test("the replacements NFKD does not make: ø æ œ ß ð þ ł đ ı", () => {
    expect(foldLetters("Søren Æbelø Œuvre")).toBe("sorenaebelooeuvre");
    expect(foldLetters("Straß Ðaði Þór")).toBe("strassdadithor");
    expect(foldLetters("Łukasz Đorđe Kılıç")).toBe("lukaszdordekilic");
    // Upper-case forms fold through lower-casing first.
    expect(foldLetters("ØSTERGÅRD")).toBe("ostergard");
  });

  test("the folded surname: before the comma, else the last word", () => {
    expect(foldSurname("Høihjelle, Iver")).toBe("hoihjelle");
    expect(foldSurname("Iver Høihjelle")).toBe("hoihjelle");
    expect(foldSurname("Juan Carlos de la Cruz")).toBe("cruz");
    expect(foldSurname("de la Cruz, Juan")).toBe("delacruz");
  });

  test("a shirt number compares with leading zeros dropped; a bare zero stays", () => {
    expect(shirtNumber("07")).toBe("7");
    expect(shirtNumber(" 7 ")).toBe("7");
    expect(shirtNumber("00")).toBe("0");
    expect(shirtNumber("0")).toBe("0");
    expect(shirtNumber("")).toBe("");
    expect(shirtNumber(null)).toBe("");
  });
});

const fixture = (players: TierEntry[]): TiersFile => ({
  schema: "touchline-ui.tiers/2",
  level: "d2",
  season: 2026,
  gender: "men",
  spec: "player-tiers/0.8",
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
      badge: false,
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
    expect(tierFor(t, "harding", { playerId: "77", name: "Ann Lee" })).toBe(hit);
  });

  test("an entry whose id differs is a different player, even with the same name", () => {
    const t = fixture([e({ player_id: "12" })]);
    expect(tierFor(t, "harding", { playerId: "77", name: "Ann Lee" })).toBeNull();
  });

  test("falls back to the folded name when either side has no id", () => {
    const hit = e({ player_id: null });
    const t = fixture([hit, e({ key: "beakim", name: "Bea Kim" })]);
    expect(tierFor(t, "harding", { playerId: "77", name: "Ann Lee" })).toBe(hit);
    expect(tierFor(t, "harding", { name: "Ann Lee" })).toBe(hit);
  });

  test("the shirt number breaks a tie, and an unbroken tie is no answer", () => {
    const four = e({ number: "4" });
    const nine = e({ number: "9" });
    const t = fixture([four, nine]);
    expect(tierFor(t, "harding", { name: "Ann Lee", number: "9" })).toBe(nine);
    expect(tierFor(t, "harding", { name: "Ann Lee", number: "2" })).toBeNull();
    expect(tierFor(t, "harding", { name: "Ann Lee" })).toBeNull();
  });

  test("the name is folded by the collector's rule, and the number loses its leading zeros", () => {
    const hit = e({ name: "Iver Høihjelle", key: "iverhoihjelle", number: "07" });
    const t = fixture([hit, e({ name: "Iver Høihjelle", key: "iverhoihjelle", number: "9" })]);
    expect(tierFor(t, "harding", { name: "Høihjelle, Iver", number: "7" })).toBe(hit);
    expect(tierFor(t, "harding", { name: "Iver Hoihjelle", number: "007" })).toBe(hit);
    // A name with no letters folds to nothing and finds nobody.
    expect(tierFor(t, "harding", { name: "#7" })).toBeNull();
  });

  test("an unknown program or player is null", () => {
    const t = fixture([e({})]);
    expect(tierFor(t, "ouachita-baptist", { name: "Ann Lee" })).toBeNull();
    expect(tierFor(t, "harding", { name: "Nobody" })).toBeNull();
  });
});

describe("teamFigures", () => {
  test("the program's figures beside the division's", () => {
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
