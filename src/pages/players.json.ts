// This build's player count (lib/players.ts), for the About page of every
// build in the deploy to read beside its own. It moves when a roster does,
// so, like freshness.js, it is a file of its own and no page changes with it.
import type { APIRoute } from "astro";
import { homeSeasons } from "../lib/home.ts";
import { PLAYERS_SCHEMA, type PlayersFile, playerCount } from "../lib/players.ts";
import { site } from "../site.config.ts";

export const GET: APIRoute = () => {
  const file: PlayersFile = {
    schema: PLAYERS_SCHEMA,
    season: site.season,
    division: site.ncaaDivision,
    gender: site.gender,
    ...playerCount(homeSeasons()),
  };
  return new Response(`${JSON.stringify(file)}\n`, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
