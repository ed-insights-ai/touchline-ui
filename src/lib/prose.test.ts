import { describe, expect, test } from "bun:test";
import { CHART_CAPTION } from "./journal.ts";
import { contentWords, restatements, WORDS_MOVED_RATIO, wordsMoved } from "./prose.ts";

describe("a sentence's content words", () => {
  test("stop words go, punctuation goes, a figure is never a content word", () => {
    expect(contentWords("Georgian Court have won once and drawn twice, scoring 7.")).toEqual([
      "georgian",
      "court",
      "won",
      "once",
      "drawn",
      "twice",
      "scoring",
    ]);
    expect(contentWords("7 of 40")).toEqual([]);
  });
});

describe("a line that is another line with the words moved", () => {
  test("the check goes red on a real restatement", () => {
    // The teeth: a dek that is the pattern line with its words moved is a
    // clash, and the same dek beside the short mechanical caption is not.
    const dek = {
      where: "dek",
      text: "Harding has scored more goals than any other side in the conference.",
    };
    const restated = {
      where: "pattern",
      text: "More goals than any other side in the conference: Harding has scored them.",
    };
    const caption = { where: "chart caption", text: CHART_CAPTION, mechanical: true as const };
    expect(wordsMoved([dek, restated])).toHaveLength(1);
    expect(wordsMoved([dek, caption])).toEqual([]);
    // Without the mechanical mark the caption would clash, which is the
    // failure this bead measured.
    expect(wordsMoved([dek, { ...caption, mechanical: undefined }])).toEqual([]);
  });

  test("the pair comes back in the order given, so a caller knows which is lower", () => {
    const a = { where: "dek", text: "Harding has scored more goals than any other side." };
    const b = {
      where: "finding",
      text: "More goals than any other side: Harding has scored them.",
    };
    const [pair] = restatements([a, b]);
    expect(pair?.first.where).toBe("dek");
    expect(pair?.second.where).toBe("finding");
    expect(pair?.ratio).toBeGreaterThanOrEqual(WORDS_MOVED_RATIO);
  });

  test("the CACC dek and featured line that blocked the publish", () => {
    // The case this module was cut out for: the site test flagged it at
    // 0.90 and the validator had never looked.
    const dek = {
      where: "cacc dek",
      text:
        "Georgian Court have won once and drawn twice, scoring seven and conceding four, and their " +
        "first win came at home to Staten Island after draws on the road at Bentley and Saint " +
        "Michael's. Bridgeport's record is the same shape, a win and two draws. Every other " +
        "programme in the CACC has already been beaten.",
    };
    const featured = {
      where: "cacc featured last_match",
      text: "Georgian Court's first win, and their first match at home, after draws at Bentley and at Saint Michael's.",
    };
    expect(wordsMoved([dek, featured])).toEqual(["cacc dek × cacc featured last_match — 0.90"]);
  });

  test("elaboration is not repetition", () => {
    const dek = {
      where: "dek",
      text: "Twelve of the conference's forty matches have been played and nothing is decided.",
    };
    const finding = {
      where: "finding",
      text: "Harding played three of those twelve, at home to Arkansas Tech, Henderson State and Ouachita Baptist.",
    };
    expect(wordsMoved([dek, finding])).toEqual([]);
  });
});
