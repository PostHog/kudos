// Imports nothing of Convex; a hook's context comes only from where it stands.
import { memberRead } from "./builder";

export const reader = { read: memberRead };
export const label = (ctx: Parameters<Parameters<typeof memberRead>[0]>[0]) => (ctx ? "read" : "none");
