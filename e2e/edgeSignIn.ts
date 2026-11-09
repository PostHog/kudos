/**
 * Whether a redirect's `location` sends the visitor to exactly the edge's sign-in page: the same origin and path as
 * `signInUrl`, with any query (where the edge carries the visitor's way back). A prefix match would let a broken edge
 * pass, as with a redirect to a sibling path like `/oauth2/start-maintenance` or to a host whose name starts the same.
 */
export function isEdgeSignIn(location: string, appUrl: string, signInUrl: string) {
  const to = new URL(location, appUrl);
  const signIn = new URL(signInUrl);
  return to.origin === signIn.origin && to.pathname === signIn.pathname;
}
