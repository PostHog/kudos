// One page of a paged read and where the next one starts: the shape the app's paging loops read, today from Convex's
// paginate. The cursor is the service's own keyset over the index (./indexOrder.ts), opaque to the caller.
export interface PageOptions {
  numItems: number;
  /** Null for the first page. */
  cursor: string | null;
}

export interface Page<T> {
  page: T[];
  isDone: boolean;
  continueCursor: string;
}
