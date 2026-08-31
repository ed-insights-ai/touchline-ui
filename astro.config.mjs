// @ts-check
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

export default defineConfig({
  ...(site ? { site } : {}),
  ...(base ? { base } : {}),
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
});
