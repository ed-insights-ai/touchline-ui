import { describe, expect, test } from "bun:test";
import {
  ncaaDivisionFromEnv,
  publishedBuilds,
  publishedDivisionsFromEnv,
  publishedFromEnv,
} from "../site.config.ts";
import {
  type Counterpart,
  counterpartPath,
  divisionGender,
  divisionHref,
  genderHref,
  rootBase,
} from "./gender.ts";

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
    expect(rootBase("/touchline-ui/women", "women", "d2")).toBe("/touchline-ui");
    expect(rootBase("/touchline-ui", "men", "d2")).toBe("/touchline-ui");
    expect(rootBase("/women", "women", "d2")).toBe("");
    expect(rootBase("", "men", "d2")).toBe("");
  });

  test("strips this build's division segment too", () => {
    expect(rootBase("/touchline-ui/d1", "men", "d1")).toBe("/touchline-ui");
    expect(rootBase("/touchline-ui/d1/women", "women", "d1")).toBe("/touchline-ui");
    expect(rootBase("/d1", "men", "d1")).toBe("");
    // A Division II base is never mistaken for a Division I one.
    expect(rootBase("/touchline-ui", "men", "d1")).toBe("/touchline-ui");
  });
});

describe("genderHref", () => {
  const men: Counterpart = { conferences: ["gac", "lsc"], hasTeam: () => true };

  test("men's page to the women's build, under the project base", () => {
    expect(
      genderHref("women", "/touchline-ui/gac/team/harding/", women, "/touchline-ui", "men", "d2"),
    ).toBe("/touchline-ui/women/gac/team/harding/");
    expect(genderHref("women", "/touchline-ui/lsc/", women, "/touchline-ui", "men", "d2")).toBe(
      "/touchline-ui/women/",
    );
  });

  test("women's page back to the men's build", () => {
    expect(
      genderHref(
        "men",
        "/touchline-ui/women/gac/matches/",
        men,
        "/touchline-ui/women",
        "women",
        "d2",
      ),
    ).toBe("/touchline-ui/gac/matches/");
  });

  test("the current gender links to the page itself", () => {
    expect(genderHref("men", "/touchline-ui/lsc/team/x/", men, "/touchline-ui", "men", "d2")).toBe(
      "/touchline-ui/lsc/team/x/",
    );
  });

  test("served from a domain root", () => {
    expect(genderHref("women", "/gac/", women, "", "men", "d2")).toBe("/women/gac/");
    expect(genderHref("men", "/women/", men, "/women", "women", "d2")).toBe("/");
  });

  test("inside /d1 the current gender's link keeps the division's base", () => {
    expect(genderHref("men", "/touchline-ui/d1/ivy/", men, "/touchline-ui/d1", "men", "d1")).toBe(
      "/touchline-ui/d1/ivy/",
    );
  });
});

describe("divisionHref", () => {
  const both = ["men", "women"] as const;

  test("each division's home, from either side of the switch", () => {
    expect(divisionHref("d1", "/touchline-ui", "men", "d2", both)).toBe("/touchline-ui/d1/");
    expect(divisionHref("d2", "/touchline-ui/d1", "men", "d1", both)).toBe("/touchline-ui/");
    expect(divisionHref("d2", "/d1", "men", "d1", both)).toBe("/");
  });

  test("a gender the target division does not field lands on one it does", () => {
    // Division I fields no women's build: the women's page links to its men's.
    expect(divisionHref("d1", "/touchline-ui/women", "women", "d2", both)).toBe(
      "/touchline-ui/d1/",
    );
    expect(divisionGender("d1", "women", both)).toBe("men");
    // Division II keeps the reader's own gender.
    expect(divisionHref("d2", "/touchline-ui/d1", "men", "d1", both)).toBe("/touchline-ui/");
    expect(divisionGender("d2", "women", both)).toBe("women");
  });

  test("a division with no build at all has no address", () => {
    expect(divisionHref("d3", "/touchline-ui", "men", "d2", both)).toBeNull();
  });
});

describe("the NCAA division as a build dimension", () => {
  test("unset is Division II; anything unknown is refused", () => {
    expect(ncaaDivisionFromEnv(undefined)).toBe("d2");
    expect(ncaaDivisionFromEnv(" d1 ")).toBe("d1");
    expect(() => ncaaDivisionFromEnv("d4")).toThrow(/TOUCHLINE_NCAA_DIVISION/);
  });

  test("the published divisions: own always, switch order, none without a profile", () => {
    expect(publishedDivisionsFromEnv(undefined, "d2")).toEqual(["d2"]);
    expect(publishedDivisionsFromEnv("d2,d1", "d2")).toEqual(["d1", "d2"]);
    expect(publishedDivisionsFromEnv("d2", "d1")).toEqual(["d1", "d2"]);
    // Division III has no profile, so listing it publishes nothing.
    expect(publishedDivisionsFromEnv("d3", "d2")).toEqual(["d2"]);
  });

  test("the builds: every listed division in every gender it fields", () => {
    expect(publishedBuilds(["d2", "d1"], ["men", "women"])).toEqual([
      { division: "d2", gender: "men", path: "" },
      { division: "d2", gender: "women", path: "/women" },
      { division: "d1", gender: "men", path: "/d1" },
    ]);
    expect(publishedBuilds(["d2"], ["men"])).toEqual([{ division: "d2", gender: "men", path: "" }]);
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
