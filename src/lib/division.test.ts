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
 *   they agree on which side is at home and on the score (scheduled,
 *   postponed and cancelled are one unplayed shape; the flavour may differ;
 *   and a scored final beside a twin still marked scheduled or postponed is a
 *   lag the fold reads as the final, marked one-sided),
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
import { isScored, memberSlugs } from "./derive.ts";
import {
  foldToMatches,
  matchIdentity,
  oneSidedFinals,
  postedSide,
  type Sighting,
  unpostedSides,
} from "./division.ts";
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
  /** What a record says once the home side is set aside. Cancelled and
   *  postponed read as one unplayed word here, as they do in the fold: the
   *  two collectors' choice between them is flavour, not fact. */
  const unplayed = (status: string): boolean =>
    status === "scheduled" || status === "cancelled" || status === "postponed";
  const sideFree = (s: Sighting): string =>
    [
      `${s.fixture.home}=${s.fixture.home_score ?? "-"}`,
      `${s.fixture.away}=${s.fixture.away_score ?? "-"}`,
    ]
      .sort()
      .concat(unplayed(s.fixture.status) ? "unplayed" : s.fixture.status)
      .join("|");

  /** A record that has said nothing about the result yet. */
  const pending = (s: Sighting): boolean =>
    (s.fixture.status === "scheduled" || s.fixture.status === "postponed") &&
    s.fixture.home_score === undefined;

  test("both files publish the same score, or one has posted it and the other has not yet", () => {
    const disagreements: string[] = [];
    for (const m of shared) {
      const shapes = new Set(m.sightings.map(sideFree));
      if (shapes.size <= 1) {
        expect(m.oneSided, m.identity).toBe(false);
        continue;
      }
      // The one split the fold reads through: a scored final on one side, a
      // not-yet row on the other. Anything else is two facts in dispute.
      const posted = m.sightings.filter((s) => isScored(s.fixture));
      const lag =
        posted.length > 0 &&
        new Set(posted.map(sideFree)).size === 1 &&
        m.sightings.every((s) => isScored(s.fixture) || pending(s));
      if (!lag) {
        disagreements.push(
          `${m.identity}: ${m.sightings.map((s) => `${s.key} ${sideFree(s)}`).join("  vs  ")}`,
        );
        continue;
      }
      expect(m.oneSided, m.identity).toBe(true);
      // The folded match is the record that posted, score and all.
      expect(isScored(m.fixture), m.identity).toBe(true);
      expect(posted.some((s) => s.key === m.key && s.fixture.id === m.fixture.id)).toBe(true);
    }
    // Empty is the passing answer. A failure here is not a bug in the fold —
    // it is two collectors publishing different facts about one match, and the
    // fold has to stop choosing silently between them.
    expect(disagreements).toEqual([]);
  });

  test("a one-sided match names the page that has not posted, and the one that has", () => {
    // Today's count is the data's, not the test's: it is whatever the night
    // left unposted, and zero on a morning every page has caught up.
    const oneSided = oneSidedFinals(seasons);
    expect(oneSided.map((m) => m.identity)).toEqual(
      folded.filter((m) => m.oneSided).map((m) => m.identity),
    );
    for (const m of oneSided) {
      const unposted = unpostedSides(m);
      expect(unposted.length, m.identity).toBe(m.sightings.length - 1);
      const posted = postedSide(m);
      // Each side is one of the two programmes, and they are different ones.
      const pair = new Set([m.fixture.home, m.fixture.away]);
      expect(pair.has(posted.slug), m.identity).toBe(true);
      for (const u of unposted) {
        expect(pair.has(u.slug), m.identity).toBe(true);
        expect(u.slug, m.identity).not.toBe(posted.slug);
        expect(u.name.length, m.identity).toBeGreaterThan(0);
      }
    }
    // And a match both files scored names nobody.
    for (const m of shared.filter((m) => !m.oneSided)) expect(unpostedSides(m)).toEqual([]);
  });

  test("a match with a home side: exactly one record is that side's own conference", () => {
    for (const m of shared.filter((m) => !m.neutral)) {
      const home = m.sightings.filter((s) => memberSlugs(s.season).has(s.fixture.home));
      expect(home.length, m.identity).toBe(1);
      expect(m.key, m.identity).toBe((home[0] as Sighting).key);
    }
  });

  test("a neutral-site match is the records disagreeing on the home side and nothing else", () => {
    for (const m of shared) {
      const homes = new Set(m.sightings.map((s) => s.fixture.home));
      expect(m.neutral, m.identity).toBe(homes.size > 1);
      if (!m.neutral) continue;
      // Measured on the two Rogers State tournament matches: on 08-27 each
      // site wrote itself as home; on 08-29 each wrote the OTHER side as home
      // under different venue strings. Neither shape is a home side, which is
      // why the definition is the disagreement itself and not who claimed
      // what. Score and status agree — across the records that have posted a
      // score, if only one has — or it would not have folded at all.
      const spoken = m.oneSided ? m.sightings.filter((s) => isScored(s.fixture)) : m.sightings;
      expect(new Set(spoken.map(sideFree)).size, m.identity).toBe(1);
      // Canonical is the first record in config order: stable, and not a
      // claim about home.
      expect(m.key, m.identity).toBe((m.sightings[0] as Sighting).key);
    }
  });

  test("the two Rogers State tournament matches are the neutral cases this was measured on", () => {
    // 2026-08-27 Maryville v Southern Nazarene and 2026-08-29 McKendree v
    // Southern Nazarene, Claremore, Okla.: the GAC file (from SNU's site) says
    // SNU home; the GLVC file says the GLVC side home; scores agree.
    const expected = [
      "2026-08-27 maryville v southern-nazarene",
      "2026-08-29 mckendree v southern-nazarene",
    ];
    const neutral = folded.filter((m) => m.neutral).map((m) => m.identity);
    for (const id of expected) expect(neutral, id).toContain(id);
    // Neither is printed twice: one folded match each.
    for (const id of expected) expect(folded.filter((m) => m.identity === id)).toHaveLength(1);
  });

  test("a disagreement on the score itself is a hard failure, never a neutral site", () => {
    const pair = shared.find((m) => m.neutral) ?? shared[0];
    expect(pair, "no shared match in this data to disagree about").toBeDefined();
    const [a, b] = (pair as (typeof shared)[number]).sightings as [Sighting, Sighting];
    const bumped: Sighting = {
      ...b,
      fixture: { ...b.fixture, home_score: (b.fixture.home_score ?? 0) + 1 },
    };
    expect(() => foldToMatches([a, bumped])).toThrow(/disagree on the score or status/);
    // And the same pair, untouched, folds to one match.
    expect(foldToMatches([a, b])).toHaveLength(1);
  });
});

describe("cancelled and postponed fold as one unplayed shape", () => {
  // The ruling: "Cancelled and postponed fold as one unplayed shape with the
  // home side's conference status kept; a score disagreement still throws, a
  // status flavour disagreement never does." Measured on 2026-08-27 Staten
  // Island v Assumption, which ECC's file calls postponed and NE10's calls
  // cancelled. Built here on a shared match with a home side, so that which
  // record is the home conference's is a fact of the data and not a choice.
  const pair = shared.find((m) => !m.neutral);
  const records = (): { home: Sighting; peer: Sighting } => {
    expect(pair, "no shared match with a home side in this data").toBeDefined();
    const m = pair as (typeof shared)[number];
    const home = m.sightings.find((s) => memberSlugs(s.season).has(s.fixture.home)) as Sighting;
    const peer = m.sightings.find((s) => s !== home) as Sighting;
    return { home, peer };
  };
  const withStatus = (s: Sighting, status: Sighting["fixture"]["status"]): Sighting => ({
    ...s,
    fixture: { ...s.fixture, status, home_score: undefined, away_score: undefined },
  });

  test("home conference says cancelled, the peer says postponed: the match is cancelled", () => {
    const { home, peer } = records();
    const out = foldToMatches([withStatus(home, "cancelled"), withStatus(peer, "postponed")]);
    expect(out).toHaveLength(1);
    expect(out[0]?.key).toBe(home.key);
    expect(out[0]?.fixture.status).toBe("cancelled");
  });

  test("home conference says postponed, the peer says cancelled: the match is postponed", () => {
    const { home, peer } = records();
    // The peer arrives first, so that the answer is provably the home
    // conference's word and not the first record's.
    const out = foldToMatches([withStatus(peer, "cancelled"), withStatus(home, "postponed")]);
    expect(out).toHaveLength(1);
    expect(out[0]?.key).toBe(home.key);
    expect(out[0]?.fixture.status).toBe("postponed");
  });

  test("home conference says postponed, the peer still says scheduled: the match is postponed", () => {
    // 2026-09-02 Caldwell v Molloy the day ECC joined: CACC had moved it,
    // ECC had not yet. No result either way, so the same rule and the same
    // answer: the home conference's word.
    const { home, peer } = records();
    const out = foldToMatches([withStatus(peer, "scheduled"), withStatus(home, "postponed")]);
    expect(out).toHaveLength(1);
    expect(out[0]?.fixture.status).toBe("postponed");
    expect(
      foldToMatches([withStatus(home, "scheduled"), withStatus(peer, "postponed")])[0]?.fixture
        .status,
    ).toBe("scheduled");
  });

  test("a score disagreement still throws, whatever the status words", () => {
    const { home, peer } = records();
    const scored = (s: Sighting, n: number): Sighting => ({
      ...s,
      fixture: { ...s.fixture, status: "final", home_score: n, away_score: 0 },
    });
    expect(() => foldToMatches([scored(home, 1), scored(peer, 2)])).toThrow(
      /disagree on the score or status/,
    );
  });

  test("scheduled against scheduled folds as before: one match, no marker", () => {
    const { home, peer } = records();
    const out = foldToMatches([withStatus(home, "scheduled"), withStatus(peer, "scheduled")]);
    expect(out).toHaveLength(1);
    expect(out[0]?.fixture.status).toBe("scheduled");
    expect(out[0]?.oneSided).toBe(false);
    expect(out[0]?.key).toBe(home.key);
  });

  test("final against cancelled still throws: cancelled is a claim, not a silence", () => {
    // The owner's line (2026-09-04): scheduled and postponed both mean "not
    // yet"; cancelled says no match happened. A scored final against that is
    // a real disagreement, and the fold refuses to choose.
    const { home, peer } = records();
    const final: Sighting = {
      ...home,
      fixture: { ...home.fixture, status: "final", home_score: 1, away_score: 0 },
    };
    expect(() => foldToMatches([final, withStatus(peer, "cancelled")])).toThrow(
      /disagree on the score or status/,
    );
    // And the other way about: a cancelled home record against a final peer.
    expect(() =>
      foldToMatches([
        withStatus(home, "cancelled"),
        { ...peer, fixture: { ...peer.fixture, status: "final", home_score: 1, away_score: 0 } },
      ]),
    ).toThrow(/disagree on the score or status/);
  });
});

describe("a scored final beats a twin that has not posted yet", () => {
  // The ruling (owner, 2026-09-04): the split between a scored final and a
  // scheduled twin is always a lag, never a disagreement. Measured three
  // times in one week — 2026-09-02 Findlay v Indianapolis, 2026-09-03
  // Harding v Dallas Baptist, 2026-09-03 Cedarville v McKendree — each time
  // one programme's page posting the score the same night and the opponent's
  // page staying scheduled for eighteen hours or more, and each time the
  // build refusing until it caught up. Built, like the block above, on a
  // shared match with a home side.
  const pair = shared.find((m) => !m.neutral);
  const records = (): { home: Sighting; peer: Sighting } => {
    expect(pair, "no shared match with a home side in this data").toBeDefined();
    const m = pair as (typeof shared)[number];
    const home = m.sightings.find((s) => memberSlugs(s.season).has(s.fixture.home)) as Sighting;
    const peer = m.sightings.find((s) => s !== home) as Sighting;
    return { home, peer };
  };
  const scored = (s: Sighting, h: number, a: number): Sighting => ({
    ...s,
    fixture: { ...s.fixture, status: "final", home_score: h, away_score: a },
  });
  const unposted = (s: Sighting, status: "scheduled" | "postponed" | "cancelled"): Sighting => ({
    ...s,
    fixture: { ...s.fixture, status, home_score: undefined, away_score: undefined },
  });

  test("final against scheduled folds to the final, marked one-sided", () => {
    const { home, peer } = records();
    const out = foldToMatches([scored(home, 2, 0), unposted(peer, "scheduled")]);
    expect(out).toHaveLength(1);
    const m = out[0] as (typeof out)[number];
    expect(m.oneSided).toBe(true);
    expect(m.fixture.status).toBe("final");
    expect(m.fixture.home_score).toBe(2);
    expect(m.fixture.away_score).toBe(0);
    // Both conferences collected it; both codes stand.
    expect(m.codes).toHaveLength(2);
    expect(m.sightings).toHaveLength(2);
    expect(m.neutral).toBe(false);
    // The page that has not posted is the peer's own member side.
    expect(unpostedSides(m).map((u) => u.key)).toEqual([peer.key]);
    expect(postedSide(m).key).toBe(home.key);
  });

  test("and the folded record is the one that posted, whichever conference is home", () => {
    // The home conference's page is the one still scheduled: the fold still
    // takes the score, so the record — and the link — is the peer's.
    const { home, peer } = records();
    const out = foldToMatches([unposted(home, "scheduled"), scored(peer, 1, 1)]);
    expect(out).toHaveLength(1);
    expect(out[0]?.oneSided).toBe(true);
    expect(out[0]?.key).toBe(peer.key);
    expect(out[0]?.fixture.id).toBe(peer.fixture.id);
    expect(unpostedSides(out[0] as (typeof out)[number]).map((u) => u.key)).toEqual([home.key]);
  });

  test("final against postponed folds the same way: postponed is also not yet", () => {
    const { home, peer } = records();
    const out = foldToMatches([scored(home, 3, 1), unposted(peer, "postponed")]);
    expect(out).toHaveLength(1);
    expect(out[0]?.oneSided).toBe(true);
    expect(out[0]?.fixture.status).toBe("final");
    expect(out[0]?.fixture.home_score).toBe(3);
    expect(foldToMatches([unposted(peer, "postponed"), scored(home, 3, 1)])[0]?.oneSided).toBe(
      true,
    );
  });

  test("final 2–0 against final 1–0 still throws exactly as before", () => {
    const { home, peer } = records();
    expect(() => foldToMatches([scored(home, 2, 0), scored(peer, 1, 0)])).toThrow(
      /disagree on the score or status/,
    );
  });

  test("final against final with the same score is one match and no marker", () => {
    const { home, peer } = records();
    const out = foldToMatches([scored(home, 2, 0), scored(peer, 2, 0)]);
    expect(out).toHaveLength(1);
    expect(out[0]?.oneSided).toBe(false);
    expect(out[0]?.key).toBe(home.key);
    expect(unpostedSides(out[0] as (typeof out)[number])).toEqual([]);
  });

  test("the marker is the fold's, not the caller's order", () => {
    const { home, peer } = records();
    const a = foldToMatches([scored(home, 2, 0), unposted(peer, "scheduled")]);
    const b = foldToMatches([unposted(peer, "scheduled"), scored(home, 2, 0)]);
    expect(a[0]?.key).toBe(b[0]?.key);
    expect(a[0]?.codes).toEqual(b[0]?.codes);
    expect(a[0]?.oneSided).toBe(true);
    expect(b[0]?.oneSided).toBe(true);
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
