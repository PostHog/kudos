// The website API's routes for the profile, the player card, links and previews, settings, onboarding, the emoji
// wizard, buying, quests, seen and last visit, and browser analytics. Stack S17 fills this list; the route table
// (table.ts) takes it as it is.
import type { Route } from "./route.ts";

// `as const satisfies` keeps each route's name and result type, which the return-type check reads.
export const profileRoutes = [] as const satisfies readonly Route[];
