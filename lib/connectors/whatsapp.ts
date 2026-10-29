import { sql } from "drizzle-orm";
import { db } from "@/db";
import { PROFILES, activeProfile, whatsappConfig, type WhatsAppProfile } from "@/lib/whatsapp/client";

const GRAPH = "https://graph.facebook.com/v21.0";

export type NumberHealth = {
  profile: WhatsAppProfile;
  active: boolean;
  configured: boolean;
  phoneNumberId?: string;
  wabaId?: string | null;
  error?: string;
  number?: {
    display: string | null;
    verifiedName: string | null;
    nameStatus: string | null;
    quality: string | null;
    tier: string | null;
    status: string | null;
    throughput: string | null;
  };
  templates?: { name: string; status: string; category: string }[];
  templatesError?: string;
};

/** A Graph GET with a short fuse: the console must render even when Meta is slow. */
async function graph<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GRAPH}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message ?? "Meta respondió con un error");
  return body as T;
}

async function health(profile: WhatsAppProfile): Promise<NumberHealth> {
  const config = whatsappConfig(profile);
  const base: NumberHealth = { profile, active: profile === activeProfile(), configured: Boolean(config) };
  if (!config) return base;
  base.phoneNumberId = config.phoneNumberId;
  base.wabaId = config.wabaId;

  try {
    const number = await graph<{
      display_phone_number?: string;
      verified_name?: string;
      name_status?: string;
      quality_rating?: string;
      messaging_limit_tier?: string;
      status?: string;
      throughput?: { level?: string };
    }>(
      `${config.phoneNumberId}?fields=display_phone_number,verified_name,name_status,quality_rating,messaging_limit_tier,status,throughput`,
      config.accessToken,
    );
    base.number = {
      display: number.display_phone_number ?? null,
      verifiedName: number.verified_name ?? null,
      nameStatus: number.name_status ?? null,
      quality: number.quality_rating ?? null,
      tier: number.messaging_limit_tier ?? null,
      status: number.status ?? null,
      throughput: number.throughput?.level ?? null,
    };
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error);
  }

  if (config.wabaId) {
    try {
      const list = await graph<{ data: { name: string; status: string; category: string }[] }>(
        `${config.wabaId}/message_templates?fields=name,status,category&limit=100`,
        config.accessToken,
      );
      base.templates = list.data.filter((t) => t.name !== "hello_world").sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      base.templatesError = error instanceof Error ? error.message : String(error);
    }
  }
  return base;
}

/** Both numbers, read live from Meta, plus how sending has gone lately from our own ledger. */
export async function whatsappConnector() {
  const [numbers, [traffic], errors] = await Promise.all([
    Promise.all(PROFILES.map(health)),
    db.execute(sql`
      select
        count(*) filter (where queued_at > now() - interval '24 hours')::int as "sends24",
        count(*) filter (where queued_at > now() - interval '24 hours' and status = 'failed')::int as "failed24",
        count(*) filter (where queued_at > now() - interval '7 days')::int as "sends7",
        count(*) filter (where queued_at > now() - interval '7 days' and status = 'failed')::int as "failed7",
        count(*) filter (where queued_at > now() - interval '7 days' and status in ('delivered', 'read'))::int as "delivered7",
        (select count(*)::int from messages where direction = 'inbound' and created_at > now() - interval '24 hours') as "inbound24",
        (select count(*)::int from unmatched_inbound where created_at > now() - interval '7 days') as "unmatched7",
        (select max(created_at) from messages where direction = 'inbound') as "lastInbound"
      from sends where channel = 'whatsapp'
    `) as unknown as Promise<
      {
        sends24: number;
        failed24: number;
        sends7: number;
        failed7: number;
        delivered7: number;
        inbound24: number;
        unmatched7: number;
        lastInbound: Date | null;
      }[]
    >,
    db.execute(sql`
      select error_code as code, error_title as title, count(*)::int as n
      from sends where status = 'failed' and queued_at > now() - interval '7 days'
      group by error_code, error_title order by n desc limit 8
    `) as unknown as Promise<{ code: string | null; title: string | null; n: number }[]>,
  ]);
  return { numbers, traffic, errors };
}
