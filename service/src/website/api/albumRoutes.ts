// The website API's routes for the album, the book, the collection, the inventory, hoggies, the leaderboards, the group
// and people boards and the activity. Stack S16 fills this list; the route table (table.ts) takes it as it is.
import type { Route } from "./route.ts";

// `as const satisfies` keeps each route's name and result type, which the return-type check reads.
export const albumRoutes = [] as const satisfies readonly Route[];
