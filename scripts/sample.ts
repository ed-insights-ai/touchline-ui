/**
 * The sample pages `scripts/deployed.ts` asks the live host for, for the build
 * the environment names (TOUCHLINE_NCAA_DIVISION, TOUCHLINE_GENDER): the home,
 * the build's home conference, About, its sample programme's team page, and
 * the first match page this very build wrote. Read from config and the built
 * artefact, so no build is sampled with another division's names.
 *
 *   TOUCHLINE_NCAA_DIVISION=d1 bun scripts/sample.ts dist/d1
 *   → /,/a10/,/about/,/a10/team/saint-louis/,/a10/match/sidearm-…/
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { site } from "../src/site.config.ts";

const dist = process.argv[2] ?? "dist";
const conf = site.home;
const pages = ["/", `/${conf}/`, "/about/", `/${conf}/team/${site.sampleProgramme}/`];
const matchDir = join(dist, conf, "match");
const first = existsSync(matchDir) ? readdirSync(matchDir).sort()[0] : undefined;
if (first) pages.push(`/${conf}/match/${first}/`);
console.log(pages.join(","));
