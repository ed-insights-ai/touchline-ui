// What the build says about itself: the debug rows for the comparison with
// the independent implementation (never committed, never read by the site),
// and the measured tables the build log quotes.

import type { TierEntry, TiersFile } from "../../src/lib/tiers.ts";
import type { GenderResult, SeasonResult } from "./compute.ts";

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
      player_id: x.p.playerId,
      number: x.p.number,
      group: x.group,
      minutes: x.p.minutes,
      adjG: x.p.adjG,
      adjS: x.p.adjS,
      threat: x.threat,
      estimate: x.estimate,
      seasons_counted:
        x.kind === "team_defence"
          ? [...x.counted].reverse()
          : x.estimate !== null
            ? x.basisSeasons
            : [],
      career_record: x.career,
    })),
    teams: Object.fromEntries(
      [...r.teams]
        .sort((a, b) => (a.slug < b.slug ? -1 : 1))
        .map((t) => [
          t.slug,
          {
            n: t.matches,
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
  const n = grouped.reduce((a, t) => a + t.matches, 0);
  const sa = grouped.reduce((a, t) => a + t.shotsFaced, 0);
  const ga = grouped.reduce((a, t) => a + t.goalsAgainst, 0);
  const perSeason = seasons.map((s) => {
    const t = s.teams.filter((x) => x.workload !== null);
    const sn = t.reduce((a, x) => a + x.matches, 0);
    const ssa = t.reduce((a, x) => a + x.shotsFaced, 0);
    const sga = t.reduce((a, x) => a + x.goalsAgainst, 0);
    return { sfpm: ssa / sn, pct: (100 * sga) / ssa };
  });
  const live = (r: SeasonResult) => r.rated.filter((x) => x.status !== "incomplete");
  const regulars = (group: string) =>
    mean(seasons.map((s) => count(live(s), (x) => x.group === group && x.regular)));
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
    sfpmPooled: sa / n,
    pctPooled: (100 * ga) / sa,
    sfpmMean: mean(perSeason.map((x) => x.sfpm)),
    pctMean: mean(perSeason.map((x) => x.pct)),
    regularD: regulars("D"),
    regularGK: regulars("GK"),
    twoOrMore: two,
    holding: held,
    penaltyShare: (100 * penGoals) / goals,
    penGoals,
    goals,
  };
}

/** The measured part of the build log, as markdown. */
export function reportMarkdown(
  results: readonly GenderResult[],
  files: readonly TiersFile[],
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
  row("Programme-seasons with a workload group, all five seasons", "996", "1,255", (x) =>
    String(x.workloadTeams),
  );
  row(
    "Division shots faced a match / percentage that went in (pooled over five seasons)",
    "12.3 / 12.8%",
    "12.4 / 11.5%",
    (x) => `${f1(x.sfpmPooled)} / ${f1(x.pctPooled)}%`,
  );
  row(
    "… the same, mean of the five per-season figures",
    "12.3 / 12.8%",
    "12.4 / 11.5%",
    (x) => `${f1(x.sfpmMean)} / ${f1(x.pctMean)}%`,
  );
  row("Regular defenders a season", "about 388", "about 535", (x) => f1(x.regularD));
  row("Regular goalkeepers a season", "about 173", "about 226", (x) => f1(x.regularGK));
  row(
    "Defenders and goalkeepers with two or more seasons counted, a season, 2023 to 2026",
    "about 188",
    "about 314",
    (x) => f1(x.twoOrMore),
  );
  row("Of those, holding the tier (2023 to 2026)", "about 38", "about 64", (x) => f1(x.holding));
  row(
    "Penalty goals as a share of all goals in the play-by-play",
    "8.1%",
    "5.6%",
    (x) => `${x.penaltyShare.toFixed(1)}% (${x.penGoals} of ${x.goals})`,
  );

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
    "| Season | Records | Physical | Exhibitions | Forfeits | Not final | Disputed (kept, canonical score) | Kept | No box score | Box score with no home_index | Refused by the fold (unplayed) |",
  );
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const g of results) {
    for (const r of g.seasons) {
      const c = r.fold;
      out.push(
        `| ${r.season}-${r.gender} | ${c.records} | ${c.physical} | ${c.exhibitions} | ${c.forfeits} | ${c.unplayed} | ${c.disputed} | ${c.kept} | ${c.noBoxScore} | ${c.unoriented} | ${c.refused.length ? c.refused.join("; ") : "0"} |`,
      );
    }
  }

  out.push("\n### Model\n");
  for (const g of results) {
    out.push(
      `- ${g.gender}: goals mu ${g.goals.mu.toFixed(4)}, home ${g.goals.home.toFixed(4)}, ${g.goals.att.size} teams; shots mu ${g.shots.mu.toFixed(4)}, home ${g.shots.home.toFixed(4)}, ${g.shots.att.size} teams`,
    );
  }

  out.push("\n### Measures behind the ambiguities\n");
  out.push(
    "| Season | Workload boundaries | Penalty plays / unattributed | Keeper-only lines | Lines without minutes | Multi-id people | Twice on one sheet | Box-group ties | Roster label unrecognised | No roster entry | Split pairs | Contradicted links | Ambiguous links | No-minutes programmes | Teams with n = 0 | Programme-days with two matches |",
  );
  out.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const g of results) {
    for (const r of g.seasons) {
      const m = r.measures;
      const b = m.boundaries
        ? `${m.boundaries.first.toFixed(3)} / ${m.boundaries.second.toFixed(3)}`
        : "—";
      out.push(
        `| ${r.season}-${r.gender} | ${b} | ${m.penaltyPlays} / ${m.penaltyUnattributed} | ${m.keeperOnlyLines} | ${m.linesSkippedNoMinutes} | ${m.multiIdPlayers} | ${m.twiceOnOneSheet} | ${m.boxGroupTies} | ${m.rosterLabelUnrecognised} | ${m.noRosterEntry} | ${m.splitPairs} | ${m.contradictedLinks} | ${m.ambiguousLinks} | ${m.noMinutesProgrammes.length ? m.noMinutesProgrammes.join(", ") : "0"} | ${m.teamsWithoutMatches.length ? m.teamsWithoutMatches.join(", ") : "0"} | ${m.sameDayDoubles.length} |`,
      );
    }
  }

  out.push("\n### Penalty check (section 4): play-by-play penalty goals against the stats file\n");
  out.push(
    "| Season | Players compared | Disagreements | Penalty scorers with no stats line | Stats line without penalty_goals |",
  );
  out.push("| --- | --- | --- | --- | --- |");
  const gaps: { season: string; g: SeasonResult["measures"]["penaltyGaps"][number] }[] = [];
  for (const g of results) {
    for (const r of g.seasons) {
      const m = r.measures;
      out.push(
        `| ${r.season}-${r.gender} | ${m.penaltyCompared} | ${m.penaltyGaps.length} | ${m.penaltyNoStatsLine} | ${m.penaltyStatsUnpublished} |`,
      );
      for (const x of m.penaltyGaps) gaps.push({ season: `${r.season}-${r.gender}`, g: x });
    }
  }
  const total = gaps.length;
  gaps.sort(
    (a, b) =>
      Math.abs(b.g.playByPlay - b.g.stats) - Math.abs(a.g.playByPlay - a.g.stats) ||
      (a.season < b.season ? -1 : a.season > b.season ? 1 : 0) ||
      (a.g.programme < b.g.programme ? -1 : a.g.programme > b.g.programme ? 1 : 0) ||
      (a.g.name < b.g.name ? -1 : 1),
  );
  out.push(`\nDisagreements in all: ${total}. The ten largest gaps:\n`);
  out.push("| File | Programme | Player | Play-by-play | Stats file |");
  out.push("| --- | --- | --- | --- | --- |");
  for (const x of gaps.slice(0, 10)) {
    out.push(`| ${x.season} | ${x.g.programme} | ${x.g.name} | ${x.g.playByPlay} | ${x.g.stats} |`);
  }
  return `${out.join("\n")}\n`;
}

/** Every disagreement of the penalty check, for the debug directory. */
export function penaltyGapsCsv(results: readonly GenderResult[]): string {
  const rows = ["file,programme,player,play_by_play,stats"];
  for (const g of results) {
    for (const r of g.seasons) {
      for (const x of r.measures.penaltyGaps) {
        rows.push(
          [
            `${r.season}-${r.gender}`,
            x.programme,
            JSON.stringify(x.name),
            x.playByPlay,
            x.stats,
          ].join(","),
        );
      }
    }
  }
  return `${rows.join("\n")}\n`;
}
