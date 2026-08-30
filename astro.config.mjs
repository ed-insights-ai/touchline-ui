// @ts-check
import { defineConfig } from "astro/config";

// Static output, always. The site is rebuilt on every data collect; nothing
// is computed at request time. See reference/ARCHITECTURE.md.
// A project page serves from /<repo>/, a custom domain from /. SITE_BASE and
// SITE_URL carry that difference so one build command covers both.
const base = process.env.SITE_BASE?.trim() || undefined;
const site = process.env.SITE_URL?.trim() || undefined;

export default defineConfig({
  ...(site ? { site } : {}),
  ...(base ? { base } : {}),
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
});
