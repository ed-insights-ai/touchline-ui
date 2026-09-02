/**
 * The pool's promises: results in input order, never more than the cap in
 * flight, and a failure that is a result rather than an exit.
 */

import { describe, expect, test } from "bun:test";
import { pool } from "./pool.ts";

/** A promise the test settles from outside, so it decides when an item ends. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Let every pending microtask and zero-delay timer run. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("pool", () => {
  test("results keep input order whatever order the items finish in", async () => {
    const delays = [30, 5, 20, 1];
    const results = await pool(
      delays,
      4,
      (ms, i) => new Promise<string>((r) => setTimeout(() => r(`item ${i} after ${ms}ms`), ms)),
    );
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : r.reason))).toEqual([
      "item 0 after 30ms",
      "item 1 after 5ms",
      "item 2 after 20ms",
      "item 3 after 1ms",
    ]);
  });

  test("never more than cap in flight, and the next starts as one ends", async () => {
    const gates = Array.from({ length: 5 }, deferred);
    let running = 0;
    let peak = 0;
    const done = pool(gates, 2, async (gate) => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
    });
    await tick();
    expect(running).toBe(2);
    gates[0]?.resolve();
    await tick();
    expect(running).toBe(2);
    for (const g of gates) g.resolve();
    const results = await done;
    expect(running).toBe(0);
    expect(peak).toBe(2);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  test("a rejection settles in its place and the others fulfil", async () => {
    const results = await pool([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("two");
      return n * 10;
    });
    expect(results[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(results[1]?.status).toBe("rejected");
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(((results[1] as PromiseRejectedResult).reason as Error).message).toBe("two");
    expect(results[2]).toEqual({ status: "fulfilled", value: 30 });
  });

  test("a cap wider than the list runs everything at once", async () => {
    const gates = Array.from({ length: 3 }, deferred);
    let running = 0;
    const done = pool(gates, 10, async (gate) => {
      running += 1;
      await gate.promise;
    });
    await tick();
    expect(running).toBe(3);
    for (const g of gates) g.resolve();
    expect((await done).length).toBe(3);
  });

  test("an empty list resolves to []", async () => {
    expect(await pool([], 4, async () => 1)).toEqual([]);
  });

  test("a cap below one is one", async () => {
    const gates = Array.from({ length: 3 }, deferred);
    let running = 0;
    let peak = 0;
    const done = pool(gates, 0, async (gate) => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
    });
    await tick();
    expect(running).toBe(1);
    for (const g of gates) g.resolve();
    await done;
    expect(peak).toBe(1);
  });
});
