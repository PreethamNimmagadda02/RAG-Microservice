/**
 * High-resolution timing utility.
 *
 * Centralises the nanosecond → millisecond conversion that was previously
 * duplicated across routes and middleware (4 occurrences of `/ 1_000_000`).
 */

/**
 * Capture the current high-resolution timestamp.
 * Alias for `process.hrtime.bigint()` — returns nanoseconds as a BigInt.
 */
export function hrtimeNow(): bigint {
  return process.hrtime.bigint();
}

/**
 * Convert the elapsed time between two `process.hrtime.bigint()` values
 * to whole milliseconds (rounded).
 *
 * @param start - The starting timestamp from `hrtimeNow()`
 * @param end   - The ending timestamp from `hrtimeNow()` (defaults to now)
 * @returns Wall-clock milliseconds, rounded to the nearest integer
 */
export function hrtimeToMs(start: bigint, end: bigint = hrtimeNow()): number {
  return Math.round(Number(end - start) / 1_000_000);
}
