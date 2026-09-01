// The AI seam. A journal file supplies the writing — headline, dek, findings,
// the players worth watching — inside the evidence grammar the design fixed.
//
// It is never a runtime dependency. A journal that is missing, stale, or
// malformed leaves the pages standing: they fall back to what the data alone
// can say. AI enhances; it does not hold the build hostage.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { dataRoot, seasonKey } from "./data.ts";
import {
  boxScoreGaps,
  conferenceOpensOn,
  fixtureCount,
  goalsForByProgramme,
  lastResult,
  outsideRecord,
  playedCount,
  type Season,
  scoredCount,
  tableIsLive,
  unresolved,
} from "./derive.ts";
import { dayOfMonth, daysBetween, monShort, shortDate, spell } from "./format.ts";

export const JOURNAL_SCHEMA = "touchline.journal/1";

/** The evidence grammar, exactly as the design fixed it. A claim carries its
 *  label or it does not go on the page. */
export const evidenceLabelSchema = z.enum([
  "observed",
  "derived",
  "signal",
  "projected",
  "context",
]);
export type EvidenceLabel = z.infer<typeof evidenceLabelSchema>;

/** `basis` is whatever the validator needs to recheck the claim. Its shape is
 *  the claim's business, so it is held open — but it must be present. */
const basisSchema = z.record(z.string(), z.unknown());

export const journalChartSchema = z
  .object({
    kind: z.string().min(1),
    caption: z.string().optional(),
    values: z.record(z.string(), z.number()),
    highlight: z.string().optional(),
  })
  .strict();
export type JournalChart = z.infer<typeof journalChartSchema>;

export const journalFindingSchema = z
  .object({
    label: evidenceLabelSchema,
    text: z.string().min(1),
    basis: basisSchema.optional(),
  })
  .strict();
export type JournalFinding = z.infer<typeof journalFindingSchema>;

export const journalFileSchema = z
  .object({
    schema: z.literal(JOURNAL_SCHEMA),
    season: z.number().int(),
    gender: z.string().min(1),
    conference: z.string().min(1),
    generated_at: z.string().min(1),
    data_collected_at: z.string().min(1),
    kicker: z.string().optional(),
    headline: z.string().min(1),
    dek: z.string().optional(),
    /** The figures the kicker, headline and dek rest on.
     *
     *  These three are the first prose a reader meets and, until this field
     *  existed, the only prose no checker could reach — which is where two
     *  rounds of wrong numbers hid. Optional so older journals still parse;
     *  a journal without it gets a REVIEW line per unbacked numeral instead
     *  of silence. */
    lede_basis: basisSchema.optional(),
    summary_stat: z
      .object({
        label: z.string().min(1),
        value: z.string().min(1),
        detail: z.string().optional(),
        basis: basisSchema.optional(),
      })
      .strict()
      .optional(),
    pattern: z
      .object({
        label: evidenceLabelSchema,
        text: z.string().min(1),
        chart: journalChartSchema.optional(),
        basis: basisSchema.optional(),
      })
      .strict()
      .optional(),
    /** The conference's one headline-news item, written for the national
     *  page's card and for nowhere else.
     *
     *  The card used to render `headline` verbatim, which asked one string to
     *  obey two surface contracts at once: on the season page it heads a page
     *  that prints the counts and the table beneath it, and on the card it sits
     *  under the conference code, the full name, the opens-date and the played
     *  count. One sentence cannot be the right thing to say in both places, and
     *  the three that shipped restated the card's own figures back at it.
     *
     *  Optional, and it stays optional: a journal written before this field
     *  existed must parse and render exactly as it did.
     *
     *  `updated` is the day the LINE last changed, and it is computed by the
     *  CLI at write time — carried forward when the text matches the previous
     *  journal's, restamped to the collect date when it differs. The model
     *  never writes it, and when the site cannot know the answer it prints no
     *  date rather than guessing one. */
    wire: z
      .object({
        line: z.string().min(1),
        basis: basisSchema.optional(),
        updated: z.string().optional(),
        /** What displaced the line, in the writer's own words — written only
         *  when the line changed, and never rendered. A standing line is
         *  displaced by something more newsworthy or by no longer being true,
         *  and the judgement of which is the writer's; this is the writer
         *  saying which, for the person reading the diff tomorrow. The CLI
         *  drops it when the line did not change, so it cannot outlive the
         *  displacement it describes. */
        displaced_by: z.string().optional(),
      })
      .strict()
      .optional(),
    findings: z.array(journalFindingSchema).default([]),
    players_to_watch: z
      .array(
        z
          .object({
            player: z.string().min(1),
            programme: z.string().min(1),
            position: z.string().optional(),
            class: z.string().optional(),
            line: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    featured: z
      .object({
        last_match: z
          .object({ fixture_ref: z.string(), line: z.string().optional() })
          .strict()
          .optional(),
        next_match: z
          .object({ fixture_ref: z.string(), line: z.string().optional() })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    table_state: z
      .object({
        mode: z.string().optional(),
        statement: z.string().optional(),
        footnote: z.string().optional(),
        basis: basisSchema.optional(),
      })
      .strict()
      .optional(),
    validation: z
      .object({ policy: z.string().optional(), validated_at: z.string().nullable().optional() })
      .strict()
      .optional(),
  })
  .strict();
export type JournalFile = z.infer<typeof journalFileSchema>;

// ── The division's journal ───────────────────────────────────────────────────
// A separate file with a separate schema, because it answers to a separate
// surface. The conference journal writes a page that prints counts and a table
// beneath it; this one writes a masthead that stands over a ledger, three
// cards and a strip, and it is the only writing on the site composed across
// the conference files at once.
//
// Everything about it is optional to the site. No national journal means the
// masthead renders its floor, which is what it renders today.

export const NATIONAL_SCHEMA = "touchline.national/1";

export const nationalJournalSchema = z
  .object({
    schema: z.literal(NATIONAL_SCHEMA),
    season: z.number().int(),
    gender: z.string().min(1),
    generated_at: z.string().min(1),
    /** The freshest collect the brief was composed from. */
    data_collected_at: z.string().min(1),
    headline: z.string().min(1),
    dek: z.string().optional(),
    /** Every figure the headline and dek contain. The masthead is the first
     *  prose on the site a reader meets and the only prose with no page above
     *  it to check against, so this is not optional in spirit even where the
     *  schema allows a journal without one to parse. */
    basis: basisSchema.optional(),
    /** The match the story is about, when it is about one. Checked to resolve;
     *  the story is not obliged to have one. */
    fixture_ref: z.string().optional(),
    /** The day the HEADLINE last changed. Computed by the CLI from the
     *  previous journal, never written by the writer — the same rule the
     *  conference wire's date follows, and the same module computes it. */
    updated: z.string().optional(),
    /** What displaced the headline, in the writer's own words — written only
     *  when it changed, and never rendered. Dropped by the CLI on a day the
     *  headline stood, so it cannot outlive the displacement it describes. */
    displaced_by: z.string().optional(),
    validation: z
      .object({ policy: z.string().optional(), validated_at: z.string().nullable().optional() })
      .strict()
      .optional(),
  })
  .strict();
export type NationalJournalFile = z.infer<typeof nationalJournalSchema>;

/** The division journal's file name — the same grammar as a conference's, with
 *  the scope in place of the conference key. */
export const nationalJournalFile = (season: number, gender: string): string =>
  `journal-${season}-${gender}-national.json`;

const nationalCache = new Map<string, NationalJournalFile | null>();

/** The division's journal, if one has been written. Never a build dependency:
 *  absent, stale or malformed, the masthead renders its floor. */
export function loadNationalJournal(season: number, gender: string): NationalJournalFile | null {
  const file = nationalJournalFile(season, gender);
  const hit = nationalCache.get(file);
  if (hit !== undefined) return hit;
  const override = process.env.TOUCHLINE_JOURNAL_DIR?.trim();
  const paths = [
    ...(override ? [join(override, file)] : []),
    join(dataRoot(), "data", "journal", file),
    join(process.cwd(), "journal", file),
  ];
  let found: NationalJournalFile | null = null;
  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      found = nationalJournalSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    } catch (err) {
      console.warn(`[touchline] national journal ignored (${path}): ${(err as Error).message}`);
      found = null;
    }
    break;
  }
  nationalCache.set(file, found);
  return found;
}

/** Where a journal may live, in the order we look: an explicit override, the
 *  data home beside the files it describes, then this repo's own directory. */
function journalPaths(key: string): string[] {
  const file = `journal-${key}.json`;
  const override = process.env.TOUCHLINE_JOURNAL_DIR?.trim();
  return [
    ...(override ? [join(override, file)] : []),
    join(dataRoot(), "data", "journal", file),
    join(process.cwd(), "journal", file),
  ];
}

const cache = new Map<string, JournalFile | null>();

export function loadJournal(s: Season): JournalFile | null {
  const key = seasonKey(s.fixtures.season, s.fixtures.gender, s.key);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let found: JournalFile | null = null;
  for (const path of journalPaths(key)) {
    if (!existsSync(path)) continue;
    try {
      found = journalFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    } catch (err) {
      // A malformed journal is a writing problem, not a site outage.
      console.warn(`[touchline] journal ignored (${path}): ${(err as Error).message}`);
      found = null;
    }
    break;
  }
  if (!found) console.warn(`[touchline] no journal for ${key} — rendering from data alone.`);
  cache.set(key, found);
  return found;
}

/** True when the journal describes an older collect than the one on disk. The
 *  page still renders; it just says so. */
export function isStale(journal: JournalFile | null, s: Season): boolean {
  if (!journal) return false;
  // The two files spell the same instant differently ("…Z" and "…+00:00"),
  // so compare moments, not strings — a false staleness notice is a lie.
  const wrote = Date.parse(journal.data_collected_at);
  const have = Date.parse(s.collectedAt);
  if (Number.isNaN(wrote) || Number.isNaN(have)) return journal.data_collected_at !== s.collectedAt;
  return wrote !== have;
}

// ── The data-only fallback ───────────────────────────────────────────────────
// Neutral, literally true of the collected data, and written in the same voice.

export interface Editorial {
  kicker: string;
  headline: string;
  dek: string | null;
  fromJournal: boolean;
}

export function editorial(s: Season, journal: JournalFile | null): Editorial {
  if (journal) {
    return {
      kicker: journal.kicker ?? defaultKicker(s),
      headline: journal.headline,
      dek: journal.dek ?? null,
      fromJournal: true,
    };
  }
  // The two layers must stay legible to a reader: an editorial headline is the
  // journal's voice, so the data-only one stays plainly declarative — a count,
  // a date, a state. No metaphor, ever, from this branch.
  const played = playedCount(s);
  const total = fixtureCount(s);
  const opens = conferenceOpensOn(s);
  const silent = unresolved(s);
  const opensLine =
    opens && !tableIsLive(s)
      ? `The table stays empty until ${monShort(opens)} ${dayOfMonth(opens)}.`
      : null;
  const silentLine =
    silent.total > 0
      ? `${sentenceCase(spell(silent.total))} ${silent.total === 1 ? "match sits" : "matches sit"} unresolved — the sources' silence, named rather than dropped.`
      : null;
  return {
    kicker: defaultKicker(s),
    headline: `${played} of ${total} matches played.`,
    dek: [opensLine, silentLine].filter(Boolean).join(" ") || null,
    fromJournal: false,
  };
}

export function defaultKicker(s: Season): string {
  return `${s.fixtures.conference} · ${monShort(s.asOf)} ${dayOfMonth(s.asOf)}`.toUpperCase();
}

/** The table's own statement, when no journal wrote one. */
export function tableStatement(s: Season): { statement: string; footnote: string | null } {
  const opens = conferenceOpensOn(s);
  const sides = s.fixtures.programmes.length;
  if (!tableIsLive(s)) {
    return {
      statement: opens
        ? `Conference play begins ${monShort(opens)} ${dayOfMonth(opens)}. All ${sides} sides are 0–0–0.`
        : `No conference match has been played. All ${sides} sides are 0–0–0.`,
      footnote:
        "3–1–0 points · early form shown from non-conference results · a pre-conference table is a valid state.",
    };
  }
  const rec = outsideRecord(s);
  return {
    statement: `${sides} sides · ${rec.played} results against everyone else.`,
    footnote: "3–1–0 points · conference matches only.",
  };
}

const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// ── The pattern, and the findings, when no journal wrote them ────────────────
// Neither invents a story. Both say only what the collected files already say,
// in the same grammar a written journal would have had to use.

/** The vocabulary a data-only page may speak. SIGNAL is deliberately absent:
 *  a signal is a pattern whose cause is unverified — an interpretation — and
 *  only the journal step is allowed to interpret. Composing published numbers
 *  is observed, derived or projected, and nothing else. */
export type DataOnlyLabel = Exclude<EvidenceLabel, "signal">;

export type DataFinding = Omit<JournalFinding, "label"> & { label: DataOnlyLabel };

export interface PatternBlock {
  label: DataOnlyLabel;
  text: string;
  chart?: JournalChart;
}

export function fallbackPattern(s: Season): PatternBlock | null {
  const goals = goalsForByProgramme(s);
  const scored = scoredCount(s);
  if (scored === 0 || goals.length === 0) return null;
  const top = goals[0] as { slug: string; goals: number };
  const leaders = goals.filter((g) => g.goals === top.goals);
  const through = lastResult(s);
  const name = (slug: string) => s.names.name(slug);
  const text =
    top.goals === 0
      ? "No side in the conference has scored yet."
      : leaders.length === 1
        ? `${name(top.slug)} has scored ${spell(top.goals)} in non-conference play, more than any other side in the conference.`
        : `${sentenceCase(spell(leaders.length))} sides share the conference lead on goals scored, with ${spell(top.goals)} each.`;
  return {
    label: "derived",
    text,
    chart: {
      kind: "goals-for-by-team",
      caption: `Goals scored per side, all non-conference${through ? `, through ${shortDate(through.date)}` : ""}.`,
      values: Object.fromEntries(goals.map((g) => [g.slug, g.goals])),
      highlight: leaders.length === 1 ? top.slug : undefined,
    },
  };
}

export function fallbackFindings(s: Season): DataFinding[] {
  const out: DataFinding[] = [];
  const silent = unresolved(s);
  if (silent.total > 0) {
    const finals = silent.finalsWithoutScore.length;
    const past = silent.pastDateNoResult.length;
    const parts = [
      finals > 0 ? `${spell(finals)} marked final with no score` : null,
      past > 0 ? `${spell(past)} past their date with no result at all` : null,
    ].filter(Boolean);
    out.push({
      label: "observed",
      text: `${sentenceCase(spell(silent.total))} ${silent.total === 1 ? "match sits" : "matches sit"} unresolved — ${parts.join(", ")}. The sources' silence, named rather than dropped.`,
      basis: { source: "fixtures", finals_without_score: finals, past_date_no_result: past },
    });
  }
  const gaps = boxScoreGaps(s);
  if (gaps.length > 0) {
    out.push({
      label: "observed",
      text: `${sentenceCase(spell(gaps.length))} played ${gaps.length === 1 ? "match carries" : "matches carry"} no box score the collector could reach. The result stands; the detail behind it does not exist here yet.`,
      basis: { source: "matches", missing: gaps.length },
    });
  }
  const opens = conferenceOpensOn(s);
  if (opens && opens > s.asOf) {
    const days = daysBetween(s.asOf, opens);
    out.push({
      label: "projected",
      text: `${sentenceCase(spell(days))} ${days === 1 ? "day" : "days"} of non-conference matches before the table means anything.`,
      basis: { conference_opens: opens },
    });
  }
  return out;
}
