import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

let instance: DB | undefined;

/**
 * The connection is opened on first use rather than at module load.
 *
 * Next evaluates every route module while collecting page data at build time,
 * so connecting eagerly made the build itself require production database
 * credentials — a missing DATABASE_URL failed the whole build instead of the
 * one route that actually needed it. Building and running are separate
 * concerns; only running needs a database.
 */
function getDb(): DB {
  if (instance) return instance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local locally, or to the project's environment variables when deploying.",
    );
  }

  // `prepare: false` is required for connection poolers (Neon's pooled endpoint,
  // PgBouncer in transaction mode). Without it you get "prepared statement
  // already exists" under load.
  const client = postgres(connectionString, { prepare: false });
  instance = drizzle(client, { schema, casing: "snake_case" });
  return instance;
}

export const db = new Proxy({} as DB, {
  get(_target, property) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[property];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
