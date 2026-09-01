/**
 * Properties of the prose this site composes for itself.
 *
 * The figures on these pages are recomputed and checked everywhere — the unit
 * tests recompute them, the journal validator drops a claim whose numbers it
 * cannot confirm. None of that reads the SENTENCE. A claim can carry a
 * verified figure and still print it in the wrong shape, name a programme by a
 * name the rest of the page does not use, or say a second time what the line
 * above it already said.
 *
 * So these are properties over the composed strings, never counts or
 * snapshots: the data is re-collected daily and a pinned sentence would fail
 * on the collect rather than on the code. Each one is a rule about form, and
 * each is here because the form it forbids is one the copy could reach.
 *
 * The corpus is what a reader actually meets — the conference page's headline,
 * dek, chart caption and findings selected exactly as the page selects them
 * (the journal's if it wrote them, the computed fallback if not); every
 * match's footnote, provenance and share description; every player card's
 * composed lines.
 *
 * One thing is deliberately NOT in it: the published play-by-play. Those are
 * the programme's own sentences, quoted, and the site's whole discipline is to
 * keep them exactly as published — a clock reading 13:30 there is a match
 * minute the source printed, not this site's prose.
 */

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { hasScore, loadSeason, matchDetailOf, type Season, squadOf } from "./derive.ts";
import { longDate } from "./format.ts";
import { editorial, fallbackFindings, fallbackPattern, loadJournal } from "./journal.ts";
import { footNote, metaDescription, provenance } from "./matchstate.ts";
import { playerCard } from "./player.ts";

interface Line {
  /** Where a reader meets it, for a failure that says where to look. */
  where: string;
  text: string;
}

const seasons = site.conferences.map((k) => loadSeason(k));

/** What the conference page composes, chosen the way the page chooses it. */
function conferencePage(s: Season): Line[] {
  const journal = loadJournal(s);
  const lede = editorial(s, journal);
  const pattern = journal?.pattern ?? fallbackPattern(s);
  const findings = journal?.findings ?? fallbackFindings(s);
  const out: Line[] = [{ where: `${s.key} headline`, text: lede.headline }];
  if (lede.dek) out.push({ where: `${s.key} dek`, text: lede.dek });
  if (pattern?.text) out.push({ where: `${s.key} pattern`, text: pattern.text });
  if (pattern?.chart?.caption) {
    out.push({ where: `${s.key} chart caption`, text: pattern.chart.caption });
  }
  findings.forEach((f, i) => {
    out.push({ where: `${s.key} finding ${i}`, text: f.text });
  });
  // The featured cards' lines. They carry no basis, so the journal validator
  // never reads them — it checks only that their fixture_ref resolves — which
  // made them the one piece of composed prose on this page with nothing at all
  // looking at it. A hyphenated scoreline and two twenty-four hour kickoffs
  // were sitting in them when this corpus was first written, invisible to the
  // properties because the properties could not see this far.
  for (const slot of ["last_match", "next_match"] as const) {
    const line = journal?.featured?.[slot]?.line;
    if (line) out.push({ where: `${s.key} featured ${slot}`, text: line });
  }
  return out;
}

/** Every match's composed copy, in all six states. */
function matchPages(s: Season): Line[] {
  const out: Line[] = [];
  const conference = site.conferenceNames[s.key] ?? s.fixtures.conference;
  for (const f of s.fixtures.fixtures) {
    const detail = matchDetailOf(s, f.id);
    const scored = hasScore(f);
    const state = detail ? "played" : scored ? "score-only" : "preview";
    const at = `${s.key} match ${f.id}`;
    out.push({
      where: `${at} description`,
      text: metaDescription(state, {
        home: s.names.name(f.home),
        away: s.names.name(f.away),
        score: scored ? `${f.home_score}–${f.away_score}` : null,
        date: `${longDate(f.date)}, ${s.fixtures.season}`,
        conference,
        hasPlays: (detail?.plays ?? []).length > 0,
        status: f.status,
      }),
    });
    out.push({
      where: `${at} provenance`,
      text: provenance(state, { hasPlays: (detail?.plays ?? []).length > 0, status: f.status }),
    });
  }
  out.push({
    where: `${s.key} footnote`,
    text: footNote("silent-final", { finalsWithoutScore: 4, pastDateNoResult: 2, gaps: 1 }),
  });
  return out;
}

/** Every player card's composed lines. */
function playerCards(s: Season): Line[] {
  const out: Line[] = [];
  for (const slug of Object.keys(s.rosters?.rosters ?? {})) {
    for (const m of squadOf(s, slug)) {
      const c = playerCard(s, slug, m.player, m.stats, m.keeper);
      const at = `${s.key} ${slug} ${c.name}`;
      for (const [what, text] of [
        ["tenure", c.tenure],
        ["career note", c.career.note],
        ["finding", c.finding?.text],
        ["minutes", c.minutes?.note],
        ["exhibitions", c.exhibitions],
      ] as const) {
        if (text) out.push({ where: `${at} ${what}`, text });
      }
    }
  }
  return out;
}

const ALL: Line[] = seasons.flatMap((s) => [
  ...conferencePage(s),
  ...matchPages(s),
  ...playerCards(s),
]);

const show = (l: Line) => `${l.where}: ${l.text}`;

describe("the shape a figure takes in a sentence", () => {
  test("a score is never two numbers with a hyphen between them", () => {
    // The house sets a scoreline with an en-dash — 4–1, 3–1–0 — and a hyphen
    // between digits in prose is either a score in the wrong glyph or an ISO
    // date that escaped a formatter. Both read as a typo on the page.
    const raw = /\d\s?-\s?\d/;
    expect(ALL.filter((l) => raw.test(l.text)).map(show)).toEqual([]);
  });

  test("no sentence prints a twenty-four hour clock", () => {
    // Kickoffs go through clockTime, which renders "7:00 PM". A 19:00 in prose
    // is a raw field that reached the page without passing through it.
    const clock24 = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;
    expect(ALL.filter((l) => clock24.test(l.text)).map(show)).toEqual([]);
  });
});

describe("a programme has one name", () => {
  /**
   * Two spellings of one programme fold to the same key. "St. Edward's" and
   * "Saint Edwards" are the same six letters and a decision about punctuation,
   * and a model writing prose from a slug reaches for the long form — which is
   * exactly how the LSC page came to name one side two ways at once.
   *
   * Folding rather than a list of variants, because the list is always one
   * short: this catches the apostrophe, the full stop, the ampersand written
   * out, and St against Saint, without anyone having to think of them.
   */
  const fold = (s: string): string =>
    s
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[.'’,]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (w === "st" ? "saint" : w))
      .join(" ");

  test("no composed sentence names a programme a way the site does not", () => {
    const offenders: string[] = [];
    for (const s of seasons) {
      // Every form the site itself uses: the name it prints, and the
      // abbreviation the programme published, which is a legitimate short
      // form and not a misspelling.
      const allowed = new Set<string>();
      const wanted = new Map<string, string>();
      for (const p of s.fixtures.programmes) {
        const name = s.names.name(p.slug);
        allowed.add(name);
        const abbr = s.names.abbr(p.slug);
        if (abbr) allowed.add(abbr);
        wanted.set(fold(name), name);
      }
      for (const l of [...conferencePage(s), ...matchPages(s), ...playerCards(s)]) {
        const words = l.text.split(/\s+/);
        for (let i = 0; i < words.length; i++) {
          for (let n = 1; n <= 6 && i + n <= words.length; n++) {
            // Trim the punctuation a phrase picks up from the sentence
            // around it. An apostrophe survives, because it is inside the
            // name — St. Edward's ends in one.
            const phrase = words
              .slice(i, i + n)
              .join(" ")
              .replace(/^[^\w]+|[^\w'’]+$/g, "");
            if (phrase.length < 4 || allowed.has(phrase)) continue;
            const canonical = wanted.get(fold(phrase));
            if (canonical && canonical !== phrase) {
              offenders.push(`${show(l)}\n      → "${phrase}" should be "${canonical}"`);
            }
          }
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe("a sentence earns its place", () => {
  const STOP = new Set(
    (
      "the and a an of in on at to for with that this is are has have had been by from its their it" +
      " as no not all more than any other still out before after every one two those"
    ).split(" "),
  );
  const content = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((w) => (/^\d+$/.test(w) ? "#" : w))
      .filter((w) => w.length > 2 && !STOP.has(w));

  /** Sentences, normalised for comparison but not for reading. */
  const sentences = (s: string): string[] =>
    s
      .split(/(?<=[.!?])\s+/)
      .map((x) =>
        x
          .trim()
          .replace(/\s+/g, " ")
          .replace(/[.!?]+$/, "")
          .toLowerCase(),
      )
      .filter((x) => x.length > 24);

  test("no page prints the same sentence twice in two places", () => {
    const clashes: string[] = [];
    for (const s of seasons) {
      const lines = conferencePage(s);
      const seen = new Map<string, string>();
      for (const l of lines) {
        for (const sentence of sentences(l.text)) {
          const first = seen.get(sentence);
          if (first && first !== l.where) {
            clashes.push(`${s.key}: "${sentence}"\n      in ${first} and again in ${l.where}`);
          } else if (!first) {
            seen.set(sentence, l.where);
          }
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  test("no line on a page is another line with the words moved", () => {
    // Measured on this collect: the highest honest overlap between two
    // co-rendered lines is 0.77 — a finding that names which programme and
    // which dates the dek counted, which is elaboration and not repetition.
    // A line sharing nine content words in ten with another is saying it
    // again.
    const clashes: string[] = [];
    for (const s of seasons) {
      const lines = conferencePage(s);
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
          const a = new Set(content((lines[i] as Line).text));
          const b = new Set(content((lines[j] as Line).text));
          if (a.size === 0 || b.size === 0) continue;
          const shared = [...a].filter((w) => b.has(w)).length;
          const ratio = shared / Math.min(a.size, b.size);
          if (ratio >= 0.9) {
            clashes.push(
              `${(lines[i] as Line).where} × ${(lines[j] as Line).where} — ${ratio.toFixed(2)}`,
            );
          }
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});
