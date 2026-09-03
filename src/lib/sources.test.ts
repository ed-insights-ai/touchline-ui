/**
 * What a collected file must not do to one programme.
 *
 * The site's arithmetic rests on a slug being a programme. matchIdentity folds
 * a cross-conference match by the day and the two slugs; the ledger, the
 * division's counts and the national brief all stand on that fold. One
 * programme wearing two slugs breaks it silently — two identities, two
 * matches, one of them a phantom — and it shows up first not as a wrong figure
 * but as a silence, when a date passes and the duplicate row is still waiting
 * for a result that was published against the other slug.
 *
 * THE CHECK IS NOT A NAME COLLISION, and that is the point. The obvious
 * tripwire is "no two slugs in a file resolve to the same published name", and
 * it does not catch this: `of-texas-at-dallas` renders as "Of Texas at Dallas"
 * and `ut-dallas` as "UT Dallas", two different names for one programme. A
 * check on names would have passed the very defect it was written for. (It
 * would also have fired on the NCAA tournament rounds, where two spellings map
 * to one name deliberately, through site.nameOverrides.)
 *
 * What identifies the duplicate is the SHAPE of the schedule: inside one
 * conference's file, a member and a stranger playing the same side on the same
 * day are the same programme, collected twice. Nothing legitimate looks like
 * that — the conference tournament and the NCAA rounds, where two members do
 * meet the same "opponent" on one date, are two MEMBERS, and this rule does
 * not see them.
 */

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { loadSeason, memberSlugs } from "./derive.ts";

interface Duplicate {
  conference: string;
  date: string;
  /** The side both of them are recorded against. */
  opponent: string;
  member: string;
  /** The same programme, under the name the collector reached it by. */
  alias: string;
}

const show = (d: Duplicate): string =>
  `${d.conference} ${d.date}: ${d.member} and ${d.alias} both play ${d.opponent}`;

/**
 * Defects already reported, so the gate does not block a publish over
 * something that is filed, owned and understood.
 *
 * This is not the site guessing about its sources; it is the site remembering
 * exactly what it has already said about them. Every entry names the bead that
 * owns it, and the test below fails if an entry stops matching — so the
 * exception cannot outlive the defect, and the list empties itself when the
 * collector fix lands.
 */
const KNOWN: (Duplicate & { bead: string })[] = [
  // Not an alias at all: Westminster's schedule page lists the tournament
  // matches it HOSTED at Dumke Field (MSU Denver v Western Oregon on 08-27,
  // MSU Denver v Northwest Nazarene on 08-29) and the collector read them as
  // Westminster fixtures against MSU Denver. MSU Denver's own file, and
  // Westminster's own rows those days, say who actually played. The rib's
  // tl-5ru owns the read; these four entries expire with it.
  {
    conference: "rmac",
    date: "2026-08-27",
    opponent: "westminster",
    member: "msu-denver",
    alias: "northwest-nazarene",
    bead: "tl-5ru",
  },
  {
    conference: "rmac",
    date: "2026-08-27",
    opponent: "msu-denver",
    member: "westminster",
    alias: "western-oregon",
    bead: "tl-5ru",
  },
  {
    conference: "rmac",
    date: "2026-08-29",
    opponent: "westminster",
    member: "msu-denver",
    alias: "western-oregon",
    bead: "tl-5ru",
  },
  {
    conference: "rmac",
    date: "2026-08-29",
    opponent: "msu-denver",
    member: "westminster",
    alias: "northwest-nazarene",
    bead: "tl-5ru",
  },
  {
    conference: "lsc",
    date: "2026-09-19",
    opponent: "texas-a-m-international",
    member: "ut-dallas",
    alias: "of-texas-at-dallas",
    bead: "tl-kvn",
  },
  {
    conference: "lsc",
    date: "2026-10-24",
    opponent: "texas-a-m-international",
    member: "ut-dallas",
    alias: "of-texas-at-dallas",
    bead: "tl-kvn",
  },
  // Jefferson's schedule reaches Dominican (N.Y.) under a second slug
  // (tui-1ht). UDC has the same defect in the ECC file, which is not live
  // yet; AIC had it in the NE10 file collected at 03:10 UTC on 2026-09-03 and
  // not in the one collected at 05:43.
  {
    conference: "cacc",
    date: "2026-09-19",
    opponent: "jefferson",
    member: "dominican",
    alias: "dominican-of-n-y",
    bead: "tui-1ht",
  },
];

/** Every place one file records a member and a stranger against the same side
 *  on the same day. */
function duplicates(): Duplicate[] {
  const found: Duplicate[] = [];
  for (const key of site.conferences) {
    let season: ReturnType<typeof loadSeason>;
    try {
      season = loadSeason(key);
    } catch {
      continue; // A conference the data home has not collected says nothing.
    }
    const members = memberSlugs(season);
    const sides = new Map<string, Set<string>>();
    for (const f of season.fixtures.fixtures) {
      for (const [slug, other] of [
        [f.home, f.away],
        [f.away, f.home],
      ] as const) {
        const at = `${f.date}|${other}`;
        const seen = sides.get(at) ?? new Set<string>();
        seen.add(slug);
        sides.set(at, seen);
      }
    }
    for (const [at, slugs] of sides) {
      if (slugs.size < 2) continue;
      const [date = "", opponent = ""] = at.split("|");
      for (const member of [...slugs].filter((s) => members.has(s))) {
        for (const alias of [...slugs].filter((s) => !members.has(s))) {
          found.push({ conference: key, date, opponent, member, alias });
        }
      }
    }
  }
  return found.sort((a, b) => show(a).localeCompare(show(b)));
}

const same = (a: Duplicate, b: Duplicate): boolean =>
  a.conference === b.conference &&
  a.date === b.date &&
  a.opponent === b.opponent &&
  a.member === b.member &&
  a.alias === b.alias;

describe("one programme, one slug", () => {
  test("no member and a stranger play the same side on the same day", () => {
    // Whatever is here is a programme the collector reached twice under two
    // names, and every figure that folds by slug is already counting it twice.
    const unknown = duplicates().filter((d) => !KNOWN.some((k) => same(k, d)));
    expect(unknown.map(show)).toEqual([]);
  });

  test("and the allowlist does not outlive the defect it names", () => {
    // The half that makes an allowlist safe. An entry the files no longer
    // produce is an exception with nothing left to excuse, and it would go on
    // silently excusing whatever took its place.
    const live = duplicates();
    const stale = KNOWN.filter((k) => !live.some((d) => same(k, d))).map(
      (k) => `${show(k)} — ${k.bead} says this is still true, and the files no longer say it`,
    );
    expect(stale).toEqual([]);
  });

  test("every exception names the bead that owns it", () => {
    for (const k of KNOWN) expect(k.bead, show(k)).toMatch(/^[a-z]{2,3}-[a-z0-9]{3}$/);
  });
});
