// The build stamp: when THIS artefact was rendered.
//
// This is the one place on the site where `new Date()` is correct. Every other
// date the site shows derives from the data home (season.collectedAt,
// site.asOf), because the site only honestly knows what its sources told it —
// but "which build am I looking at?" is a fact about the artefact, not the
// data, and only the build clock can answer it.
//
// Evaluated once per build process. It ships as a <meta> tag on each build's
// HOME page only (Page.astro's `stamp`) — invisible to the pixel harness,
// readable with curl — and is the ideal stamp argument for
// scripts/deployed.ts, which waits for the deploy that carries it. Every other
// page is a pure function of the data home, so a deploy synced by content
// uploads only the pages whose data changed (scripts/determinism.ts proves it).
//
// Do not import this anywhere content-bearing: not into derive.ts, not into
// the journal, and never near the numeral audit.
export const builtAt = `${new Date().toISOString().slice(0, 19)}Z`;
