// The module map's bodies: a function the map declares but whose domain stack hasn't ported it yet throws this, named
// by its former Convex path, so a test or journey that reaches it fails loudly and says which stack it waits on.
export class NotPortedError extends Error {
  override name = "NotPortedError";
  readonly path: string;

  constructor(path: string) {
    super(`${path} is not ported yet`);
    this.path = path;
  }
}

export function notPorted(path: string): NotPortedError {
  return new NotPortedError(path);
}

/**
 * A value the map declares, such as a parse hook over a context, before its stack ports it: importing it and comparing
 * it work, and any other use (reading, calling, writing) throws.
 */
export function notPortedValue<T>(path: string): T {
  const fail = () => {
    throw notPorted(path);
  };
  return new Proxy(function notPortedYet() {}, { get: fail, set: fail, has: fail, apply: fail, construct: fail, ownKeys: fail, getOwnPropertyDescriptor: fail, defineProperty: fail, deleteProperty: fail, getPrototypeOf: fail }) as T;
}
