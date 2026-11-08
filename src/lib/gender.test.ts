import { describe, expect, test } from "bun:test";
import { publishedFromEnv } from "../site.config.ts";
import { type Counterpart, counterpartPath, genderHref, rootBase } from "./gender.ts";

// The women's side as the pilot ships it: one conference, and a team list
// that holds Harding but not Fort Hays State (no women's GAC programme).
const women: Counterpart = {
  conferences: ["gac"],
  hasTeam: (conf, slug) => conf === "gac" && slug === "harding",
};

describe("counterpartPath", () => {
  test("home and About map to themselves", () => {
    expect(counterpartPath("/", women)).toBe("/");
    expect(counterpartPath("/about/", women)).toBe("/about/");
  });

  test("a followed conference keeps its view", () => {
    expect(counterpartPath("/gac/", women)).toBe("/gac/");
    expect(counterpartPath("/gac/matches/", women)).toBe("/gac/matches/");
  });

  test("a team the other gender fields maps to its own page", () => {
    expect(counterpartPath("/gac/team/harding/", women)).toBe("/gac/team/harding/");
  });

  test("a team the other gender does not field lands on the conference", () => {
    expect(counterpartPath("/gac/team/fort-hays-state/", women)).toBe("/gac/");
  });

  test("a match lands on the conference: its id is this gender's alone", () => {
    expect(counterpartPath("/gac/match/sidearm-harding-15273/", women)).toBe("/gac/");
  });

  test("a conference the other gender does not follow lands on home", () => {
    expect(counterpartPath("/lsc/", women)).toBe("/");
    expect(counterpartPath("/lsc/team/west-texas-am/", women)).toBe("/");
  });
});

describe("rootBase", () => {
  test("strips this build's own gender segment, and only that", () => {
    expect(rootBase("/touchline-ui/women", "women")).toBe("/touchline-ui");
    expect(rootBase("/touchline-ui", "men")).toBe("/touchline-ui");
    expect(rootBase("/women", "women")).toBe("");
    expect(rootBase("", "men")).toBe("");
  });
});

describe("genderHref", () => {
  const men: Counterpart = { conferences: ["gac", "lsc"], hasTeam: () => true };

  test("men's page to the women's build, under the project base", () => {
    expect(
      genderHref("women", "/touchline-ui/gac/team/harding/", women, "/touchline-ui", "men"),
    ).toBe("/touchline-ui/women/gac/team/harding/");
    expect(genderHref("women", "/touchline-ui/lsc/", women, "/touchline-ui", "men")).toBe(
      "/touchline-ui/women/",
    );
  });

  test("women's page back to the men's build", () => {
    expect(
      genderHref("men", "/touchline-ui/women/gac/matches/", men, "/touchline-ui/women", "women"),
    ).toBe("/touchline-ui/gac/matches/");
  });

  test("the current gender links to the page itself", () => {
    expect(genderHref("men", "/touchline-ui/lsc/team/x/", men, "/touchline-ui", "men")).toBe(
      "/touchline-ui/lsc/team/x/",
    );
  });

  test("served from a domain root", () => {
    expect(genderHref("women", "/gac/", women, "", "men")).toBe("/women/gac/");
    expect(genderHref("men", "/women/", men, "/women", "women")).toBe("/");
  });
});

describe("publishedFromEnv", () => {
  test("unset publishes this build's gender alone: no switch", () => {
    expect(publishedFromEnv(undefined, "men")).toEqual(["men"]);
    expect(publishedFromEnv("", "women")).toEqual(["women"]);
  });

  test("lists both in switch order, whatever order they were given", () => {
    expect(publishedFromEnv("women, men", "men")).toEqual(["men", "women"]);
  });

  test("always includes the build's own gender", () => {
    expect(publishedFromEnv("men", "women")).toEqual(["men", "women"]);
  });

  test("refuses a gender it does not know", () => {
    expect(() => publishedFromEnv("men,mixed", "men")).toThrow(/TOUCHLINE_GENDER/);
  });
});
