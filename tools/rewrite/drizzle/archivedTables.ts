/** Convex Auth's tables other than `users`: the rewrite archives their rows and has no table for them. */
export const archivedTables: ReadonlySet<string> = new Set(["authSessions", "authAccounts", "authRefreshTokens", "authVerificationCodes", "authVerifiers", "authRateLimits"]);
