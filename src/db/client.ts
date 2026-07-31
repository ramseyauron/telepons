import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "@/config/env";
import * as schema from "./schema";

mkdirSync(dirname(env.DATABASE_URL), { recursive: true });

const sqlite = new Database(env.DATABASE_URL);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
