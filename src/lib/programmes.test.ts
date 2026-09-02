// The programmes reference, held to its contract and to the membership.
//
// The reference is built in the rib and mirrored into the data home; this
// site only reads it. So the claims worth testing are the seam's: the mirror
// parses as the contract this site vendors, every member of every followed
// conference-season has a row, a member without one fails the build by name,
// a stranger renders absence, and nothing here reads a file in this repo.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { site } from "../site.config.ts";
import { loadFixtures } from "./data.ts";
import { pointOf } from "./geo.ts";
import {
  assertProgrammesFor,
  identityLine,
  loadProgrammes,
  missingProgrammes,
  PROGRAMMES_SCHEMA,
  programmeOf,
} from "./programmes.ts";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/** The first member of the first followed conference: a row the reference
 *  must hold, so the shape of a hit can be checked against a real one. */
function firstMember(): string {
  const key = site.conferences[0];
  if (!key) throw new Error("site.conferences is empty");
  const slug = loadFixtures(site.season, site.gender, key).programmes[0]?.slug;
  if (!slug) throw new Error(`${key} lists no programmes`);
  return slug;
}

/** What a call throws, as its message — or "" when it does not throw. */
function thrownMessage(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  return "";
}

describe("the reference", () => {
  test("the mirrored reference parses as touchline.programmes/2", () => {
    expect(loadProgrammes().schema).toBe(PROGRAMMES_SCHEMA);
  });

  test("every member of every followed conference-season has a row", () => {
    const rows = loadProgrammes().programmes;
    for (const key of site.conferences) {
      const members = loadFixtures(site.season, site.gender, key).programmes;
      expect(missingProgrammes(members, rows), key).toEqual([]);
    }
  });

  test("the reference lives in the data home, not in this repo", () => {
    expect(existsSync(resolve(REPO_ROOT, "programmes.json"))).toBe(false);
    expect(existsSync(resolve(REPO_ROOT, "programme-coordinates.json"))).toBe(false);
  });
});

describe("the build gate", () => {
  test("a member with no row fails the build naming the slug and the conference-season", () => {
    const members = [{ slug: "harding" }, { slug: "no-such-programme" }];
    const message = thrownMessage(() =>
      assertProgrammesFor(members, "2026-men-test", { harding: {} }),
    );
    expect(message).toContain("no-such-programme");
    expect(message).toContain("2026-men-test");
    // The member that has a row is not a fault, and must not be named as one.
    expect(message).not.toContain("harding");
  });

  test("with every member present, it does not throw", () => {
    const members = [{ slug: "harding" }, { slug: "no-such-programme" }];
    const rows = { harding: {}, "no-such-programme": {} };
    expect(() => assertProgrammesFor(members, "2026-men-test", rows)).not.toThrow();
  });
});

describe("what a slug resolves to", () => {
  test("a stranger renders the absence state", () => {
    expect(identityLine("no-such-programme")).toBeNull();
    expect(pointOf("no-such-programme")).toBeNull();
  });

  test("identityLine joins nickname and town with a middle dot", () => {
    const slug = firstMember();
    const row = programmeOf(slug);
    expect(row, slug).not.toBeNull();
    if (!row) return;
    expect(identityLine(slug)).toBe(`${row.nickname} · ${row.city}`);
  });

  test("a point is the town's Gazetteer point, with its state", () => {
    const slug = firstMember();
    const row = programmeOf(slug);
    expect(row, slug).not.toBeNull();
    if (!row) return;
    expect(pointOf(slug)).toEqual({
      city: row.city,
      lat: row.point.lat,
      lon: row.point.lon,
      state: row.provenance.point.state ?? null,
    });
  });
});
