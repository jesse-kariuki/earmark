/** Injected test clock: `fixedNow("2026-11-03T09:00:00Z")`. */
export interface TestClock {
  now(): number;
  advance(ms: number): number;
  set(iso: string): number;
}

export function fixedNow(iso = "2026-11-03T09:00:00.000Z"): TestClock {
  let t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`fixedNow: bad ISO date ${iso}`);
  return {
    now: () => t,
    advance: (ms) => (t += ms),
    set: (next) => (t = Date.parse(next)),
  };
}
