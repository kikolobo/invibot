import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * What a confirmation still owes a guest who was first asked their
 * companion's name: the details message and the card and pass (`text`), or
 * only the card and pass when the assistant already confirmed in its own
 * words (`card`). Kept in the conversation's scratchpad, so it survives
 * between the question and the answer without a column of its own.
 */
export type Owed = "text" | "card";

export async function oweDetails(guestId: string, owed: Owed) {
  await db.execute(sql`
    update conversations
    set state = coalesce(state, '{}'::jsonb) || jsonb_build_object('detailsOwed', ${owed}::text)
    where guest_id = ${guestId} and channel = 'whatsapp'
  `);
}

/**
 * Takes what is owed, clearing it in the same statement — so two messages
 * arriving together cannot both deliver it. Null when nothing is owed.
 */
export async function takeOwedDetails(guestId: string): Promise<Owed | null> {
  const rows = (await db.execute(sql`
    with owed as (
      select id, state->>'detailsOwed' as owed from conversations
      where guest_id = ${guestId} and channel = 'whatsapp' and state ? 'detailsOwed'
      for update
    )
    update conversations c set state = c.state - 'detailsOwed'
    from owed where c.id = owed.id
    returning owed.owed
  `)) as unknown as { owed: string }[];
  const value = rows[0]?.owed;
  return value === "text" || value === "card" ? value : null;
}
