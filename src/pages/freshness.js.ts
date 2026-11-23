// The build's freshness file: each conference's collect stamps, keyed by
// conference, written into every `[data-conf][data-stamp]` element: the footer
// cell of the team and match pages (SiteFooter `shared`, the "line" stamp) and
// the SOURCE row of a match page with no box score (the "short" stamp). It is the one file those pages share that moves
// on every collect, so they themselves stay byte-identical until their own
// data changes and a content-synced deploy leaves them alone.
//
// The texts are the ones those pages printed: collectionLine's for the footer,
// the match page's "Nov 20, 12:32 UTC" for its row, so a reader sees no
// difference. The host must serve this file
// uncached (or revalidated), like the HTML: a cached copy shows a stale stamp.
import type { APIRoute } from "astro";
import { collectionLine, lastLooked, loadSeason } from "../lib/derive.ts";
import { shortStamp } from "../lib/freshness.ts";
import { site } from "../site.config.ts";

export const GET: APIRoute = () => {
  const stamps: Record<string, { line: string; short: string }> = {};
  for (const key of site.conferences) {
    const season = loadSeason(key);
    stamps[key] = { line: collectionLine([season]), short: shortStamp(lastLooked(season)) };
  }
  const body =
    `(function(){var m=${JSON.stringify(stamps)};` +
    'var c=document.querySelectorAll("[data-conf][data-stamp]");' +
    'for(var i=0;i<c.length;i++){var s=m[c[i].getAttribute("data-conf")],t=s&&s[c[i].getAttribute("data-stamp")];if(t)c[i].textContent=t;}})();\n';
  return new Response(body, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
};
