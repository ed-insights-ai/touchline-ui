/**
 * Turning a claim's `basis` into something a reader can read.
 *
 * The basis exists so the validator can recompute a claim. Showing it is the
 * same promise kept to a person: these are the figures the sentence rests on,
 * and if one of them is wrong the sentence is wrong. Nothing here interprets —
 * it renames keys and formats numbers, and anything it does not understand is
 * printed as published rather than dropped.
 */

/** Keys that say where a figure came from rather than what it is. */
const SOURCE_KEYS = new Set(["source", "derived_from"]);

/** Where the house word differs from the contract's key. */
const NAMES: Record<string, string> = {
  gf: "Goals for",
  ga: "Goals against",
  goals_against: "Goals against",
  save_pct: "Save percentage",
  distinct_scorers_min: "Distinct scorers, at least",
  finals_without_score: "Silent finals",
  past_date_no_result: "Past dates with no result",
  box_score_gaps: "Box-score gaps",
  conference_opens: "Conference opens",
  matches_played: "Matches played",
  matches_total: "Matches on the calendar",
  silent_finals: "Silent finals",
  team_goals: "Team goals",
  player_goals: "Player goals",
  sog: "Shots on target",
  gp: "Appearances",
  gs: "Starts",
};

const humanise = (key: string): string =>
  NAMES[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** A rate prints the way a box score prints it; a count prints as a count. */
function show(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    // A proportion under one is a rate: .909, not 0.909.
    return value > 0 && value < 1 ? value.toFixed(3).replace(/^0/, "") : String(value);
  }
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(show).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

export interface BasisRow {
  key: string;
  value: string;
}

export interface Basis {
  /** "stats", "fixtures", "stats+fixtures" — the layer the figures came from. */
  source: string | null;
  rows: BasisRow[];
}

/** Keys whose value is a programme slug, which the page never shows raw. */
const SLUG_KEYS = new Set(["programme", "programmes", "slug", "highlight", "team"]);

export function readBasis(
  basis: Record<string, unknown> | undefined,
  /** Turns a programme slug into the name the rest of the page prints. */
  resolveName: (slug: string) => string = (slug) => slug,
): Basis | null {
  if (!basis) return null;
  let source: string | null = null;
  const rows: BasisRow[] = [];
  for (const [key, raw] of Object.entries(basis)) {
    const value = show(raw);
    if (value === null) continue;
    if (SOURCE_KEYS.has(key)) {
      source = value;
      continue;
    }
    rows.push({
      key: humanise(key),
      value: SLUG_KEYS.has(key)
        ? value
            .split(", ")
            .map((v) => resolveName(v))
            .join(", ")
        : value,
    });
  }
  return rows.length === 0 && source === null ? null : { source, rows };
}

/** "the collected fixtures" — the layer named the way the page talks. */
export function sourceLine(source: string | null): string | null {
  if (!source) return null;
  const named = source
    .split("+")
    .map((s) => s.trim())
    .map((s) =>
      s === "fixtures"
        ? "the published schedules"
        : s === "stats"
          ? "the published season statistics"
          : s === "matches"
            ? "the collected box scores"
            : s === "rosters"
              ? "the published rosters"
              : s,
    );
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `Recomputed from ${list}.`;
}
