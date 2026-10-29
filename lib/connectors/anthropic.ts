import { sql } from "drizzle-orm";
import { db } from "@/db";
import { MODEL, anthropicFromEnv } from "@/lib/agent/run";

/**
 * The assistant's connection and what it costs. The live check is a model
 * lookup — it proves the key works and the model exists without spending a
 * single token.
 */
export async function anthropicConnector() {
  const client = anthropicFromEnv();
  let check: { ok: true; name: string } | { ok: false; error: string } | null = null;
  if (client) {
    try {
      const model = await client.models.retrieve(MODEL);
      check = { ok: true, name: model.display_name };
    } catch (error) {
      check = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const [[totals], byDay, bySource, byModel] = await Promise.all([
    db.execute(sql`
      select
        coalesce(sum(cost_micro_usd) filter (where created_at > now() - interval '24 hours'), 0)::bigint::float8 as "cost24",
        coalesce(sum(cost_micro_usd) filter (where created_at > now() - interval '30 days'), 0)::bigint::float8 as "cost30",
        count(*) filter (where created_at > now() - interval '30 days')::int as "calls30",
        coalesce(sum(input_tokens + cache_read_tokens + cache_write_tokens), 0)::bigint::float8 as prompt,
        coalesce(sum(cache_read_tokens), 0)::bigint::float8 as "cacheRead",
        coalesce(sum(output_tokens), 0)::bigint::float8 as output,
        coalesce(avg(cost_micro_usd) filter (where source = 'guest_reply'), 0)::float8 as "avgReply"
      from ai_usage
    `) as unknown as Promise<
      { cost24: number; cost30: number; calls30: number; prompt: number; cacheRead: number; output: number; avgReply: number }[]
    >,
    db.execute(sql`
      select to_char(date_trunc('day', created_at at time zone 'America/Mexico_City'), 'YYYY-MM-DD') as day,
        count(*)::int as calls, coalesce(sum(cost_micro_usd), 0)::bigint::float8 as cost
      from ai_usage where created_at > now() - interval '14 days'
      group by 1 order by 1 desc
    `) as unknown as Promise<{ day: string; calls: number; cost: number }[]>,
    db.execute(sql`
      select source, count(*)::int as calls, coalesce(sum(cost_micro_usd), 0)::bigint::float8 as cost
      from ai_usage group by source order by cost desc
    `) as unknown as Promise<{ source: string; calls: number; cost: number }[]>,
    db.execute(sql`
      select model, count(*)::int as calls, coalesce(sum(cost_micro_usd), 0)::bigint::float8 as cost
      from ai_usage group by model order by cost desc
    `) as unknown as Promise<{ model: string; calls: number; cost: number }[]>,
  ]);

  return { configured: Boolean(client), model: MODEL, check, totals, byDay, bySource, byModel };
}
