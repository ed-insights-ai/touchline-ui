// The tier cut shared by sections 5 and 8: the top ceil(p × n) on a value,
// plus anyone tied with the last of them.
//
// The fraction is taken as a whole-number percentage and the count is
// ceil(percent × n / 100), in integers: percent × n and 100 are exact, so the
// quotient is exact whenever it is whole and a whole count can never come out
// a hair above itself. For every n up to 2,000 this agrees with ceil(0.05 × n)
// and ceil(0.20 × n) in floating point (cut.test in shooting.test.ts holds
// that), so it is a safeguard, not a difference from the contract.

/** ceil(percent × n / 100), computed without the floating-point trap above. */
export function cutCount(percent: number, n: number): number {
  return Math.ceil((percent * n) / 100);
}

/**
 * The ids inside the cut: the top `cutCount(percent, n)` by value, highest
 * first, plus every item whose value equals the last of them. Ties are exact
 * equality. Empty when there is nothing to cut.
 */
export function topWithTies<T extends { id: string; value: number }>(
  items: readonly T[],
  percent: number,
): Set<string> {
  const n = items.length;
  const k = cutCount(percent, n);
  if (n === 0 || k === 0) return new Set();
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const last = (sorted[Math.min(k, n) - 1] as T).value;
  return new Set(sorted.filter((x) => x.value >= last).map((x) => x.id));
}
