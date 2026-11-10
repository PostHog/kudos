// A module of plain helpers that share names with Convex's builder and the service's stub helper: no context anywhere.
export function query<T>(make: () => T): T {
  return make();
}

export function notPorted() {
  return 42;
}
