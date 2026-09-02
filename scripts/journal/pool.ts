// A bounded pool: one function over every item, at most `cap` in flight.
//
// Written for the journal's model calls — long, independent of one another,
// and rate-limited at the far end — so they run side by side under a cap
// rather than one after the next, and one that fails settles as a rejection
// in its own place instead of stopping the ones behind it. Nothing here knows
// what a conference is.

/**
 * Run `fn` over `items`, at most `cap` calls at a time, and settle every one.
 * Results come back in input order, in the shape `Promise.allSettled` gives:
 * a rejection is a result, not an exit, and the returned promise never
 * rejects. A cap below one is treated as one.
 */
export async function pool<T, R>(
  items: readonly T[],
  cap: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const width = Number.isFinite(cap) && cap >= 1 ? Math.floor(cap) : 1;
  const results: PromiseSettledResult<R>[] = [];
  let next = 0;
  // Each worker takes the next unclaimed index until there are none. `width`
  // workers is the cap; a worker that finishes early simply takes the next.
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index] as T, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return results;
}
