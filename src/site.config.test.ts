/**
 * The configuration the whole site is described by.
 *
 * Only the derived parts are worth a test: a literal in this file is the
 * decision itself, and holding a decision to a copy of itself proves nothing.
 */

import { describe, expect, test } from "bun:test";
import { divisionScope, site } from "./site.config.ts";

describe("the footer's scope token", () => {
  test("drops the governing body, because the disclaimer named it four words earlier", () => {
    expect(site.division).toContain(site.governingBody);
    expect(divisionScope()).toBe("Division II men's soccer");
    expect(divisionScope()).not.toContain(site.governingBody);
  });

  test("and the two together are the division, so they cannot come to disagree", () => {
    // Derived rather than a second literal. This is the property that makes
    // one string safe to read two ways.
    expect(`${site.governingBody} ${divisionScope()}`).toBe(site.division);
  });

  test("a division not named after its body is left whole rather than cut at a guess", () => {
    // The degradation that matters: point the site at a competition whose name
    // does not start with the body's, and the token must not lose its first
    // words to a prefix that was never there.
    const original = site.division;
    try {
      (site as { division: string }).division = "Premier Division men's soccer";
      expect(divisionScope()).toBe("Premier Division men's soccer");
    } finally {
      (site as { division: string }).division = original;
    }
  });
});
