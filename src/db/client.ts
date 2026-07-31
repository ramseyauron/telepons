import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/config/env";
import * as schema from "./schema";

// Supabase's transaction pooler does not support prepared statements.
export const postgresClient = postgres(env.DATABASE_URL, {
  prepare: false,
  max: env.DATABASE_POOL_SIZE,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(postgresClient, { schema });
