// The website API's route table: what the website's code calls, and nothing else. Each list is one stack's to fill,
// so no stack edits another's; the transport refuses two routes of one name at boot.
import { albumRoutes } from "./albumRoutes.ts";
import { profileRoutes } from "./profileRoutes.ts";

export const websiteRoutes = [...albumRoutes, ...profileRoutes] as const;
