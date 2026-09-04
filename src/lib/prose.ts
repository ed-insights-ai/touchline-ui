/**
 * One rule about two sentences: is the second the first with its words moved?
 *
 * The site's copy properties (copy.test.ts) ask it of every pair of written
 * lines a page renders, and the journal validator (scripts/journal/validate.ts)
 * asks it of the lines a journal wrote before the page ever sees them. It is
 * one implementation on purpose. The morning the CACC journal's dek restated
 * its own featured line, the site test blocked the publish while the
 * validator — the step the cadence actually runs — had never looked, and a
 * copy of this rule in each place would drift until the two disagreed about
 * the same sentence.
 */

export interface Line {
  /** Where a reader meets it, for a failure that says where to look. */
  where: string;
  text: string;
  /** Composed by the page from a fixed string, not written for the page. A
   *  mechanical line is short by design and shares its few content words
   *  with any sentence about the same figure, so the pairwise overlap test
   *  skips it; the sentence-twice test still covers it verbatim. */
  mechanical?: true;
}

/** Two lines sharing this share of their content words are one line twice.
 *  Measured on the collect this was set on: the highest honest overlap
 *  between two co-rendered lines was 0.77 — a finding that names which
 *  programme and which dates the dek counted, which is elaboration and not
 *  repetition. Nine content words in ten is saying it again. */
export const WORDS_MOVED_RATIO = 0.9;

const STOP = new Set(
  (
    "the and a an of in on at to for with that this is are has have had been by from its their it" +
    " as no not all more than any other still out before after every one two those"
  ).split(" "),
);

/** The words a sentence is about: lower-cased, punctuation off, stop words
 *  out, every digit-string folded to "#" — which the length filter then
 *  drops, so a figure is never a content word and two lines about different
 *  figures in the same shape still read as the same shape. (A spelled
 *  number, "seven", survives as a word; the CACC dek and featured line
 *  measured 0.90 with that in force.) */
export const contentWords = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => (/^\d+$/.test(w) ? "#" : w))
    .filter((w) => w.length > 2 && !STOP.has(w));

export interface Restatement {
  /** The earlier line of the pair, in the order given. */
  first: Line;
  /** The later one — the one a caller dropping a line drops. */
  second: Line;
  ratio: number;
}

/** Every pair of written lines whose content words are the same set moved
 *  about. ratio = shared / min(|a|, |b|), so a short line is the
 *  denominator: the chart caption's five content words all appear in any
 *  dek about goals and matches (measured 1.00 on the GLVC add), which is
 *  the caption being short, not the dek repeating it. Mechanical lines are
 *  therefore left out here and covered verbatim by the sentence-twice test.
 *  Pairs come back in the order given, earlier line first. */
export function restatements(lines: readonly Line[]): Restatement[] {
  const found: Restatement[] = [];
  const words = lines.map((l) => new Set(contentWords(l.text)));
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const x = lines[i] as Line;
      const y = lines[j] as Line;
      if (x.mechanical || y.mechanical) continue;
      const a = words[i] as Set<string>;
      const b = words[j] as Set<string>;
      if (a.size === 0 || b.size === 0) continue;
      const shared = [...a].filter((w) => b.has(w)).length;
      const ratio = shared / Math.min(a.size, b.size);
      if (ratio >= WORDS_MOVED_RATIO) found.push({ first: x, second: y, ratio });
    }
  }
  return found;
}

/** The same pairs, one line each, for a test failure that names them. */
export const wordsMoved = (lines: readonly Line[]): string[] =>
  restatements(lines).map((r) => `${r.first.where} × ${r.second.where} — ${r.ratio.toFixed(2)}`);
