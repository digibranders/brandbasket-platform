import { defineConfig } from "drizzle-kit";
import { loadLocalEnv, requireEnv } from "./src/local-env";

loadLocalEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: requireEnv("DATABASE_URL_OWNER") },
  strict: true,
  verbose: true,
});
