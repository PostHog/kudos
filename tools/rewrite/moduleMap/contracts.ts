// Service contracts for exports the skeleton generator can't print but another stack imports: a function that returns
// Convex's Query, a class over a context. Each stands, as a stub that throws notPorted, where the generator leaves the
// export out; the stack that owns the module replaces it, and deletes its entry when the module leaves the map.
import type { Contracts } from "./skeleton.ts";

// None stands now: S11 ported groups.ts and transitions.ts, whose two contracts were the last.
export const contracts: Contracts = {};
