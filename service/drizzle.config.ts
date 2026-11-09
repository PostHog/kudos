// drizzle-kit writes the SQL migrations in migrations/ from the data model: `pnpm db:generate --name <what changed>`.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
});
