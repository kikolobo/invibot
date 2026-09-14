import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// `prepare: false` is required for connection poolers (Neon's pooled endpoint, PgBouncer
// in transaction mode). Without it you get "prepared statement already exists" under load.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema, casing: "snake_case" });
export { schema };
