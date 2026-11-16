// The tier cut shared by sections 5 and 8: the top ceil(p × n) on a value,
// plus anyone tied with the last of them.
//
// The fraction is taken as a whole-number percentage and the count is
// ceil(percent × n / 100). Written as 0.05 × n in floating point, a count that
// is exactly whole can come out a hair above it (0.05 × 60 is
// 3.0000000000000004, whose ceiling is 4), which would hand the tier to one
// player more than the contract does. percent × n and 100 are exact integers,
// so their quotient is exact whenever it is whole.

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
