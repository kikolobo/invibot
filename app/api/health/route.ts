import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Deployment diagnostic. Reports only whether configuration is present and
 * whether the database answers — never a value, so it is safe to hit from
 * anywhere. Remove once deployment is settled.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const present = (name: string) => {
    const value = process.env[name];
    return value ? `set (${value.length} chars)` : "MISSING";
  };

  const env = {
    DATABASE_URL: present("DATABASE_URL"),
    BETTER_AUTH_SECRET: present("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "MISSING",
    VERCEL_ENV: process.env.VERCEL_ENV ?? "(not vercel)",
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "MISSING",
    WHATSAPP_ACCESS_TOKEN: present("WHATSAPP_ACCESS_TOKEN"),
    WHATSAPP_APP_SECRET: present("WHATSAPP_APP_SECRET"),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: present("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  };

  let database: string;
  try {
    const rows = await db.execute(sql`select count(*)::int as n from users`);
    database = `ok, ${JSON.stringify(rows[0] ?? {})}`;
  } catch (error) {
    database = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
  }

  return Response.json({ env, database }, { status: 200 });
}
