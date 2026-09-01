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
 * The corpus is what a reader actually meets — the national masthead's own
 * altitudes; the conference page's headline, dek, chart caption and findings
 * selected exactly as the page selects them (the journal's if it wrote them,
 * the computed fallback if not); every match's footnote, provenance and share
 * description; every player card's composed lines.
 *
 * One thing is deliberately NOT in it: the published play-by-play. Those are
 * the programme's own sentences, quoted, and the site's whole discipline is to
 * keep them exactly as published — a clock reading 13:30 there is a match
 * minute the source printed, not this site's prose.
 */

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { hasScore, loadSeason, matchDetailOf, type Season, squadOf } from "./derive.ts";
import { divisionCounts } from "./division.ts";
import { longDate, shortDate, spell } from "./format.ts";
import {
  homeColumns,
  homeSeasons,
  nationalAsOf,
  nationalDescription,
  nationalLede,
} from "./home.ts";
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

/** The national masthead's prose, and the paragraph its description publishes.
 *  The kicker and the strip are small-caps figures rather than sentences, and
 *  every property here is a rule about a sentence. */
const nationalSeasons = homeSeasons();
const nationalColumns = homeColumns(nationalSeasons);
const nationalFigures = divisionCounts(nationalSeasons);
const nationalMasthead = nationalLede(
  nationalColumns,
  nationalAsOf(nationalSeasons),
  nationalFigures,
);

function nationalPage(): Line[] {
  const out: Line[] = [];
  if (nationalMasthead.headline) {
    out.push({ where: "national headline", text: nationalMasthead.headline });
  }
  if (nationalMasthead.dek) out.push({ where: "national dek", text: nationalMasthead.dek });
  out.push({
    where: "national description",
    text: nationalDescription(nationalColumns, nationalFigures),
  });
  // The conference cards' lines, as the card renders them. Only the wire is
  // added here: when a journal has not written one the card falls back to the
  // season headline, which conferencePage() already puts in the corpus.
  for (const c of nationalColumns) {
    const wire = loadJournal(c.season)?.wire?.line;
    if (wire) out.push({ where: `${c.key} wire`, text: wire });
  }
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

const ALL: Line[] = [
  ...nationalPage(),
  ...seasons.flatMap((s) => [...conferencePage(s), ...matchPages(s), ...playerCards(s)]),
];

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

describe("a line fits the altitude it is set at", () => {
  /**
   * The masthead is four altitudes now, and a length is what keeps a sentence
   * at the one it was written for. The headline sets at 38px across a 900px
   * measure: about a hundred characters is one balanced line and a bit, and
   * past that the sentence has outgrown the altitude rather than the type
   * being too large for it.
   */
  const HEADLINE_MAX = 100;
  /** Measured on this collect: the openers sentence runs to 154 characters
   *  with three conferences named. The cap leaves room for a fourth and
   *  refuses a paragraph. */
  const DEK_MAX = 280;

  test("the national headline sets in one balanced line", () => {
    // Null today — the floor writes no headline rather than manufacture one —
    // so this is the cap standing ready for the layer that will.
    const length = nationalMasthead.headline?.length ?? 0;
    expect(length).toBeLessThanOrEqual(HEADLINE_MAX);
  });

  test("the national dek stays at dek altitude", () => {
    expect(nationalMasthead.dek?.length ?? 0).toBeLessThanOrEqual(DEK_MAX);
  });

  test("nothing in the masthead prints a scoreline — the ledger prints every one", () => {
    // The surface directly below the masthead is a ledger of last night's
    // results. A score up here is the one restatement this page cannot make.
    const score = /\d\s?[–-]\s?\d/;
    expect(
      nationalPage()
        .filter((l) => score.test(l.text))
        .map(show),
    ).toEqual([]);
  });
});

describe("the wire says what the card cannot", () => {
  /**
   * The wire is the conference's one headline-news item, and it sits on the
   * national page's card under the conference code, the full name, the
   * opens-date and the played count — every one of them set in larger type
   * than the line itself. So the rules here are not about taste: each one
   * names a figure the reader can already see two lines up, and each is here
   * because the line it forbids is one that actually shipped. All three
   * headlines the cards used to render restated the card's own played count.
   *
   * The predicate is separate from the data so it has teeth today: no journal
   * has written a wire yet, and a property that runs over an empty set is a
   * comment. It is run over the live wires AND over lines written to break it.
   */
  const WIRE_MAX = 140;

  interface Card {
    played: number;
    total: number;
    opensOn: string | null;
  }

  function offences(line: string, card: Card): string[] {
    const out: string[] = [];
    if (line.length > WIRE_MAX) out.push(`${line.length} characters, cap ${WIRE_MAX}`);
    // The ledger on the same page prints last night's scores, and the house
    // sets a scoreline with an en-dash in any case.
    if (/\d\s?[–-]\s?\d/.test(line)) out.push("prints a scoreline");
    // No card carries a kickoff. A time here came from a field, not a thought.
    if (/\b\d{1,2}:\d{2}\b/.test(line)) out.push("prints a clock time");
    const fraction = new RegExp(`\\b${card.played}\\s+of\\s+${card.total}\\b`);
    // Digits or the house's spelled form, standing directly on the word the
    // card uses. The window is short on purpose: "seventeen matches" is the
    // card's own figure, and "seventeen days of non-conference matches" is a
    // different fact that happens to end in the same word. A rule that cannot
    // tell them apart stops a cadence publish over a sentence that was fine.
    const counted = new RegExp(
      `\\b(?:${card.played}|${spell(card.played)})\\b[^.]{0,12}?\\bmatch(?:es)?\\b`,
      "i",
    );
    if (fraction.test(line) || counted.test(line)) out.push("restates the played count");
    if (card.opensOn) {
      const opens = shortDate(card.opensOn);
      if (new RegExp(`\\b${opens}\\b`, "i").test(line)) {
        out.push(`restates the opens-date (${opens})`);
      }
    }
    return out;
  }

  test("no wire on the page restates its own card", () => {
    const found: string[] = [];
    for (const c of nationalColumns) {
      const wire = loadJournal(c.season)?.wire?.line;
      if (!wire) continue;
      for (const o of offences(wire, {
        played: c.counts.played,
        total: c.counts.total,
        opensOn: c.opensOn,
      })) {
        found.push(`${c.key} wire — ${o}: ${wire}`);
      }
    }
    expect(found).toEqual([]);
  });

  test("and the rules refuse the lines that shipped", () => {
    // The teeth, against the GSC's own card the day this was written:
    // seventeen of a hundred and nineteen played, opening on Sep 11.
    const card: Card = { played: 17, total: 119, opensOn: "2026-09-11" };
    const caught = (line: string): string => offences(line, card).join("; ");

    expect(caught("The GSC has seventeen matches behind it and a table of zeros.")).toContain(
      "restates the played count",
    );
    expect(caught("17 of 119 matches played and nothing decided yet.")).toContain(
      "restates the played count",
    );
    expect(
      caught("Conference play opens Sep 11, and the table means nothing before it."),
    ).toContain("restates the opens-date");
    expect(caught("West Alabama went down 2-0 at home on Saturday.")).toContain(
      "prints a scoreline",
    );
    expect(caught("The opener kicks off at 7:00 PM in Kingsville.")).toContain(
      "prints a clock time",
    );
    expect(caught(`Ouachita Baptist ${"have yet to concede a goal ".repeat(6)}.`)).toContain(
      "characters, cap 140",
    );

    // And a line that says something the card cannot passes all of them.
    expect(offences("Ouachita Baptist have yet to concede a goal.", card)).toEqual([]);
    // The near miss the short window exists for: the same spelled number as
    // the played count, counting something else entirely.
    expect(offences("Seventeen days of non-conference matches remain.", card)).toEqual([]);
  });
});
