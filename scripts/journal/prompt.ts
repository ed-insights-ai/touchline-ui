// The prompt. It hands the writer the brief, the previous journal, and the
// grammar it must write inside — and it names the basis vocabulary the
// validator can actually recompute, because a claim the validator cannot
// audit is a claim that will be dropped.

import type { JournalFile } from "../../src/lib/journal.ts";
import type { Brief } from "./brief.ts";

export interface PromptInput {
  brief: Brief;
  fixtures: string[];
  previous: JournalFile | null;
}

const GRAMMAR = `EVIDENCE GRAMMAR — every claim carries exactly one label.
  observed   a directly published or collected fact
  derived    computed exactly from published values
  signal     a meaningful pattern whose cause is unverified
  projected  a forward-looking estimate
  context    biography or background, not a finding

BASIS VOCABULARY — observed and derived claims are recomputed before publish and
DROPPED if they cannot be confirmed. A basis a checker does not recognise is
dropped too. Use these shapes, and only figures that appear in the brief:

  player line        { "source": "stats", "player": "<exact name>", "programme": "<slug>",
                       "goals"|"assists"|"points"|"shots"|"sog"|"minutes"|"gp"|
                       "saves"|"goals_against"|"shutouts"|"save_pct": <number>, ... }
  team goals         { "programme": "<slug>", "gf": <n>, "ga": <n> }
  team record        { "programme": "<slug>", "wins": <n>, "draws": <n>, "losses": <n> }
  conference record  { "derived_from": "fixtures", "wins": <n>, "draws": <n>,
                       "losses": <n>, "gf": <n>, "ga": <n> }     (vs non-members)
  distinct scorers   { "programme": "<slug>", "distinct_scorers_min": <n> }
  silences           { "source": "fixtures", "finals_without_score": <n>,
                       "past_date_no_result": <n> }
  box-score gaps     { "source": "matches", "box_score_gaps": <n> }
  fixture counts     { "source": "fixtures", "played": <n>, "total": <n> }
  conference opening { "conference_opens": "YYYY-MM-DD" }

Always name the player AND the programme in a player basis. Never invent a key.`;

const VOICE = `VOICE — the programme's house register.
- Evidence first, no hype, no superlatives the numbers do not carry.
- Count dates in days, never rounded to weeks. Spell numbers up to twenty.
- Absence is content: a silence is named, never dropped or explained away.
- Never write about a match, player or figure that is not in the brief.
- "programme", not "program". "Match Centre", not "match center".
- "matches", never "fixtures", in every sentence a reader will see. The JSON
  field is still called "fixture_ref" — that is the contract's name, not the
  reader's word.
- Each finding must read as ONE logically coherent claim. Do not fuse two
  statistics into a single clause: "10 saves, one of them a shutout" is two
  facts wearing one sentence, and a shutout is not a save. Verified figures in
  an incoherent sentence still make a bad finding — the validator checks the
  numbers, not the reasoning.`;

export function buildPrompt(input: PromptInput): string {
  const { brief, fixtures, previous } = input;
  const continuity = previous
    ? `PREVIOUS JOURNAL (written for collect ${previous.data_collected_at}).
Continuity matters: where a finding's underlying facts have NOT changed, reuse
its exact wording. Rewrite only what the new data actually changed. Do not
manufacture novelty.

${JSON.stringify(previous, null, 2)}
`
    : "There is no previous journal for this conference. This is the first.";

  return `You are the writer of Touchline, a season journal for ${brief.meta.conference} ${brief.meta.gender}'s
soccer, ${brief.meta.season}. You write the editorial layer over collected data. You never
collect, never estimate, and never reach past the brief below.

${GRAMMAR}

${VOICE}

BRIEF — every figure available to you, computed from the collected files.
${JSON.stringify(brief, null, 2)}

MATCH REFERENCES — the matches you may write about. Each line is a match's
ADDRESS, then " · ", then what the source published about it.

A "fixture_ref" (the contract's field name, kept as-is) is the ADDRESS ALONE —
the part before the first " · ". Its
grammar is "YYYY-MM-DD home-slug v away-slug" and nothing else: no scoreline, no
kickoff time, no team name, no annotation of any kind. So for the line
"2026-08-29 mckendree v southern-nazarene  ·  1-2 · 12:30", write:

  "fixture_ref": "2026-08-29 mckendree v southern-nazarene"

${fixtures.join("\n")}

${continuity}

TASK — return ONE JSON object, schema "touchline.journal/1", and nothing else:
no markdown fence, no commentary before or after.

{
  "schema": "touchline.journal/1",
  "season": ${brief.meta.season},
  "gender": "${brief.meta.gender}",
  "conference": "${brief.meta.conference}",
  "generated_at": "<ISO 8601, now>",
  "data_collected_at": "${brief.meta.collected_at}",
  "kicker": "<CONFERENCE · SHORT PHRASE · MON DD, uppercase>",
  "headline": "<one sentence, the season's state right now>",
  "dek": "<two sentences at most, standing the headline on named figures>",
  "summary_stat": { "label": "...", "value": "...", "detail": "...", "basis": { ... } },
  "pattern": {
    "label": "observed|derived|signal",
    "text": "<the one thing the data most clearly shows>",
    "chart": { "kind": "goals-for-by-team", "caption": "...",
               "values": { "<slug>": <goals>, ... }, "highlight": "<slug>" },
    "basis": { ... }
  },
  "findings": [ { "label": "...", "text": "...", "basis": { ... } } ],
  "players_to_watch": [ { "player": "...", "programme": "<slug>", "position": "GK|DEF|MID|FWD",
                          "class": "FR|SO|JR|SR|5Y", "line": "<published figures only>" } ],
  "featured": { "last_match": { "fixture_ref": "...", "line": "..." },
                "next_match": { "fixture_ref": "...", "line": "..." } },
  "table_state": { "mode": "${brief.table.mode}", "statement": "...", "footnote": "..." }
}

Three to five findings. Exactly three players to watch. The chart's values must be
the brief's goals_for map, unchanged. At least one finding must name a silence if
the brief reports any.`;
}
