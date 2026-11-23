// A sample data home (data/sample.json) narrows a build to the one conference
// it holds; a full home, with no manifest, narrows nothing.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BuildProfile,
  profileForHome,
  readSampleManifest,
  type SampleManifest,
} from "../site.config.ts";

const profile: BuildProfile = {
  conferences: ["gac", "lsc", "gsc"],
  home: "lsc",
  division: "NCAA Division II men's soccer",
  divisionConferences: 19,
  dataHome: "~/keelson/d2-soccer",
  journalSubdir: "",
  sampleProgramme: "harding",
};

const gac: SampleManifest = {
  schema: "touchline.sample/1",
  season: 2026,
  conference: "gac",
  genders: ["men", "women"],
};

describe("a sample data home", () => {
  test("a full home changes nothing: every configured conference stays required", () => {
    expect(profileForHome(profile, null, "men")).toBe(profile);
  });

  test("a sample narrows the build to its conference and opens on it", () => {
    const p = profileForHome(profile, gac, "men");
    expect(p.conferences).toEqual(["gac"]);
    expect(p.home).toBe("gac");
    expect(p.sampleProgramme).toBe("harding");
  });

  test("a sample of a conference the profile does not follow is refused", () => {
    expect(() => profileForHome(profile, { ...gac, conference: "a10" }, "men")).toThrow(/a10/);
  });

  test("a sample without this build's gender is refused", () => {
    expect(() => profileForHome(profile, { ...gac, genders: ["men"] }, "women")).toThrow(/women/);
  });

  test("the manifest is read from data/sample.json, and only under its schema", () => {
    const root = mkdtempSync(join(tmpdir(), "touchline-sample-"));
    expect(readSampleManifest(root)).toBeNull();
    mkdirSync(join(root, "data"));
    writeFileSync(join(root, "data", "sample.json"), JSON.stringify(gac));
    expect(readSampleManifest(root)?.conference).toBe("gac");
    writeFileSync(join(root, "data", "sample.json"), JSON.stringify({ ...gac, schema: "x/1" }));
    expect(() => readSampleManifest(root)).toThrow(/touchline.sample\/1/);
  });
});
