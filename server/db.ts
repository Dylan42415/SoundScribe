import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

console.log("[db] Environment keys detected:", Object.keys(process.env).filter(k => !k.includes("SECRET") && !k.includes("KEY")));

if (!process.env.DATABASE_URL) {
  console.error("[db] CRITICAL: DATABASE_URL is missing from process.env!");
  // In dev/debug, don't throw immediately to allow other logs to flush
  if (process.env.NODE_ENV === "production") {
     throw new Error("DATABASE_URL must be set. Check your Railway Variables.");
  }
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
export const db = drizzle(pool, { schema });
