/**
 * The play-by-play ledger.
 *
 * Sidearm publishes each play as a sentence written for a scorer's table, not
 * for a reader: "Shot by FHSU Linares, Juan, out top left." This module turns
 * those sentences into ledger rows deterministically — no model, no inference,
 * no invented times. Every transformation is a parse of the published string,
 * and the published string travels with the row so a reader can see it.
 *
 * Three rules the data insists on:
 *
 *   1. A goal is a play carrying a `score` array — never a play whose `type`
 *      is "goal" or "penalty". Two of the four penalty plays in the 2026 data
 *      are MISSES; typing them as goals would put goals on the page that were
 *      never scored.
 *   2. Document order is the record. A play with no clock keeps its place and
 *      says its clock is missing. Nothing here sorts by time.
 *   3. Names are cut at the sentence's own connectives — "Assist by", " for ",
 *      ", saved by" — never at the first comma. A name carries a comma of its
 *      own ("Linares, Juan"), so cutting there turns "Doe, Lawrence Assist by
 *      Hernandez, Victor" into a scorer called "Lawrence Assist by Hernandez".
 */

import type { MatchDetail, MatchPlay, MatchTeam } from "./model.ts";

/** Which filter chip a row answers to. Dividers answer to all of them. */
export type PlayFilter = "goals" | "shots" | "set" | "subs";

export interface DividerRow {
  kind: "divider";
  label: string;
  /** "FHSU 2 – 0 RU", home side first, or null when no side is known home. */
  score: string | null;
}

export interface PlayRow {
  kind: "play";
  /** As published. Null means the source printed none. */
  clock: string | null;
  abbr: string | null;
  /** The away side reads dimmed here, as it does everywhere on the page. */
  dim: boolean;
  /** "GOAL" or "GOAL · PENALTY" — set only for score-bearing plays. */
  goalLabel: string | null;
  scorer: string | null;
  /** "(Francisco Degiorgi)" — already parenthesised, or null. */
  assists: string | null;
  card: "yellow" | "red" | null;
  /** Normalized display text for every row that is not a goal. */
  text: string;
  /** The published sentence, kept verbatim for the title attribute. */
  raw: string;
  /** Running score after this play, home side first. */
  running: string | null;
  /** Shots read brighter than the routine run of play. */
  loud: boolean;
  filters: PlayFilter[];
}

export type LedgerRow = DividerRow | PlayRow;

const EM = "—";
const EN = "–";
const MID = "·";

// ── Names ───────────────────────────────────────────────────────────────────
// The box score is the name authority: it prints "Philip Bölk" where the
// play-by-play prints "Bolk, Philip", and "O'Keefe" where the play-by-play
// prints "OKeefe". Matching on a diacritic- and punctuation-free token set
// lets the ledger use the published spelling the rest of the page uses. A name
// the teamsheet does not carry is flipped on its comma and left otherwise
// alone — including "unknown player", which is what the source actually said.

const tokenKey = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.,-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

export type NameIndex = Map<string, string>;

export function playerIndex(detail: MatchDetail): NameIndex {
  const index: NameIndex = new Map();
  for (const team of detail.teams) {
    for (const line of [...(team.players ?? []), ...(team.keepers ?? [])]) {
      const key = tokenKey(line.name);
      if (key) index.set(key, line.name);
    }
  }
  return index;
}

const trimStop = (s: string): string => s.trim().replace(/[.,]$/, "").trim();

/** "Smith, John." → "John Smith". The fallback when no teamsheet name matches. */
function flipComma(s: string): string {
  const bare = trimStop(s);
  const at = bare.indexOf(",");
  if (at < 0) return bare;
  const last = bare.slice(0, at).trim();
  const first = bare.slice(at + 1).trim();
  return first && last ? `${first} ${last}` : bare;
}

/** A whole clause resolved to a name: teamsheet spelling first, comma-flip after. */
function person(text: string, index: NameIndex): string {
  const bare = trimStop(text);
  return index.get(tokenKey(bare)) ?? flipComma(bare);
}

/**
 * The longest leading run of words that names someone on this teamsheet.
 * Only needed where a clause has no connective to cut on — a shot whose tail
 * uses phrasing this parser has not seen.
 */
function takeName(text: string, index: NameIndex): { name: string; rest: string } | null {
  const words = trimStop(text).split(/\s+/).filter(Boolean);
  for (let n = Math.min(6, words.length); n >= 1; n--) {
    const hit = index.get(tokenKey(words.slice(0, n).join(" ")));
    if (hit) return { name: hit, rest: words.slice(n).join(" ") };
  }
  return null;
}

/**
 * Drop the side's own abbreviation or name where the sentence leads with it.
 *
 * The token has to end on a word boundary: one match's teams are "Delta State"
 * and abbr "DELTA ST", and "Shot by Delta State Samuel Fitschen" begins with
 * that abbreviation without being it — stripping on the prefix alone leaves a
 * player called "ate Samuel Fitschen". And a clause that is *only* the side's
 * name ("Foul on Central Baptist (AR).") is a play attributed to the side, so
 * the name stays: stripping it would leave the row saying nothing.
 */
function stripTeam(text: string, team: MatchTeam | undefined): string {
  if (!team) return text;
  const lower = text.toLowerCase();
  for (const token of [team.abbr, team.name]) {
    if (!token || !lower.startsWith(token.toLowerCase())) continue;
    const rest = text.slice(token.length);
    if (rest !== "" && !/^\s/.test(rest)) continue;
    const kept = rest.trimStart();
    if (trimStop(kept) === "") continue;
    return kept;
  }
  return text;
}

// ── Per-type sentence grammars ──────────────────────────────────────────────

/** "Corner kick [06:15]." — the bracketed stamp only repeats the row's clock. */
const dropStamp = (s: string): string => s.replace(/\s*\[\d{1,3}:\d{2}\]/g, "");

/** Where a shot's own words end and the flight of the ball begins. */
const PLACEMENT = /,\s*(?=(?:out|bottom|top|left|right|high|wide|blocked|saved|save)\b)/i;

function shotText(body: string, index: NameIndex, header: boolean): string {
  const label = header ? "Header" : "Shot";
  const cut = body.search(PLACEMENT);
  let name: string;
  let tail: string;
  if (cut >= 0) {
    name = person(body.slice(0, cut), index);
    tail = trimStop(body.slice(cut + 1));
  } else {
    // No phrasing this parser knows — let the teamsheet say where the name ends.
    const hit = takeName(body, index);
    name = hit ? hit.name : person(body, index);
    tail = hit ? trimStop(hit.rest.replace(/^,\s*/, "")) : "";
  }
  if (!tail) return `${label} ${EM} ${name}`;
  // "bottom right, saved by Roehrich, Payton" and the "Save (by goalie) X"
  // spelling one collector uses are the same fact.
  const save = /,?\s*(?:saved by|save\s*\(by goalie\))\s+/i.exec(tail);
  if (save) {
    const placement = trimStop(tail.slice(0, save.index));
    const keeper = person(tail.slice(save.index + save[0].length), index);
    return `${label} ${EM} ${name}${placement ? `, ${placement}` : ""} ${EM} saved by ${keeper}`;
  }
  // "bottom left, Team save" — stopped by the side rather than by the keeper.
  const team = /,?\s*Team save\.?$/i.exec(tail);
  if (team) {
    const placement = trimStop(tail.slice(0, team.index));
    return `${label} ${EM} ${name}${placement ? `, ${placement}` : ""} ${EM} team save`;
  }
  return `${label} ${EM} ${name}, ${tail}`;
}

function subText(body: string, index: NameIndex): string {
  const at = body.toLowerCase().indexOf("substitution:");
  const pair = (at >= 0 ? body.slice(at + "substitution:".length) : body).trim();
  const split = /\s+for\s+/i.exec(pair);
  if (!split) return `Substitution ${EM} ${trimStop(pair)}`;
  const on = person(pair.slice(0, split.index), index);
  const off = person(pair.slice(split.index + split[0].length), index);
  return `Substitution ${EM} ${on} for ${off}`;
}

/** "GOAL by FHSU Moncada, Filippo Assist by Degiorgi, Francisco." */
function goalParts(body: string, index: NameIndex): { scorer: string; assists: string | null } {
  const split = /,?\s*Assist by\s+/i.exec(body);
  const head = trimStop(split ? body.slice(0, split.index) : body);
  // "GOAL by AUM TEAM." — the source credited the side, not a player.
  const scorer = /^team$/i.test(head) ? "no player credited" : person(head, index);
  if (!split) return { scorer, assists: null };
  const credited = body
    .slice(split.index + split[0].length)
    .split(/\s+and\s+/i)
    .map((one) => person(one, index))
    .filter(Boolean);
  return { scorer, assists: credited.length ? `(${credited.join(", ")})` : null };
}

/** "FHSU Juan Linares PENALTY KICK GOAL." — first-name-first already, here. */
function penaltyParts(body: string, index: NameIndex): { name: string; keeper: string | null } {
  const at = body.toUpperCase().indexOf("PENALTY KICK");
  const head = at > 0 ? body.slice(0, at) : body;
  const tail = at >= 0 ? body.slice(at + "PENALTY KICK".length) : "";
  const save = /saved by\s+/i.exec(tail);
  return {
    name: person(head, index),
    keeper: save ? person(tail.slice(save.index + save[0].length), index) : null,
  };
}

/** "FOR RU: , #34 Neri, Samuele, #3 Laws, Rhys, …" — an eleven, not a sentence. */
function lineupText(text: string, period: string): string {
  const named = (text.match(/#/g) ?? []).length;
  const who =
    period === "1"
      ? "Starting lineup"
      : period === "2"
        ? "Second-half lineup"
        : `Period ${period} lineup`;
  return named > 0 ? `${who} ${EM} ${named} named` : who;
}

/**
 * The scorer a score-bearing play credits, in the teamsheet's spelling — the
 * same parse the ledger makes, exported so the timeline's goal label and the
 * play-by-play can never disagree about who scored.
 */
export function goalScorer(play: MatchPlay, team: MatchTeam | undefined, index: NameIndex): string {
  const body = stripTeam(dropStamp(play.text).trim(), team);
  if (play.type === "penalty") return penaltyParts(body, index).name;
  return goalParts(stripTeam(body.replace(/^goal by\s+/i, ""), team), index).scorer;
}

// ── Rows ────────────────────────────────────────────────────────────────────

const FILTERS: Record<string, PlayFilter[]> = {
  shot: ["shots"],
  corner: ["set"],
  penalty: ["shots", "set"],
  yellow: ["goals"],
  red: ["goals"],
  sub: ["subs"],
};

function displayText(play: MatchPlay, team: MatchTeam | undefined, index: NameIndex): string {
  const raw = dropStamp(play.text).trim();
  const body = stripTeam(raw, team);
  switch (play.type) {
    case "goalie": {
      const who = /^(.*?)\s+at goalie for\b/i.exec(body);
      return `In goal ${EM} ${person(who?.[1] ?? body, index)}`;
    }
    case "foul":
      return `Foul on ${person(stripTeam(body.replace(/^foul on\s+/i, ""), team), index)}`;
    case "offside":
      return "Offside";
    case "corner":
      return "Corner kick";
    case "shot": {
      const header = /^header\s+shot by\s+/i.test(body);
      return shotText(
        stripTeam(body.replace(/^(?:header\s+)?shot by\s+/i, ""), team),
        index,
        header,
      );
    }
    case "sub":
      return subText(raw, index);
    case "yellow":
    case "red": {
      const label = play.type === "red" ? "Red card" : "Yellow card";
      const who = stripTeam(body.replace(/^(?:yellow|red) card on\s+/i, ""), team);
      return `${label} ${EM} ${person(who, index)}`;
    }
    case "lineup":
      return lineupText(raw, play.period);
    case "penalty": {
      const { name, keeper } = penaltyParts(body, index);
      return `Penalty missed ${EM} ${name}${keeper ? ` ${EM} saved by ${keeper}` : ""}`;
    }
    default:
      return trimStop(raw);
  }
}

/**
 * The ledger, in the order the programme published it.
 *
 * `homeIndex` is the served side that is the fixture's home team. Without it
 * the score column cannot be put in home-first order, so it is left off rather
 * than printed in an order the page cannot vouch for.
 */
export function ledgerRows(detail: MatchDetail, homeIndex: number | undefined): LedgerRow[] {
  const plays = detail.plays ?? [];
  if (plays.length === 0) return [];
  const index = playerIndex(detail);
  const abbrOf = (t: MatchTeam | undefined): string | null => t?.abbr ?? t?.name ?? null;
  const home = homeIndex === undefined ? undefined : detail.teams[homeIndex];
  const away = homeIndex === undefined ? undefined : detail.teams[1 - homeIndex];

  const endings = plays.filter((p) => p.type === "period" && /^\s*end of\b/i.test(p.text));
  const lastEnding = endings.at(-1);

  const rows: LedgerRow[] = [];
  let running: [number, number] = [0, 0];

  for (const play of plays) {
    const team = play.team === undefined ? undefined : detail.teams[play.team];
    if (play.score) running = [play.score[0], play.score[1]];

    if (play.type === "period") {
      // "Start of 2nd period" marks the same boundary its "End of" twin does.
      if (!/^\s*end of\b/i.test(play.text)) continue;
      rows.push({
        kind: "divider",
        label:
          play.period === "1"
            ? "HALF-TIME"
            : play === lastEnding
              ? "FULL TIME"
              : `END OF PERIOD ${play.period}`,
        score:
          home && away && homeIndex !== undefined
            ? `${abbrOf(home)} ${running[homeIndex]} ${EN} ${running[1 - homeIndex]} ${abbrOf(away)}`
            : null,
      });
      continue;
    }

    const scored = play.score !== undefined;
    let goalLabel: string | null = null;
    let scorer: string | null = null;
    let assists: string | null = null;
    if (scored) {
      const body = stripTeam(dropStamp(play.text).trim(), team);
      if (play.type === "penalty") {
        goalLabel = `GOAL ${MID} PENALTY`;
        scorer = penaltyParts(body, index).name;
      } else {
        goalLabel = "GOAL";
        const parts = goalParts(stripTeam(body.replace(/^goal by\s+/i, ""), team), index);
        scorer = parts.scorer;
        assists = parts.assists;
      }
    }

    rows.push({
      kind: "play",
      clock: play.clock?.trim() || null,
      abbr: abbrOf(team),
      dim: homeIndex !== undefined && play.team !== undefined && play.team !== homeIndex,
      goalLabel,
      scorer,
      assists,
      card: play.type === "yellow" ? "yellow" : play.type === "red" ? "red" : null,
      text: scored ? "" : displayText(play, team, index),
      raw: play.text,
      running:
        scored && homeIndex !== undefined
          ? `${running[homeIndex]}${EN}${running[1 - homeIndex]}`
          : null,
      loud: play.type === "shot",
      filters: scored
        ? play.type === "penalty"
          ? ["goals", "set"]
          : ["goals"]
        : (FILTERS[play.type ?? ""] ?? []),
    });
  }

  return rows;
}
