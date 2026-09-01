// The division's validator.
//
// The conference validator's contract, applied to a claim with no single
// conference behind it. Two things make that more than a copy.
//
// A division figure is a count of MATCHES, so every count checked here comes
// through divisionCounts() rather than through any conference's own — a claim
// held against the sum would pass on a number the page does not print.
//
// And a comparative on this surface ranges across the conference lines, which
// is the one claim only this page can make. The conference ctx resolves a slug
// only if it is a member of that conference, so every cross-conference
// comparative would have failed to resolve and dropped; makeNationalCtx puts
// every programme in one universe, each resolving to its own season, and the
// shared checkers then answer a division claim and a conference claim with the
// same code.

import { conferenceOpensOn, type Fixture, type Season, unresolved } from "../../src/lib/derive.ts";
import { divisionCounts, matchIdentity } from "../../src/lib/division.ts";
import type { NationalJournalFile } from "../../src/lib/journal.ts";
import { divisionVsOutside } from "./national.ts";
import {
  type Checker,
  type ClaimReport,
  type Ctx,
  judge,
  makeNationalCtx,
  POLICY,
  type ReviewLine,
  review,
  shouldDrop,
} from "./validate.ts";

type Basis = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const has = (b: Basis, ...keys: string[]): boolean => keys.some((k) => b[k] !== undefined);

function compare(b: Basis, key: string, actual: number, out: string[]): void {
  const claimed = num(b[key]);
  if (claimed !== null && claimed !== actual) {
    out.push(`${key}: claimed ${claimed}, data holds ${actual}`);
  }
}

/** The division's own checkers. Every one of them answers a question no
 *  conference file can: the shared checkers below handle everything that is
 *  about a programme, and these handle everything that is about the division. */
function divisionCheckers(seasons: readonly Season[]): Checker[] {
  const byCode = new Map(seasons.map((s) => [s.fixtures.conference.toLowerCase(), s]));
  const conferenceOf = (b: Basis): Season | null =>
    typeof b.conference === "string" ? (byCode.get(b.conference.toLowerCase()) ?? null) : null;

  return [
    {
      name: "division_counts",
      claims: (b) =>
        b.source === "division" &&
        has(b, "matches_total", "matches_played", "silent_finals", "box_score_gaps", "friendlies"),
      check: (b) => {
        const d = divisionCounts(seasons);
        const out: string[] = [];
        compare(b, "matches_total", d.total, out);
        compare(b, "matches_played", d.played, out);
        compare(b, "silent_finals", d.silentFinals, out);
        compare(b, "box_score_gaps", d.gaps, out);
        compare(b, "friendlies", d.exhibitions, out);
        return out;
      },
      // The trap this surface exists to avoid, said out loud in the report.
      note: () => "counted as matches: a match two conferences collected is one match, not two",
    },
    {
      name: "division_record",
      claims: (b) => b.derived_from === "division" && has(b, "wins", "draws", "losses", "gf", "ga"),
      check: (b) => {
        const r = divisionVsOutside(seasons, programmeHomes(seasons));
        const out: string[] = [];
        compare(b, "wins", r.wins, out);
        compare(b, "draws", r.draws, out);
        compare(b, "losses", r.losses, out);
        compare(b, "gf", r.gf, out);
        compare(b, "ga", r.ga, out);
        return out;
      },
      note: () =>
        "against programmes outside the division — a match between two covered conferences is neither a win nor a loss for it",
    },
    {
      name: "conference_counts",
      claims: (b) =>
        typeof b.conference === "string" &&
        has(b, "matches_total", "matches_played", "silent_finals", "past_date_no_result"),
      check: (b) => {
        const s = conferenceOf(b);
        if (!s)
          return [`conference: "${String(b.conference)}" is not a conference this site covers`];
        const u = unresolved(s);
        const counts = divisionCounts([s]);
        const out: string[] = [];
        compare(b, "matches_total", counts.total, out);
        compare(b, "matches_played", counts.played, out);
        compare(b, "silent_finals", u.finalsWithoutScore.length, out);
        compare(b, "past_date_no_result", u.pastDateNoResult.length, out);
        return out;
      },
    },
    {
      name: "conference_opens",
      claims: (b) => typeof b.conference_opens === "string",
      check: (b) => {
        // Which conference's opening? A division claim has to say, because
        // there are three answers and the page prints all of them.
        const s = conferenceOf(b);
        if (!s) {
          return [
            'conference_opens: a division claim must name the conference — add "conference": "<code>"',
          ];
        }
        const actual = conferenceOpensOn(s);
        return b.conference_opens === actual
          ? []
          : [
              `conference_opens: claimed ${String(b.conference_opens)}, ${s.fixtures.conference} opens ${actual ?? "on no published date"}`,
            ];
      },
    },
    {
      name: "division_set",
      claims: (b) => typeof b.set === "string" && has(b, "count", "all_of"),
      check: (b) => {
        const pick = SETS[String(b.set)];
        if (!pick) return [`set: "${String(b.set)}" is not a set this validator enumerates`];
        // Folded, because a silence two conferences both recorded is one
        // silence — the same rule the strip's own figure follows.
        const found = new Map<string, { home: string; away: string }>();
        for (const s of seasons) {
          for (const f of pick(s)) found.set(matchIdentity(f), { home: f.home, away: f.away });
        }
        const members = [...found.values()];
        const out: string[] = [];
        const claimed = num(b.count);
        if (claimed !== null && claimed !== members.length) {
          out.push(`count: claimed ${claimed}, the division holds ${members.length}`);
        }
        if (typeof b.all_of === "string") {
          const odd = members.filter((m) => m.home !== b.all_of && m.away !== b.all_of);
          if (odd.length > 0) {
            out.push(
              `all_of: ${odd.length} of ${members.length} do not involve ${String(b.all_of)}`,
            );
          }
        }
        return out;
      },
    },
  ];
}

/** Every programme, mapped to the conference file it plays in. */
function programmeHomes(seasons: readonly Season[]): Map<string, Season> {
  const home = new Map<string, Season>();
  for (const s of seasons) for (const p of s.fixtures.programmes) home.set(p.slug, s);
  return home;
}

const SETS: Record<string, (s: Season) => Fixture[]> = {
  silent_finals: (s) => unresolved(s).finalsWithoutScore,
  past_date_no_result: (s) => unresolved(s).pastDateNoResult,
  silences: (s) => {
    const u = unresolved(s);
    return [...u.finalsWithoutScore, ...u.pastDateNoResult];
  },
};

/** The shared checkers a division claim may use. Each is about a PROGRAMME,
 *  and each now reads that programme's own conference file, so the same code
 *  answers a conference claim and a division one. Deliberately a short list:
 *  a season-wide checker in here would reach for ctx.season, which the
 *  division's ctx refuses to answer. */
const SHARED = new Set(["comparative", "team_record", "team_goals", "team_goal_share"]);

export interface NationalValidationReport {
  schema: "touchline.national-validation/1";
  journal: string;
  season: number;
  gender: string;
  validated_at: string;
  policy: string;
  totals: {
    checked: number;
    verified: number;
    contradicted: number;
    unverifiable: number;
    dropped: number;
  };
  review: ReviewLine[];
  claims: ClaimReport[];
}

export interface NationalValidationResult {
  journal: NationalJournalFile;
  report: NationalValidationReport;
}

/**
 * Recompute the division's journal, and drop what the data cannot confirm.
 *
 * A dropped headline empties the file's writing rather than the file: the
 * masthead falls back to its floor, which is what it renders with no journal
 * at all. Correctness over freshness — the page is never empty and never wrong.
 */
export function validateNationalJournal(
  journal: NationalJournalFile,
  seasons: readonly Season[],
  name: string,
  sharedCheckers: readonly Checker[],
): NationalValidationResult {
  const ctx: Ctx = makeNationalCtx(seasons);
  const checkers = [
    ...divisionCheckers(seasons),
    ...sharedCheckers.filter((c) => SHARED.has(c.name)),
  ];
  const out: NationalJournalFile = structuredClone(journal);
  const claims: ClaimReport[] = [];

  // Dates the division establishes rather than any claim: every collect, and
  // every conference's opening. A dateline is not a claim.
  const page = new Set<string>();
  for (const s of seasons) {
    for (const iso of [s.asOf, s.collectedAt, conferenceOpensOn(s) ?? ""]) {
      for (const m of iso.slice(0, 10).matchAll(/\d+/g)) page.add(String(Number(m[0])));
    }
  }

  const { checker, verdict, mismatches, notes } = judge(out.basis, ctx, checkers);
  // The headline and dek stand or fall together: they are one lede, the dek
  // exists to stand the headline up, and a dek left under a dropped headline
  // would be a sentence supporting nothing.
  const dropped = out.basis ? shouldDrop("observed", verdict) : false;
  claims.push({
    path: "headline",
    label: "observed",
    text: [out.headline, out.dek].filter(Boolean).join(" "),
    checker,
    verdict: out.basis ? verdict : "unverifiable",
    mismatches: out.basis ? mismatches : ["the lede carries no basis"],
    dropped,
    ...(notes.length ? { note: notes.join("; ") } : {}),
  });

  const reviews: ReviewLine[] = dropped
    ? []
    : [
        ...review("headline", out.headline, out.basis, page),
        ...review("dek", out.dek, out.basis, page),
      ];

  const result: NationalJournalFile = dropped ? { ...out, headline: "", dek: undefined } : out;

  const validated_at = new Date().toISOString();
  return {
    journal: { ...result, validation: { policy: POLICY, validated_at } },
    report: {
      schema: "touchline.national-validation/1",
      journal: name,
      season: journal.season,
      gender: journal.gender,
      validated_at,
      policy: POLICY,
      totals: {
        checked: claims.length,
        verified: claims.filter((c) => c.verdict === "verified").length,
        contradicted: claims.filter((c) => c.verdict === "contradicted").length,
        unverifiable: claims.filter((c) => c.verdict === "unverifiable").length,
        dropped: claims.filter((c) => c.dropped).length,
      },
      review: reviews,
      claims,
    },
  };
}
