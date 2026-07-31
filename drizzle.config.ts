import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/postgres-migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_MIGRATION_URL ??
      process.env.POSTGRES_URL_NON_POOLING ??
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      "postgresql://postgres:postgres@localhost:5432/telepons",
  },
});
