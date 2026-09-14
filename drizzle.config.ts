import { defineConfig } from "drizzle-kit";

// Next.js reads .env.local automatically; drizzle-kit runs standalone and does not.
// `process.loadEnvFile` is built into Node, so this needs no dependency.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Not present — fall through to the next candidate or the ambient environment.
  }
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
