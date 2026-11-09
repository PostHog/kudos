// Lets Node load today's convex/ modules, which import each other without the .ts extension.
// Usage: node --import ./tools/rewrite/resolveTs.ts <script>
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".")) throw error;
      for (const suffix of [".ts", ".js", "/index.ts"]) {
        try {
          return nextResolve(specifier + suffix, context);
        } catch {}
      }
      throw error;
    }
  },
});
