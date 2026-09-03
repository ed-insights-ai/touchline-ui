// Conference keys, held to every seam that carries one.
//
// A key is a file key: it names the fixtures file, the journal file the CLI
// writes, and the route the page is served from. G-MAC is the first key with
// a hyphen, and a hyphen is exactly the character a slugger, a route param or
// a template might treat as a separator. So the claim worth testing is that
// every configured key round-trips whole through each of those, against the
// live config, so the next unusual key is caught the day it is added.

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { loadFixtures, seasonKey } from "./data.ts";

/** The journal file name scripts/journal/cli.ts builds (`keyOf` there):
 *  `journal-${season}-${gender}-${key}.json`. Pinned rather than imported,
 *  because the CLI module is a command, not a library. */
const journalFileName = (key: string): string =>
  `journal-${site.season}-${site.gender}-${key}.json`;

describe("every configured conference key", () => {
  test("is a lowercase file key: [a-z0-9-]+", () => {
    for (const key of site.conferences) {
      expect(key).toMatch(/^[a-z0-9-]+$/);
      expect(key).toBe(key.toLowerCase());
    }
  });

  test("names its season file whole, and the fixtures file exists in the data home", () => {
    for (const key of site.conferences) {
      expect(seasonKey(site.season, site.gender, key)).toBe(`${site.season}-${site.gender}-${key}`);
      const fixtures = loadFixtures(site.season, site.gender, key);
      expect(fixtures.fixtures.length).toBeGreaterThan(0);
    }
  });

  test("survives the journal file name the CLI builds, whole", () => {
    for (const key of site.conferences) {
      const name = journalFileName(key);
      expect(name.startsWith(`journal-${site.season}-${site.gender}-`)).toBe(true);
      expect(name.endsWith(`-${key}.json`)).toBe(true);
      // The key comes back out of the name unchanged: no character was
      // treated as a separator or escaped on the way in.
      expect(name.slice(`journal-${site.season}-${site.gender}-`.length, -".json".length)).toBe(
        key,
      );
    }
  });

  test("survives the Astro route param unchanged", () => {
    for (const key of site.conferences) {
      expect(encodeURIComponent(key)).toBe(key);
      expect(decodeURIComponent(key)).toBe(key);
    }
  });

  test("is unique, and the home conference is one of them", () => {
    expect(new Set(site.conferences).size).toBe(site.conferences.length);
    expect(site.conferences).toContain(site.home);
  });
});
