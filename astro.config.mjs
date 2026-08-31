// @ts-check
import { writeFile } from "node:fs/promises";
import { defineConfig } from "astro/config";

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
        const day = new Date().toISOString().slice(0, 10);
        const urls = pages
          .map((p) => `${origin}${prefix}/${p.pathname}`.replace(/([^:])\/{2,}/g, "$1/"))
          .sort();
        const xml =
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          urls
            .map((u) => `  <url><loc>${u}</loc><lastmod>${day}</lastmod></url>`)
            .join("\n") +
          "\n</urlset>\n";
        await writeFile(new URL("sitemap.xml", dir), xml, "utf8");
        logger.info(`sitemap.xml — ${urls.length} routes under ${prefix || "/"}`);
      },
    },
  };
}

export default defineConfig({
  ...(site ? { site } : {}),
  ...(base ? { base } : {}),
  output: "static",
  integrations: [sitemap()],
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
});
