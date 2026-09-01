/**
 * The fold that makes one match out of two records.
 *
 * The national page reads three conference files, and a match between two of
 * those conferences is in two of them — once from each member's published
 * schedule, under two different collector ids. Everything that spans
 * conferences has to fold them back together first, and the fold rests on
 * three things being true of the data:
 *
 *   the two records agree on the date and the two slugs,
 *   they agree on which side is at home, the score and the status,
 *   and exactly one of them is the file of the conference the home side plays in.
 *
 * The first is what the identity is made of. The second is what makes it safe
 * to keep either record. The third is what makes the link deterministic. None
 * of them is assumed here; each is recounted from the files, so the day a
 * collector changes its mind these tests say so rather than the page quietly
 * publishing whichever record it saw first.
 */

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { memberSlugs } from "./derive.ts";
import { foldToMatches, matchIdentity, type Sighting } from "./division.ts";
import { homeSeasons } from "./home.ts";

const seasons = homeSeasons();

/** Every record in every collected file, in config order. */
const allSightings: Sighting[] = seasons.flatMap((season) =>
  season.fixtures.fixtures.map((fixture) => ({
    key: season.key,
    code: season.fixtures.conference,
    season,
    fixture,
  })),
);

const folded = foldToMatches(allSightings);
const shared = folded.filter((m) => m.sightings.length > 1);

describe("what makes two records one match", () => {
  test("the identity does not care which side is at home", () => {
    const f = (allSightings[0] as Sighting).fixture;
    expect(matchIdentity(f)).toBe(matchIdentity({ ...f, home: f.away, away: f.home } as typeof f));
  });

  test("the identity is never the collector's id", () => {
    // Two files, two ids, one match. An id-keyed fold is the bug this exists
    // to have fixed, so it is worth stating that no two sightings of a shared
    // match share one.
    expect(shared.length, "no shared match in this data to fold").toBeGreaterThan(0);
    for (const m of shared) {
      const ids = new Set(m.sightings.map((s) => s.fixture.id));
      expect(ids.size, m.identity).toBe(m.sightings.length);
    }
  });

  test("a shared match is one match per conference, never two from one", () => {
    for (const m of shared) {
      expect(new Set(m.sightings.map((s) => s.key)).size, m.identity).toBe(m.sightings.length);
    }
  });
});

describe("the records agree, which is what makes folding safe", () => {
  test("both files publish the same home side, score and status", () => {
    const disagreements: string[] = [];
    for (const m of shared) {
      const shape = (s: Sighting): string =>
        [
          s.fixture.home,
          s.fixture.away,
          s.fixture.home_score ?? "-",
          s.fixture.away_score ?? "-",
          s.fixture.status ?? "-",
        ].join("|");
      const shapes = new Set(m.sightings.map(shape));
      if (shapes.size > 1) {
        disagreements.push(
          `${m.identity}: ${m.sightings.map((s) => `${s.key} ${shape(s)}`).join("  vs  ")}`,
        );
      }
    }
    // Empty is the passing answer. A failure here is not a bug in the fold —
    // it is two collectors publishing different facts about one match, and the
    // fold has to stop choosing silently between them.
    expect(disagreements).toEqual([]);
  });

  test("exactly one of them is the home side's own conference", () => {
    for (const m of shared) {
      const home = m.sightings.filter((s) => memberSlugs(s.season).has(s.fixture.home));
      expect(home.length, m.identity).toBe(1);
      expect(m.key, m.identity).toBe((home[0] as Sighting).key);
    }
  });
});

describe("the answer does not move when the caller's order does", () => {
  test("codes read in config order however the sightings arrive", () => {
    const backwards = foldToMatches([...allSightings].reverse());
    const byIdentity = new Map(backwards.map((m) => [m.identity, m]));
    for (const m of folded) {
      const other = byIdentity.get(m.identity);
      expect(other?.codes, m.identity).toEqual(m.codes);
      expect(other?.key, m.identity).toBe(m.key);
    }
  });

  test("and the codes are the config's order, not the alphabet's", () => {
    const rank = (code: string): number =>
      site.conferences.findIndex(
        (k) => seasons.find((s) => s.key === k)?.fixtures.conference === code,
      );
    for (const m of shared) {
      const ranks = m.codes.map(rank);
      expect(ranks, m.identity).toEqual([...ranks].sort((a, b) => a - b));
    }
  });
});
