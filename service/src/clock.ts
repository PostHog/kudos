// The one clock the app reads. Domain code never reads `Date.now()`: mutations and queries get one `now` from the
// runner, actions read this clock live.

export interface Clock {
  /** Real time plus the test offset, in milliseconds. */
  now(): number;
  /** Moves the clock forward by `ms`, for the test route only; answers the new `now`. Never back. */
  advance(ms: number): number;
}

/** Real time plus an in-memory offset that starts at zero; only `/testing/time` moves it. */
export function createClock({ real = Date.now }: { real?: () => number } = {}): Clock {
  let offset = 0;
  return {
    now: () => real() + offset,
    advance(ms) {
      if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`The clock moves only forward, by a finite amount, not ${ms}`);
      offset += ms;
      return real() + offset;
    },
  };
}
