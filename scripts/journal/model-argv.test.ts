import { describe, expect, test } from "bun:test";
import { modelArgv } from "./model-argv.ts";

describe("the model command's arguments", () => {
  test("with no model chosen, the command's own default answers", () => {
    expect(modelArgv()).toEqual(["-p"]);
    expect(modelArgv("")).toEqual(["-p"]);
    expect(modelArgv("  ")).toEqual(["-p"]);
  });

  test("a chosen model is passed through verbatim", () => {
    expect(modelArgv("claude-haiku-4-5")).toEqual(["-p", "--model", "claude-haiku-4-5"]);
    expect(modelArgv("sonnet")).toEqual(["-p", "--model", "sonnet"]);
  });
});
