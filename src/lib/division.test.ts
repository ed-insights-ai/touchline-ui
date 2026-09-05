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
import { loadFixtures } from "./data.ts";
import {
  DISPUTED_MARK,
  disputedIdentities,
  FORFEIT_MARK,
  goalsForByProgramme,
  hasResult,
  isCounted,
  markOf,
  memberSlugs,
  overallTable,
  recordOf,
  type Season,
} from "./derive.ts";
import {
  disputedFinals,
  foldToMatches,
  matchIdentity,
  oneSidedFinals,
  postedSide,
  type Sighting,
  unpostedSides,
} from "./division.ts";
import { homeSeasons } from "./home.ts";
import type { Fixture, FixturesFile } from "./model.ts";
import { nameBookFor } from "./names.ts";

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
      // The one split the fold reads through: a posted final on one side, a
      // not-yet row on the other. Anything else is two facts in dispute. The
      // predicate is the fold's own (hasResult): a friendly's posted score is
      // still a posted score. Measured on the two 2026 Lander pre-season
      // matches, marked exhibition and scored on landerbearcats.com while
      // Southern Wesleyan's and Newberry's pages still list them unscored;
      // a test recounting with isScored called that a dispute the fold never
      // saw, and was testing its own rule rather than the site's (tl-1go
      // carries the rib side: a friendly marked on either page marks both).
      const posted = m.sightings.filter((s) => hasResult(s.fixture));
      const lag =
        posted.length > 0 &&
        new Set(posted.map(sideFree)).size === 1 &&
        m.sightings.every((s) => hasResult(s.fixture) || pending(s));
      if (!lag) {
        disagreements.push(
          `${m.identity}: ${m.sightings.map((s) => `${s.key} ${sideFree(s)}`).join("  vs  ")}`,
        );
        continue;
      }
      expect(m.oneSided, m.identity).toBe(true);
      // The folded match is the record that posted, score and all.
      expect(hasResult(m.fixture), m.identity).toBe(true);
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
    // The canonical record is the fold's choice, and the fold's rule is the
    // contract: the posted record first, the home side as the tiebreak among
    // the records that posted. Both files posting is the common shape, and
    // there the home side's own conference is canonical. Where one file has
    // posted and the other still holds the row as scheduled, the posted
    // record is canonical whichever side is at home: the 2026-08-18 Lander
    // at Southern Wesleyan match is CC's by home side and PBC's by the fold,
    // because PBC's file posted the score (and the exhibition mark) and CC's
    // did not.
    for (const m of shared.filter((m) => !m.neutral)) {
      const home = m.sightings.filter((s) => memberSlugs(s.season).has(s.fixture.home));
      expect(home.length, m.identity).toBe(1);
      const posted = m.sightings.filter((s) => hasResult(s.fixture));
      const expected =
        posted.length > 0 && posted.length < m.sightings.length
          ? (posted[0] as Sighting).key
          : (home[0] as Sighting).key;
      expect(m.key, m.identity).toBe(expected);
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
      const spoken = m.oneSided ? m.sightings.filter((s) => hasResult(s.fixture)) : m.sightings;
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

  test("a disagreement on the score itself is a dispute, never a neutral site", () => {
    const pair = shared.find((m) => m.neutral) ?? shared[0];
    expect(pair, "no shared match in this data to disagree about").toBeDefined();
    const [a, b] = (pair as (typeof shared)[number]).sightings as [Sighting, Sighting];
    const bumped: Sighting = {
      ...b,
      fixture: { ...b.fixture, home_score: (b.fixture.home_score ?? 0) + 1 },
    };
    // Since tl-wyv the fold keeps the row and marks it rather than failing
    // the build: one match, disputed, both scores kept.
    const out = foldToMatches([a, bumped]);
    expect(out).toHaveLength(1);
    expect(out[0]?.disputed).toBe(true);
    expect(out[0]?.scores).toHaveLength(2);
    // And the same pair, untouched, folds to one undisputed match.
    expect(foldToMatches([a, b])).toHaveLength(1);
    expect(foldToMatches([a, b])[0]?.disputed).toBe(false);
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

  test("a score disagreement is a dispute, whatever the status words", () => {
    const { home, peer } = records();
    const scored = (s: Sighting, n: number): Sighting => ({
      ...s,
      fixture: { ...s.fixture, status: "final", home_score: n, away_score: 0 },
    });
    const out = foldToMatches([scored(home, 1), scored(peer, 2)]);
    expect(out).toHaveLength(1);
    expect(out[0]?.disputed).toBe(true);
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

  test("final 2–0 against final 1–0 is the disputed path, not a one-sided one", () => {
    const { home, peer } = records();
    const out = foldToMatches([scored(home, 2, 0), scored(peer, 1, 0)]);
    expect(out).toHaveLength(1);
    expect(out[0]?.disputed).toBe(true);
    expect(out[0]?.oneSided).toBe(false);
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

/** A season stood up from one fixtures file, the way loadSeason does, minus
 *  the layers the fold never reads. `disputed` is what loadSeason would fill
 *  from every configured file; here it is the caller's, from the files the
 *  test actually holds. */
const seasonOf = (key: string, fixtures: FixturesFile, disputed?: ReadonlySet<string>): Season => ({
  key,
  fixtures,
  rosters: null,
  stats: null,
  matches: null,
  coverage: null,
  names: nameBookFor(fixtures),
  asOf: fixtures.collected_at.slice(0, 10),
  collectedAt: fixtures.collected_at,
  disputed,
});
const sightingOf = (season: Season, fixture: Fixture): Sighting => ({
  key: season.key,
  code: season.fixtures.conference,
  season,
  fixture,
});

describe("a forfeit final folds like any final, and the fold keeps the award", () => {
  // The pair the ruling was measured on (tl-wyv). 2024-09-05 Upper Iowa v
  // Roosevelt is in two files: GLVC's from Upper Iowa's own schedule
  // (sidearm:upper-iowa:9017, "W, 2-2" beside "Win by forfeit"), GLIAC's from
  // Roosevelt's (sidearm:roosevelt:4837, a plain final 2-2, home Upper Iowa).
  // The rib (PR #93) stores the GLVC row as final 2-2 with forfeit "home";
  // this data home still holds the row from before that fix, so the test
  // patches it to the rib's shape, and the patch is a no-op the day the
  // re-collect lands.
  const glvc = loadFixtures(2024, "men", "glvc");
  const gliac = loadFixtures(2024, "men", "gliac");
  const uiu = glvc.fixtures.find((f) => f.id === "sidearm:upper-iowa:9017") as Fixture;
  const rsu = gliac.fixtures.find((f) => f.id === "sidearm:roosevelt:4837") as Fixture;
  const awarded: Fixture = {
    ...uiu,
    status: "final",
    home_score: 2,
    away_score: 2,
    forfeit: "home",
  };
  const home = seasonOf("glvc", { ...glvc, fixtures: [awarded] });
  const peer = seasonOf("gliac", { ...gliac, fixtures: [rsu] });

  test("the rows are the ones the data home holds", () => {
    expect(uiu).toMatchObject({ date: "2024-09-05", home: "upper-iowa", away: "roosevelt" });
    expect(rsu).toMatchObject({
      date: "2024-09-05",
      home: "upper-iowa",
      away: "roosevelt",
      status: "final",
      home_score: 2,
      away_score: 2,
    });
    expect(rsu.forfeit).toBeUndefined();
    expect(matchIdentity(uiu)).toBe(matchIdentity(rsu));
  });

  test("forfeit 2-2 beside a plain 2-2 folds to the forfeit version, undisputed, in either order", () => {
    for (const order of [
      [sightingOf(home, awarded), sightingOf(peer, rsu)],
      [sightingOf(peer, rsu), sightingOf(home, awarded)],
    ]) {
      const out = foldToMatches(order);
      expect(out).toHaveLength(1);
      const m = out[0] as (typeof out)[number];
      expect(m.disputed).toBe(false);
      expect(m.oneSided).toBe(false);
      expect(m.neutral).toBe(false);
      expect(m.scores).toEqual([]);
      expect(m.fixture.forfeit).toBe("home");
      expect(m.fixture.id).toBe("sidearm:upper-iowa:9017");
      expect(m.key).toBe("glvc");
      expect(m.codes).toHaveLength(2);
      expect(markOf(m.season, m.fixture)).toBe(FORFEIT_MARK);
    }
  });

  test("the forfeit wins the fold even when it is the peer's record", () => {
    // The home conference prints the bare score and the peer marks the
    // award: the fuller fact is the peer's, and the folded match carries it.
    const bare = seasonOf("glvc", { ...glvc, fixtures: [{ ...awarded, forfeit: undefined }] });
    const marked = seasonOf("gliac", { ...gliac, fixtures: [{ ...rsu, forfeit: "home" }] });
    const out = foldToMatches([
      sightingOf(bare, bare.fixtures.fixtures[0] as Fixture),
      sightingOf(marked, marked.fixtures.fixtures[0] as Fixture),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.fixture.forfeit).toBe("home");
    expect(out[0]?.key).toBe("gliac");
    expect(out[0]?.disputed).toBe(false);
  });

  test("the record counts a home win for Upper Iowa, and scored and conceded exclude the goals", () => {
    expect(recordOf(home, "upper-iowa")).toEqual({
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      played: 1,
    });
    expect(recordOf(home, "roosevelt")).toMatchObject({
      won: 0,
      drawn: 0,
      lost: 1,
      goalsFor: 0,
      goalsAgainst: 0,
    });
    const goals = goalsForByProgramme(home).find((g) => g.slug === "upper-iowa");
    expect(goals).toMatchObject({ goals: 0, conceded: 0 });
    const row = overallTable(home).find((r) => r.slug === "upper-iowa");
    expect(row).toMatchObject({
      played: 1,
      won: 1,
      drawn: 0,
      points: 3,
      goalsFor: 0,
      goalsAgainst: 0,
    });
    // And the same pair without the award is the draw the figures say.
    const plain = seasonOf("glvc", { ...glvc, fixtures: [{ ...awarded, forfeit: undefined }] });
    expect(recordOf(plain, "upper-iowa")).toMatchObject({ drawn: 1, goalsFor: 2, goalsAgainst: 2 });
  });

  test("the same pair printing different scores takes the disputed path", () => {
    const three = seasonOf("glvc", { ...glvc, fixtures: [{ ...awarded, home_score: 3 }] });
    const out = foldToMatches([
      sightingOf(three, three.fixtures.fixtures[0] as Fixture),
      sightingOf(peer, rsu),
    ]);
    expect(out).toHaveLength(1);
    const m = out[0] as (typeof out)[number];
    expect(m.disputed).toBe(true);
    expect(m.oneSided).toBe(false);
    // The home programme's record and score, marked; both scores kept with
    // the host that printed each, in config order.
    expect(m.key).toBe("glvc");
    expect(m.fixture.home_score).toBe(3);
    expect(m.scores).toEqual([
      { key: "glvc", code: "GLVC", source: "uiupeacocks.com", home_score: 3, away_score: 2 },
      { key: "gliac", code: "GLIAC", source: "rooseveltlakers.com", home_score: 2, away_score: 2 },
    ]);
  });

  test("2022 Bloomsburg v Chestnut Hill: a final beside a scheduled twin is a lag, not a dispute", () => {
    // Both records mark it an exhibition. The fold reads a posted score
    // whether or not the match counts: a friendly's lag is still a lag, and
    // a friendly's two scores would still be a dispute, so the rule cannot
    // rest on isScored, which leaves friendlies out of the record.
    const cacc = loadFixtures(2022, "men", "cacc");
    const psac = loadFixtures(2022, "men", "psac");
    const posted = cacc.fixtures.find((f) => f.id === "sidearm:chestnut-hill:7659") as Fixture;
    const waiting = psac.fixtures.find((f) => f.id === "sidearm:bloomsburg:14253") as Fixture;
    expect(posted).toMatchObject({ status: "final", home_score: 1, away_score: 0 });
    expect(waiting.status).toBe("scheduled");
    const out = foldToMatches([
      sightingOf(seasonOf("psac", { ...psac, fixtures: [waiting] }), waiting),
      sightingOf(seasonOf("cacc", { ...cacc, fixtures: [posted] }), posted),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.oneSided).toBe(true);
    expect(out[0]?.disputed).toBe(false);
    expect(out[0]?.fixture.id).toBe(posted.id);
  });
});

describe("a disputed final keeps both scores instead of failing the build", () => {
  // Built, because no pair in the data home disagrees yet. A shared match
  // with a home side, from the live data, so that which record is the home
  // conference's is a fact and not a choice.
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

  test("both scores stand under the match, each with its source, in config order", () => {
    const { home, peer } = records();
    const out = foldToMatches([scored(peer, 1, 1), scored(home, 2, 1)]);
    expect(out).toHaveLength(1);
    const m = out[0] as (typeof out)[number];
    expect(m.disputed).toBe(true);
    expect(m.scores.map((x) => x.code)).toEqual(m.codes);
    expect(m.scores.find((x) => x.key === home.key)).toMatchObject({
      home_score: 2,
      away_score: 1,
    });
    expect(m.scores.find((x) => x.key === peer.key)).toMatchObject({
      home_score: 1,
      away_score: 1,
    });
    for (const x of m.scores) expect(x.source.length).toBeGreaterThan(0);
  });

  test("the folded record is the home programme's, whichever arrived first", () => {
    const { home, peer } = records();
    for (const order of [
      [scored(home, 2, 1), scored(peer, 1, 1)],
      [scored(peer, 1, 1), scored(home, 2, 1)],
    ]) {
      const m = foldToMatches(order)[0] as ReturnType<typeof foldToMatches>[number];
      expect(m.key).toBe(home.key);
      expect(m.fixture.id).toBe(home.fixture.id);
      expect(m.fixture.home_score).toBe(2);
      expect(m.codes).toEqual((pair as (typeof shared)[number]).codes);
    }
  });

  test("a third record still scheduled does not undo the dispute", () => {
    const { home, peer } = records();
    const waiting: Sighting = {
      ...peer,
      key: "third",
      fixture: {
        ...peer.fixture,
        status: "scheduled",
        home_score: undefined,
        away_score: undefined,
      },
    };
    const m = foldToMatches([scored(home, 2, 1), scored(peer, 1, 1), waiting])[0];
    expect(m?.disputed).toBe(true);
    expect(m?.scores).toHaveLength(2);
  });

  test("the season's figures leave it out, by the same rule the fold read", () => {
    const { home, peer } = records();
    const h = scored(home, 2, 1);
    const p = scored(peer, 1, 1);
    const disputed = disputedIdentities([
      { ...home.season.fixtures, fixtures: [h.fixture] },
      { ...peer.season.fixtures, fixtures: [p.fixture] },
    ]);
    expect([...disputed]).toEqual([matchIdentity(h.fixture)]);
    const season: Season = {
      ...home.season,
      fixtures: { ...home.season.fixtures, fixtures: [h.fixture] },
      disputed,
    };
    expect(isCounted(season, h.fixture)).toBe(false);
    expect(markOf(season, h.fixture)).toBe(DISPUTED_MARK);
    expect(recordOf(season, h.fixture.home).played).toBe(0);
    expect(goalsForByProgramme(season).every((g) => g.goals === 0 && g.conceded === 0)).toBe(true);
    // Agreement lifts it: the same two files with one score dispute nothing.
    expect(
      disputedIdentities([
        { ...home.season.fixtures, fixtures: [h.fixture] },
        { ...peer.season.fixtures, fixtures: [scored(peer, 2, 1).fixture] },
      ]).size,
    ).toBe(0);
  });

  test("final against cancelled is still a fold error, not a dispute", () => {
    const { home, peer } = records();
    const cancelled: Sighting = {
      ...peer,
      fixture: {
        ...peer.fixture,
        status: "cancelled",
        home_score: undefined,
        away_score: undefined,
      },
    };
    expect(() => foldToMatches([scored(home, 2, 1), cancelled])).toThrow(
      /disagree on the score or status/,
    );
    // And two different scores beside a cancelled third: still an error.
    expect(() =>
      foldToMatches([scored(home, 2, 1), scored({ ...peer, key: "third" }, 1, 1), cancelled]),
    ).toThrow(/disagree on the score or status/);
  });

  test("the live data holds no disputed match today, and the listing says so", () => {
    // The day this fails is the day two collectors published different
    // facts about one match: the build stands, the row is marked, and this
    // count is the number of them.
    expect(disputedFinals(seasons).map((m) => m.identity)).toEqual(
      folded.filter((m) => m.disputed).map((m) => m.identity),
    );
    for (const m of folded) {
      if (!m.disputed) expect(m.scores, m.identity).toEqual([]);
      else expect(m.scores.length, m.identity).toBeGreaterThan(1);
    }
  });
});
