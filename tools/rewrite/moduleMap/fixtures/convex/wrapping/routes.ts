// Registers only through the app's builder and imports nothing of Convex, yet is over a context all the same.
import { memberRead } from "./builder";

export const getCount = memberRead(async () => 1);
