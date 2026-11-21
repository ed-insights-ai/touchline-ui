// A build reads its own division and nothing else.
//
// Each NCAA division is its own data home and its own journal directory
// (site.config profiles), and every cross-build read the site makes — the
// gender switch's counterpart, the career tables' earlier seasons, the folds
// over every configured conference — goes through the one data home and the
// one journal directory this build names. These are the seams: where the
// directories come from, that a division's national journal (whose file name
// carries no division) can never be read by another, that the conferences a
// build follows are ones its home profiles at its level, and that the
// justfile builds every profile into the path the site links it at.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildPath, profiles, publishedBuilds, site } from "../site.config.ts";
import { dataRoot } from "./data.ts";
import { journalDir, journalDirs, loadNationalJournal, nationalJournalFile } from "./journal.ts";

const ROOT = join(import.meta.dir, "..", "..");

describe("the journal directory is the division's own", () => {
  test("Division II reads journal/ and Division I journal/d1, override or not", () => {
    const d2 = journalDirs(undefined, "");
    const d1 = journalDirs(undefined, "d1");
    expect(d2.at(-1)).toBe(join(process.cwd(), "journal"));
    expect(d1.at(-1)).toBe(join(process.cwd(), "journal", "d1"));
    // An override names the root, and each division keeps its own place under it.
    expect(journalDirs("/x", "")[0]).toBe("/x");
    expect(journalDirs("/x", "d1")[0]).toBe("/x/d1");
    // No directory Division I reads is one Division II's journals sit in.
    for (const dir of d1) expect(d2.slice(-1)).not.toContain(dir);
  });

  test("this build's journals come from its own directory alone", () => {
    expect(journalDir()).toBe(join(process.cwd(), "journal", site.journalSubdir));
    const own = join(journalDir(), nationalJournalFile(site.season, site.gender));
    // A division with no national journal of its own renders the floor: the
    // file of the same name in another division's directory is never read.
    if (!existsSync(own) && !existsSync(join(dataRoot(), "data", "journal"))) {
      expect(loadNationalJournal(site.season, site.gender)).toBeNull();
    }
  });
});

describe("the data home is the division's own", () => {
  test("unset, the build reads its profile's home", () => {
    if (process.env.TOUCHLINE_DATA_DIR?.trim()) return;
    const home = site.dataHome.replace(/^~(?=\/|$)/, homedir());
    expect(dataRoot()).toBe(home);
  });

  test("no two divisions share a home or a journal directory", () => {
    const of = (d: keyof typeof profiles) => Object.values(profiles[d]);
    const d1 = of("d1");
    const d2 = of("d2");
    for (const a of d1) {
      for (const b of d2) {
        expect(a.dataHome).not.toBe(b.dataHome);
        expect(a.journalSubdir).not.toBe(b.journalSubdir);
        // And no conference key is followed by both.
        for (const key of a.conferences) expect(b.conferences).not.toContain(key);
      }
    }
  });

  test("every followed conference is one the home profiles at this build's level", () => {
    // The membership reference's conference_profiles names each code's NCAA
    // level. A home that does not carry the map yet says nothing here.
    const path = join(dataRoot(), "data", "reference", "membership.json");
    if (!existsSync(path)) return;
    const membership = JSON.parse(readFileSync(path, "utf8")) as {
      conference_profiles?: Record<string, { level: string; names: string[] }>;
    };
    const profilesByCode = membership.conference_profiles;
    if (!profilesByCode) return;
    const wrong: string[] = [];
    for (const key of site.conferences) {
      const code = key.toUpperCase();
      const p = profilesByCode[code];
      if (!p) continue;
      if (p.level !== site.ncaaDivision) wrong.push(`${key}: ${p.level}`);
    }
    expect(wrong).toEqual([]);
  });

  test("Division I's configured names are the ones its conferences print first", () => {
    // site.conferenceNames is config; for Division I it was taken from the
    // home's conference_profiles, and this holds it there.
    if (site.ncaaDivision !== "d1") return;
    const path = join(dataRoot(), "data", "reference", "membership.json");
    const membership = JSON.parse(readFileSync(path, "utf8")) as {
      conference_profiles: Record<string, { names: string[] }>;
    };
    for (const key of site.conferences) {
      const names = membership.conference_profiles[key.toUpperCase()]?.names;
      expect(site.conferenceNames[key], key).toBe(names?.[0] ?? "");
    }
  });
});

describe("the justfile builds every profile where the site links it", () => {
  const justfile = readFileSync(join(ROOT, "justfile"), "utf8");

  test("every build but the root is written into, and served at, its own path", () => {
    for (const b of publishedBuilds(["d2", "d1"], ["men", "women"])) {
      if (b.path === "") continue;
      expect(justfile, b.path).toContain(`TOUCHLINE_OUT_DIR=dist${b.path}`);
      expect(justfile, b.path).toContain(`SITE_BASE="{{site_base}}${b.path}"`);
    }
  });

  test("this build's path is its division's then its gender's", () => {
    expect(buildPath("d2", "men")).toBe("");
    expect(buildPath("d2", "women")).toBe("/women");
    expect(buildPath("d1", "men")).toBe("/d1");
  });

  test("the sample program is a member of the home conference", () => {
    const file = join(
      dataRoot(),
      "data",
      "fixtures",
      `${site.season}-${site.gender}-${site.home}.json`,
    );
    const fixtures = JSON.parse(readFileSync(file, "utf8")) as { programmes: { slug: string }[] };
    expect(fixtures.programmes.map((p) => p.slug)).toContain(site.sampleProgramme);
  });
});
