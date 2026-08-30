// The whole site is described here. A conference is configuration — never a
// literal in code — so pointing Touchline at GSC or LSC is an edit to this
// file and nothing else.

export type Gender = "men" | "women";

export interface SiteConfig {
  season: number;
  gender: Gender;
  /** Conference file keys, in navigation order. These name the data files:
   *  `data/fixtures/{season}-{gender}-{key}.json`. */
  conferences: readonly string[];
  /** The conference the site root opens on. Must appear in `conferences`. */
  home: string;
  /** Build-time "today". Undefined means: use the date the data was collected,
   *  which is the only date the site can honestly claim to know about. */
  asOf?: string;
  /** Slug → display name, for opponents no collected file ever names. Used
   *  only after the published sources are exhausted (see lib/names.ts). */
  nameOverrides: Readonly<Record<string, string>>;
}

export const site: SiteConfig = {
  season: Number(process.env.TOUCHLINE_SEASON ?? 2026),
  gender: (process.env.TOUCHLINE_GENDER ?? "men") as Gender,
  conferences: ["gac", "lsc", "gsc"],
  home: "gac",
  asOf: process.env.TOUCHLINE_AS_OF?.trim() || undefined,
  nameOverrides: {
    "ncaa-1st-and-2nd-round": "NCAA First & Second Rounds",
    "ncaa-first-and-second-rounds": "NCAA First & Second Rounds",
    "ncaa-3rd-round-and-quarter-finals": "NCAA Third Round & Quarterfinals",
    "ncaa-third-round-and-quarterfinals": "NCAA Third Round & Quarterfinals",
    "ncaa-semi-finals-and-finals": "NCAA Semifinals & Final",
    "ncaa-semifinals-and-final": "NCAA Semifinals & Final",
  },
};
