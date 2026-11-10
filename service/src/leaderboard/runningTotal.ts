export type RunningTotal = number[];

export function withKudosOn(runningTotal: RunningTotal, day: number, kudos: number): RunningTotal {
  const length = Math.max(runningTotal.length, day + 1);
  return Array.from({ length }, (_, index) => totalUpTo(runningTotal, index) + (index >= day ? kudos : 0));
}

export function totalUpTo(runningTotal: RunningTotal, day: number): number {
  return runningTotal[Math.min(day, runningTotal.length - 1)] ?? 0;
}
