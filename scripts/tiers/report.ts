// What the build says about itself: the debug rows for the comparison with
// the independent implementation (never committed, never read by the site),
// and the measured tables the build log quotes.

import type { TierEntry, TiersFile } from "../../src/lib/tiers.ts";
import type { GenderResult, SeasonResult } from "./compute.ts";
import type { StatsPenaltyChange } from "./players.ts";

/** The comparison file's rows: per player and per team, the intermediate
 *  figures. Written to tiers/.debug/, which is gitignored; it holds the
 *  estimates section 9 keeps out of every committed file. */
export function debugFile(r: SeasonResult) {
  return {
    season: r.season,
    gender: r.gender,
    players: r.rated.map((x) => ({
      programme: x.p.programme,
      key: x.p.key,
      name: x.p.name,
      player_id: x.p.playerId,
      number: x.p.number,
      group: x.group,
      kind: x.kind,
      status: x.status,
      tier: x.tier,
      reason: x.reason,
      minutes: x.p.minutes,
      matches: x.p.matches,
      starts: x.p.starts,
      doubled: x.p.doubled,
      G: x.p.G,
      S: x.p.S,
      pen_goals: x.p.penGoals,
      pen_attempts: x.p.penAttempts,
      skipped_pen_goals: x.p.skippedPenGoals,
      skipped_pen_attempts: x.p.skippedPenAttempts,
      stats_penalties: x.statsChange,
      adjG: x.p.adjG,
      adjS: x.p.adjS,
      threat: x.threat,
      estimate: x.estimate,
      regular: x.regular,
      previous: x.previous ? { key: x.previous.p.key, number: x.previous.p.number } : null,
      seasons_counted:
        x.kind === "team_defence"
          ? [...x.counted].reverse()
          : x.estimate !== null
            ? x.basisSeasons
            : [],
      career_record: x.career,
      line_name: x.p.lineName,
      name_source: x.p.nameSource,
      minutes_mode: x.ofRecord.mode,
      minutes_list: x.ofRecord.list,
      share_records: x.ofRecord.denominator,
      records: x.records,
      with_minutes: x.withMinutes,
      box_minutes: x.boxMinutes,
      u_test: x.couldReachBar,
      u_records: x.unprinted,
    })),
    teams: Object.fromEntries(
      [...r.teams]
        .sort((a, b) => (a.slug < b.slug ? -1 : 1))
        .map((t) => [
          t.slug,
          {
            n: t.matches,
            m: r.measures.withMinutes.get(t.slug) ?? 0,
            GA: t.goalsAgainst,
            EGA: t.expected,
            SA: t.shotsFaced,
            workload: t.workload,
            record: t.record,
            score: t.score,
          },
        ]),
    ),
  };
}

const count = <T>(xs: readonly T[], f: (x: T) => boolean): number => xs.filter(f).length;
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const f1 = (x: number): string => x.toFixed(1);

export interface FileCounts {
  season: number;
  gender: string;
  entries: number;
  byKindStatus: Record<string, number>;
  incompleteByReason: Record<string, number>;
  tiers: { tier1: Record<string, number>; tier2: Record<string, number> };
  defenceTier: { D: number; GK: number };
  teams: { light: number; typical: number; heavy: number; none: number };
}

export function fileCounts(artifact: TiersFile): FileCounts {
  const all: TierEntry[] = Object.values(artifact.players).flat();
  const byKindStatus: Record<string, number> = {};
  const incompleteByReason: Record<string, number> = {};
  for (const e of all) {
    const k = `${e.kind ?? "none"} / ${e.status}`;
    byKindStatus[k] = (byKindStatus[k] ?? 0) + 1;
    if (e.reason) incompleteByReason[e.reason] = (incompleteByReason[e.reason] ?? 0) + 1;
  }
  const tier1: Record<string, number> = { F: 0, M: 0 };
  const tier2: Record<string, number> = { F: 0, M: 0 };
  for (const e of all) {
    if (e.kind !== "shooting_scoring" || e.tier === null || e.group === null) continue;
    const into = e.tier === 1 ? tier1 : tier2;
    into[e.group] = (into[e.group] ?? 0) + 1;
  }
  const teams = Object.values(artifact.teams);
  return {
    season: artifact.season,
    gender: artifact.gender,
    entries: all.length,
    byKindStatus,
    incompleteByReason,
    tiers: { tier1, tier2 },
    defenceTier: {
      D: count(all, (e) => e.kind === "team_defence" && e.tier === 1 && e.group === "D"),
      GK: count(all, (e) => e.kind === "team_defence" && e.tier === 1 && e.group === "GK"),
    },
    teams: {
      light: count(teams, (t) => t.workload === "light"),
      typical: count(teams, (t) => t.workload === "typical"),
      heavy: count(teams, (t) => t.workload === "heavy"),
      none: count(teams, (t) => t.workload === null),
    },
  };
}

/** Section 11.2, measured, per gender. */
export function sanity(g: GenderResult) {
  const seasons = g.seasons;
  const grouped = seasons.flatMap((s) => s.teams.filter((t) => t.workload !== null));
  const regulars = (group: string) =>
    mean(seasons.map((s) => count(s.rated, (x) => x.group === group && x.regular)));
  const later = seasons.filter((s) => s.season >= 2023);
  const two = mean(
    later.map((s) => count(s.rated, (x) => x.kind === "team_defence" && x.counted.length >= 2)),
  );
  const held = mean(
    later.map((s) => count(s.rated, (x) => x.kind === "team_defence" && x.tier === 1)),
  );
  const penGoals = seasons.reduce((a, s) => a + s.measures.penaltyGoalPlays, 0);
  const goals = seasons.reduce((a, s) => a + s.measures.goalPlays, 0);
  return {
    workloadTeams: grouped.length,
    regularD: regulars("D"),
    regularGK: regulars("GK"),
    twoOrMore: two,
    holding: held,
    penaltyShare: (100 * penGoals) / goals,
    penGoals,
    goals,
  };
}

/** Whether a change of the second penalty source is wholly the play-by-play's
 *  own penalties on records 4.6 skipped for printing no minutes: goals that
 *  never entered G, taken off it again. */
export function onSkippedLines(c: StatsPenaltyChange): boolean {
  const eG = (c.statsGoals ?? 0) - c.playByPlayGoals;
  const eS = (c.statsAttempts ?? 0) - c.playByPlayAttempts;
  return eG <= c.skippedGoals && eS <= c.skippedAttempts;
}

/** The programme-seasons the one-match-a-day rule changed: a collected shared
 *  programme that had one match counted twice, and a collected programme whose
 *  slug a copy borrowed for the other side, which had a match it never played. */
export function dayMergeEffects(r: SeasonResult): {
  merges: number;
  records: number;
  removed: number;
  fromKept: number;
  doubleCounted: string[];
  phantom: string[];
} {
  const collected = new Set(r.teams.map((t) => t.slug));
  const doubleCounted = new Set<string>();
  const phantom = new Set<string>();
  let records = 0;
  for (const m of r.fold.merges) {
    records += m.records;
    if (collected.has(m.shared)) doubleCounted.add(m.shared);
    for (const a of m.aliases) if (collected.has(a)) phantom.add(a);
  }
  return {
    merges: r.fold.merges.length,
    records,
    removed: records - r.fold.merges.length,
    fromKept: count(r.fold.merges, (m) => m.from === "kept"),
    doubleCounted: [...doubleCounted].sort(),
    phantom: [...phantom].sort(),
  };
}

/** The measured part of the build log, as markdown. `beforeRoster` is the
 *  same build with the roster pass of 4.2 switched off (acceptance 11.4). */
export function reportMarkdown(
  results: readonly GenderResult[],
  files: readonly TiersFile[],
  beforeRoster: readonly GenderResult[],
): string {
  const out: string[] = [];
  const s = new Map(results.map((g) => [g.gender, sanity(g)]));
  const men = s.get("men");
  const women = s.get("women");
  out.push("### Section 11.2: sanity against the research prototype\n");
  out.push("| Quantity | Expected men | Measured men | Expected women | Measured women |");
  out.push("| --- | --- | --- | --- | --- |");
  const row = (q: string, em: string, ew: string, f: (x: ReturnType<typeof sanity>) => string) =>
    out.push(`| ${q} | ${em} | ${men ? f(men) : "—"} | ${ew} | ${women ? f(women) : "—"} |`);
  const n = (v: number) => v.toLocaleString("en-US");
  row("Programme-seasons with a workload group, all five seasons", "990", "1,249", (x) =>
    n(x.workloadTeams),
  );
  row("Regular defenders a season", "about 444", "about 611", (x) => f1(x.regularD));
  row("Regular goalkeepers a season", "about 181", "about 231", (x) => f1(x.regularGK));
  row(
    "Defenders and goalkeepers with two or more seasons counted, a season, 2023 to 2026",
    "about 207",
    "about 349",
    (x) => f1(x.twoOrMore),
  );
  row("Of those, holding the tier (2023 to 2026)", "about 42", "about 71", (x) => f1(x.holding));
  row(
    "Penalty goals as a share of all goals in the play-by-play",
    "8.2%",
    "5.6%",
    (x) => `${x.penaltyShare.toFixed(1)}% (${n(x.penGoals)} of ${n(x.goals)})`,
  );

  out.push("\n### Acceptance 11.4: players incomplete for identity\n");
  out.push(
    "| File | Without the roster pass: identity / of them 600+ minutes | With it (the artifact): identity / of them 600+ minutes | Lines the roster lookup tied to an entry | Lookups refused (line already tied elsewhere) | Merges blocked (different page ids or roster entries) |",
  );
  out.push("| --- | --- | --- | --- | --- | --- |");
  for (const g of results) {
    const before = beforeRoster.find((b) => b.gender === g.gender);
    for (const r of g.seasons) {
      const b = before?.seasons.find((x) => x.season === r.season)?.measures;
      const m = r.measures;
      out.push(
        `| ${r.season}-${r.gender} | ${b ? `${b.identity} / ${b.identity600}` : "—"} | ${m.identity} / ${m.identity600} | ${m.join.rosterFound} | ${m.join.rosterConflicts} | ${m.join.blocked} |`,
      );
    }
  }

  out.push("\n### Counts per file\n");
  out.push(
    "| File | Entries | shooting_scoring: tier / eligible / needs_minutes / incomplete | team_defence: tier / eligible / needs_second_season / needs_minutes / incomplete | no group (incomplete) | Incomplete by reason | Teams light / typical / heavy / none |",
  );
  out.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const file of files) {
    const c = fileCounts(file);
    const k = (kind: string, status: string) => c.byKindStatus[`${kind} / ${status}`] ?? 0;
    const reasons = Object.entries(c.incompleteByReason)
      .sort()
      .map(([r, v]) => `${r} ${v}`)
      .join(", ");
    out.push(
      `| ${c.season}-${c.gender} | ${c.entries} | ${["tier", "eligible", "needs_minutes", "incomplete"].map((x) => k("shooting_scoring", x)).join(" / ")} | ${["tier", "eligible", "needs_second_season", "needs_minutes", "incomplete"].map((x) => k("team_defence", x)).join(" / ")} | ${k("none", "incomplete")} | ${reasons} | ${c.teams.light} / ${c.teams.typical} / ${c.teams.heavy} / ${c.teams.none} |`,
    );
  }

  out.push("\n### Tier holders per file\n");
  out.push(
    "| File | Tier 1 F | Tier 1 M | Tier 2 F | Tier 2 M | Team defence: defenders | Team defence: goalkeepers |",
  );
  out.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const file of files) {
    const c = fileCounts(file);
    out.push(
      `| ${c.season}-${c.gender} | ${c.tiers.tier1.F} | ${c.tiers.tier1.M} | ${c.tiers.tier2.F} | ${c.tiers.tier2.M} | ${c.defenceTier.D} | ${c.defenceTier.GK} |`,
    );
  }

  out.push("\n### One record per match, and what the build set aside\n");
  out.push(
    "| Season | Sightings | Physical (site fold) | Exhibitions | Forfeits | Not final | No box score in any copy | Records | Disputed (kept, canonical score) | Box score from another copy | Box score with no home_index | Refused by the fold (unplayed) |",
  );
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const g of results) {
    for (const r of g.seasons) {
      const c = r.fold;
      out.push(
        `| ${r.season}-${r.gender} | ${c.sightings} | ${c.physical} | ${c.exhibitions} | ${c.forfeits} | ${c.unplayed} | ${c.noBoxScore} | ${c.records} | ${c.disputed} | ${c.boxFromOtherCopy} | ${c.unoriented} | ${c.refused.length ? c.refused.join("; ") : "0"} |`,
      );
    }
  }

  out.push("\n### One match a day (section 1, version 2.2)\n");
  out.push(
    "| Season | Matches merged | Records they were | Records removed | Other side's slug from the kept copy (no single own copy) | Collected programme-seasons that had a match counted twice | Collected programme-seasons credited with a match they never played (a borrowed slug) | Clusters the rule could not rewrite |",
  );
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  const ill: string[] = [];
  const mergeLines: string[] = [];
  let totals = { merges: 0, records: 0, removed: 0, fromKept: 0, doubled: 0, phantom: 0 };
  for (const g of results) {
    for (const r of g.seasons) {
      const e = dayMergeEffects(r);
      totals = {
        merges: totals.merges + e.merges,
        records: totals.records + e.records,
        removed: totals.removed + e.removed,
        fromKept: totals.fromKept + e.fromKept,
        doubled: totals.doubled + e.doubleCounted.length,
        phantom: totals.phantom + e.phantom.length,
      };
      out.push(
        `| ${r.season}-${r.gender} | ${e.merges} | ${e.records} | ${e.removed} | ${e.fromKept} | ${e.doubleCounted.length} | ${e.phantom.length}${e.phantom.length ? ` (${e.phantom.join(", ")})` : ""} | ${r.fold.illDefined.length} |`,
      );
      for (const x of r.fold.illDefined) ill.push(`- ${r.season}-${r.gender} ${x}`);
      for (const m of r.fold.merges) {
        mergeLines.push(
          `| ${r.season}-${r.gender} | ${m.date} | ${m.shared} | ${m.other} | ${m.from === "own" ? "its own copy" : "the kept copy"} | ${m.aliases.join(", ") || "—"} | ${m.records} |`,
        );
      }
    }
  }
  out.push(
    `| all | ${totals.merges} | ${totals.records} | ${totals.removed} | ${totals.fromKept} | ${totals.doubled} | ${totals.phantom} | ${ill.length} |`,
  );
  out.push("\nClusters the rule could not rewrite, kept unmerged:\n");
  out.push(ill.length ? ill.join("\n") : "- none");
  out.push("\n<details><summary>Every merge</summary>\n");
  out.push("| File | Date | Shared programme | Other side | From | Slugs rewritten | Records |");
  out.push("| --- | --- | --- | --- | --- | --- | --- |");
  out.push(...mergeLines);
  out.push("\n</details>");

  out.push("\n### Model\n");
  for (const g of results) {
    out.push(
      `- ${g.gender}: goals mu ${g.goals.mu.toFixed(4)}, home ${g.goals.home.toFixed(4)}, ${g.goals.att.size} teams; shots mu ${g.shots.mu.toFixed(4)}, home ${g.shots.home.toFixed(4)}, ${g.shots.att.size} teams`,
    );
  }

  out.push("\n### Measures behind the ambiguities\n");
  out.push(
    "| Season | Workload boundaries | Penalty attempts / unattributed / not attempts | Lines without minutes | Records with a doubled line | Box-group ties | Roster label with no group | No roster entry | Split pairs | Contradicted links | Ambiguous links | No-minutes programmes | Teams with n = 0 | Programme-days with two records |",
  );
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const g of results) {
    for (const r of g.seasons) {
      const m = r.measures;
      const b = m.boundaries
        ? `${m.boundaries.first.toFixed(3)} / ${m.boundaries.second.toFixed(3)}`
        : "—";
      out.push(
        `| ${r.season}-${r.gender} | ${b} | ${m.penaltyAttempts} / ${m.penaltyUnattributed} / ${m.penaltyNotAttempts} | ${m.linesSkippedNoMinutes} | ${m.doubledRecords} | ${m.boxGroupTies} | ${m.rosterLabelNoGroup} | ${m.noRosterLine} | ${m.splitPairs} | ${m.contradictedLinks} | ${m.ambiguousLinks} | ${m.noMinutesProgrammes.length ? m.noMinutesProgrammes.join(", ") : "0"} | ${m.teamsWithoutMatches.length ? m.teamsWithoutMatches.join(", ") : "0"} | ${m.sameDayDoubles.length ? m.sameDayDoubles.join(", ") : "0"} |`,
      );
    }
  }

  out.push("");
  out.push(
    "| Season | no_position / with no label at all | Player-seasons the stats file's penalties changed | … of them, every excess penalty is one the play-by-play credits on a record 4.6 skipped (no minutes) |",
  );
  out.push("| --- | --- | --- | --- |");
  const labels = new Map<string, number>();
  const years = new Map<string, number>();
  for (const g of results) {
    for (const r of g.seasons) {
      const m = r.measures;
      for (const [l, c] of m.noPositionLabels) labels.set(l, (labels.get(l) ?? 0) + c);
      for (const [y, c] of m.unplacedClassYears) years.set(y, (years.get(y) ?? 0) + c);
      out.push(
        `| ${r.season}-${r.gender} | ${m.noPosition} / ${m.noPositionUnlabelled} | ${m.statsChanges.length} | ${count(m.statsChanges, (x) => onSkippedLines(x.change))} |`,
      );
    }
  }
  const tally = (xs: Map<string, number>, n: number) =>
    [...xs]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, n)
      .map(([l, c]) => `\`${JSON.stringify(l)}\` ${c}`)
      .join(", ") || "none";
  // A label printed once is often a club or a school, which says where a
  // player comes from: those are counted, not listed.
  const repeated = new Map([...labels].filter(([, c]) => c > 1));
  const once = labels.size - repeated.size;
  out.push(
    `\nLabels carried by no_position players, all files: ${tally(repeated, 15)}; and ${once} labels printed once, not listed (some are a club or a school).`,
  );
  out.push(
    `\nRoster class years the 4.4 ladder cannot place (they name no year, and never contradict a link), all files: ${tally(years, 30)}.`,
  );

  out.push(
    "\n### The second penalty source (4.6): player-seasons whose stats file counts more penalties than the play-by-play\n",
  );
  out.push(
    "Each one's adjusted goals and shots were scaled down as 4.6 says. Counts are as the two sources print them.\n",
  );
  out.push(
    "| File | Programme | Player | Penalty goals: play-by-play / stats file | Penalty attempts: play-by-play / stats file | The excess sits on records with no minutes |",
  );
  out.push("| --- | --- | --- | --- | --- | --- |");
  for (const g of results) {
    for (const r of g.seasons) {
      const rows = [...r.measures.statsChanges].sort(
        (a, b) =>
          (a.programme < b.programme ? -1 : a.programme > b.programme ? 1 : 0) ||
          (a.name < b.name ? -1 : 1),
      );
      for (const x of rows) {
        const c = x.change;
        out.push(
          `| ${r.season}-${r.gender} | ${x.programme} | ${x.name} | ${c.playByPlayGoals} / ${c.statsGoals ?? "—"} | ${c.playByPlayAttempts} / ${c.statsAttempts ?? "—"} | ${onSkippedLines(c) ? "yes" : "no"} |`,
        );
      }
    }
  }
  return `${out.join("\n")}\n`;
}

/** Every change the second penalty source made, with its factors, for the
 *  debug directory. */
export function statsChangesCsv(results: readonly GenderResult[]): string {
  const rows = [
    "file,programme,player,pbp_goals,stats_goals,pbp_attempts,stats_attempts,goals_factor,shots_factor",
  ];
  for (const g of results) {
    for (const r of g.seasons) {
      for (const x of r.measures.statsChanges) {
        const c = x.change;
        rows.push(
          [
            `${r.season}-${r.gender}`,
            x.programme,
            JSON.stringify(x.name),
            c.playByPlayGoals,
            c.statsGoals,
            c.playByPlayAttempts,
            c.statsAttempts,
            c.goalsFactor,
            c.shotsFactor,
          ].join(","),
        );
      }
    }
  }
  return `${rows.join("\n")}\n`;
}
