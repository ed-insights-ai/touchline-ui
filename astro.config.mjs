// @ts-check
import { writeFile } from "node:fs/promises";
import { defineConfig } from "astro/config";
import {
  genderFromEnv,
  ncaaDivisionFromEnv,
  publishedBuilds,
  publishedDivisionsFromEnv,
  publishedFromEnv,
} from "./src/site.config.ts";

// Static output, always. The site is rebuilt on every data collect; nothing
// is computed at request time. See reference/ARCHITECTURE.md.
// A project page serves from /<repo>/, a custom domain from /. SITE_BASE and
// SITE_URL carry that difference so one build command covers both.
// SITE_BASE is deployment configuration, and the failure when it is missing is
// silent: the build succeeds, every page renders locally, and in production
// every link and stylesheet 404s because the URLs skip the prefix. TOUCHLINE_
// STRICT_BASE makes that loud for the commands that deploy.
const base = process.env.SITE_BASE?.trim() || undefined;
if (process.env.TOUCHLINE_STRICT_BASE === "1" && base === undefined) {
  throw new Error(
    "SITE_BASE is unset and this build is meant to deploy.\n" +
      "  A project page serves under /<repo>/; without it the site's pages exist\n" +
      "  and every link and stylesheet 404s. Set SITE_BASE, or SITE_BASE=/ for a\n" +
      "  site served from the domain root.",
  );
}
const site = process.env.SITE_URL?.trim() || undefined;

/**
 * A sitemap, written from Astro's OWN list of the pages it just built.
 *
 * Not from a crawl of dist/ and not from a second copy of the route rules:
 * either would be a description of the site that can disagree with the site.
 * This is the same list the build used, so a route that exists is in it and a
 * route that does not cannot be.
 *
 * It needs an absolute URL per page, so it needs to know where the site will
 * be served. Without SITE_URL there is no honest one to write, and a guessed
 * host in a sitemap is an instruction to crawl somewhere this build knows
 * nothing about — so it writes nothing and says so. The base path is carried
 * for the reason the whole file carries it: a project page serves from
 * /<repo>/, and a sitemap of base-less URLs lists 416 pages that 404.
 */
function sitemap() {
  return {
    name: "touchline-sitemap",
    hooks: {
      "astro:build:done": async ({ dir, pages, logger }) => {
        if (!site) {
          logger.warn("SITE_URL unset — no sitemap written (a sitemap needs absolute URLs)");
          return;
        }
        const origin = site.replace(/\/$/, "");
        const prefix = (base ?? "").replace(/\/$/, "");
        const urls = pages
          .map((p) => `${origin}${prefix}/${p.pathname}`.replace(/([^:])\/{2,}/g, "$1/"))
          .sort();
        const xml =
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          urls
            .map((u) => `  <url><loc>${u}</loc></url>`)
            .join("\n") +
          "\n</urlset>\n";
        await writeFile(new URL("sitemap.xml", dir), xml, "utf8");

        // robots.txt is written here and not kept in public/, because the one
        // line that matters in it is an absolute URL and this is the only
        // place that knows the host and the base. A checked-in robots.txt
        // would name a sitemap at whichever host somebody last typed.
        //
        // Indexing is invited on the owner's explicit ruling, not because
        // "allow all" is the usual default: this site publishes what
        // programmes published, and whether it wants to be found is a question
        // about the site rather than about robots.txt.
        //
        // A crawler reads robots.txt only at the root, so only the root build
        // (Division II men's) writes one; every other build (the women's at
        // /women, Division I at /d1, each written into the same segment of
        // dist/ by the justfile) writes none, and the root build names every
        // sitemap the deploy carries, read from the same build list the
        // header's switch reads (src/site.config.ts publishedBuilds).
        if (division === "d2" && gender === "men") {
          const sitemaps = builds.map((b) => `${origin}${prefix}${b.path}/sitemap.xml`);
          await writeFile(
            new URL("robots.txt", dir),
            `User-agent: *\nAllow: /\n\n${sitemaps.map((s) => `Sitemap: ${s}`).join("\n")}\n`,
            "utf8",
          );
        }
        logger.info(`sitemap.xml — ${urls.length} routes under ${prefix || "/"}, robots.txt`);
      },
    },
  };
}

// Where this build writes. The men's build is dist/ as always; the justfile
// writes the women's build into dist/women/ and Division I's into dist/d1/,
// the same segments they are served under (src/site.config.ts buildPath), so
// one dist/ is one deploy.
const outDir = process.env.TOUCHLINE_OUT_DIR?.trim() || undefined;
const gender = genderFromEnv(process.env.TOUCHLINE_GENDER);
const division = ncaaDivisionFromEnv(process.env.TOUCHLINE_NCAA_DIVISION);
const builds = publishedBuilds(
  publishedDivisionsFromEnv(process.env.TOUCHLINE_NCAA_DIVISIONS, division),
  publishedFromEnv(process.env.TOUCHLINE_GENDERS, gender),
);

export default defineConfig({
  ...(site ? { site } : {}),
  ...(base ? { base } : {}),
  ...(outDir ? { outDir } : {}),
  output: "static",
  integrations: [sitemap()],
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
});
