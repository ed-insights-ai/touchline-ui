// The tier on the site's pages: the method page keeps its place on the
// Men / Women switch.

import { describe, expect, test } from "bun:test";
import { counterpartPath } from "./gender.ts";

describe("the gender switch keeps the method page", () => {
  test("/about/tiers/ maps to itself, and /about/ still does", () => {
    const target = { conferences: ["gac"], hasTeam: () => false };
    expect(counterpartPath("/about/tiers/", target)).toBe("/about/tiers/");
    expect(counterpartPath("/about/", target)).toBe("/about/");
    expect(counterpartPath("/about/other/", target)).toBe("/");
  });
});
