// How many players this build follows: every name on the current season's
// rosters of the configured conferences' members, each programme counted once
// however many conference files carry it. A count of what the rosters print,
// never of a squad worked out from box scores. A programme whose roster page
// yielded nothing adds no players and is counted apart, so the figure can say
// how many rosters stand behind it.
//
// The build writes this as players.json (pages/players.json.ts); the About
// page reads every published build's file to draw the divisions side by side.

import type { Gender, NcaaDivisionKey } from "../site.config.ts";
import { memberSlugs, type Season } from "./derive.ts";

export const PLAYERS_SCHEMA = "touchline.players/1";

export interface PlayerCount {
  /** Names on the rosters below. */
  players: number;
  /** Member programmes across the build's conferences. */
  programmes: number;
  /** Of those, the programmes with a collected roster. */
  rostered: number;
}

export interface PlayersFile extends PlayerCount {
  schema: typeof PLAYERS_SCHEMA;
  season: number;
  division: NcaaDivisionKey;
  gender: Gender;
}

export function playerCount(seasons: readonly Season[]): PlayerCount {
  const members = new Set<string>();
  const rosters = new Map<string, number>();
  for (const s of seasons) {
    for (const slug of memberSlugs(s)) {
      members.add(slug);
      const roster = s.rosters?.rosters[slug];
      if (roster && roster.players.length > 0 && !rosters.has(slug)) {
        rosters.set(slug, roster.players.length);
      }
    }
  }
  let players = 0;
  for (const n of rosters.values()) players += n;
  return { players, programmes: members.size, rostered: rosters.size };
}
