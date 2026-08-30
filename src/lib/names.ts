// What to call a programme the fixtures only ever name by slug.
//
// The chain is published-first: a conference file's own `programmes` entry, then
// a box score's served team name, then a configured override, and only then a
// name derived from the slug itself. Nothing here invents a nickname or a city
// — the data home publishes neither, so the pages that wanted them say less
// rather than more.

import { site } from "../site.config.ts";
import { loadFixtures, loadMatches } from "./data.ts";
import type { FixturesFile, MatchesFile } from "./model.ts";

export interface NameEntry {
  slug: string;
  name: string;
  abbr: string;
  /** True when a conference file lists this programme as one of its own. */
  member: boolean;
  /** Where the name came from, for provenance. */
  source: "programme" | "box-score" | "override" | "slug";
}

const SMALL = new Set(["and", "of", "the", "at", "for"]);

function titleize(slug: string): string {
  return slug
    .split("-")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** A last-resort abbreviation: initials for a multi-word name, the first three
 *  letters for a single word. Published abbreviations always win over this. */
function deriveAbbr(name: string): string {
  const words = name.split(/\s+/).filter((w) => !SMALL.has(w.toLowerCase()));
  if (words.length === 1) return (words[0] as string).slice(0, 3).toUpperCase();
  return words
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export class NameBook {
  private readonly entries = new Map<string, NameEntry>();
  private readonly members = new Set<string>();

  constructor(
    programmeSources: readonly FixturesFile[],
    boxScoreSources: readonly (MatchesFile | null)[],
    memberSlugs: Iterable<string> = [],
  ) {
    for (const slug of memberSlugs) this.members.add(slug);
    for (const file of programmeSources) {
      for (const p of file.programmes) {
        if (this.entries.has(p.slug)) continue;
        this.entries.set(p.slug, {
          slug: p.slug,
          name: p.name,
          abbr: p.abbr ?? deriveAbbr(p.name),
          member: this.members.has(p.slug),
          source: "programme",
        });
      }
    }
    // Box scores name the sides they served. They are the only published name
    // Touchline ever sees for an opponent outside the collected conferences.
    for (const file of boxScoreSources) {
      if (!file) continue;
      for (const detail of Object.values(file.matches)) {
        for (const team of detail.teams) {
          const guess = team.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          if (!guess || this.entries.has(guess)) continue;
          this.entries.set(guess, {
            slug: guess,
            name: team.name,
            abbr: team.abbr ?? deriveAbbr(team.name),
            member: false,
            source: "box-score",
          });
        }
      }
    }
  }

  /** Teach the book a name a box score served for a slug we know by fixture. */
  learn(slug: string, name: string, abbr?: string): void {
    const existing = this.entries.get(slug);
    if (existing && existing.source !== "slug") return;
    this.entries.set(slug, {
      slug,
      name,
      abbr: abbr ?? deriveAbbr(name),
      member: this.members.has(slug),
      source: "box-score",
    });
  }

  entry(slug: string): NameEntry {
    const hit = this.entries.get(slug);
    if (hit) return hit;
    const override = site.nameOverrides[slug];
    const name = override ?? titleize(slug);
    const entry: NameEntry = {
      slug,
      name,
      abbr: deriveAbbr(name),
      member: this.members.has(slug),
      source: override ? "override" : "slug",
    };
    this.entries.set(slug, entry);
    return entry;
  }

  name(slug: string): string {
    return this.entry(slug).name;
  }

  abbr(slug: string): string {
    return this.entry(slug).abbr;
  }

  isMember(slug: string): boolean {
    return this.members.has(slug);
  }
}

/** The name book for one conference's pages: its own programmes are members,
 *  and every other conference collected for the same season contributes the
 *  names its publisher printed. */
export function nameBookFor(fixtures: FixturesFile): NameBook {
  const others: FixturesFile[] = [];
  const boxScores: (MatchesFile | null)[] = [];
  for (const key of site.conferences) {
    try {
      const f = loadFixtures(fixtures.season, fixtures.gender, key);
      if (f.conference !== fixtures.conference) others.push(f);
      boxScores.push(loadMatches(fixtures.season, fixtures.gender, key));
    } catch {
      // A conference the data home has not collected simply contributes nothing.
    }
  }
  const book = new NameBook(
    [fixtures, ...others],
    boxScores,
    fixtures.programmes.map((p) => p.slug),
  );
  // Box scores know both sides of a fixture by served name; bind those names to
  // the fixture's own slugs, which the guessed slug above will usually miss.
  const byId = new Map(fixtures.fixtures.map((f) => [f.id, f]));
  const own = loadMatches(fixtures.season, fixtures.gender, conferenceKeyOf(fixtures));
  for (const [id, detail] of Object.entries(own?.matches ?? {})) {
    const fx = byId.get(id);
    if (!fx || detail.home_index === undefined) continue;
    const home = detail.teams[detail.home_index];
    const away = detail.teams[1 - detail.home_index];
    if (home) book.learn(fx.home, home.name, home.abbr);
    if (away) book.learn(fx.away, away.name, away.abbr);
  }
  return book;
}

/** The file key (`gac`) behind a loaded conference file (`GAC`). */
export function conferenceKeyOf(fixtures: FixturesFile): string {
  const lower = fixtures.conference.toLowerCase();
  return site.conferences.includes(lower) ? lower : lower;
}
