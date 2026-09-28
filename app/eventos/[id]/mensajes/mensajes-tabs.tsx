"use client";

import { useState, type ComponentProps } from "react";
import { statusLabels, type BroadcastStatus } from "@/lib/broadcasts/labels";
import { Composer } from "./composer";
import { BroadcastCard, type BroadcastView } from "./broadcast-card";

type Tab = "list" | "compose";

/** The filters, in the order a message moves through them. "Enviando" rides with "Enviado". */
type Filter = "all" | "draft" | "scheduled" | "sent" | "retired";

const filterOrder: Filter[] = ["all", "draft", "scheduled", "sent", "retired"];

const filterLabels: Record<Filter, string> = {
  all: "Todos",
  draft: "Borradores",
  scheduled: "Programados",
  sent: "Enviados",
  retired: "Retirados",
};

const inFilter = (status: BroadcastStatus, filter: Filter) =>
  filter === "all" || status === filter || (filter === "sent" && status === "sending");

/**
 * The messages and the composer, as two tabs — the same strip Detalles uses.
 * The list comes first: most visits are to see how a message did, or to pick
 * a draft back up.
 *
 * Both stay mounted and the inactive one is hidden, so a message half-written
 * survives a look at the list. Opening a draft or a scheduled message swaps the
 * composer for one filled with it; saving or sending brings the list back.
 */
export function MensajesTabs({
  eventId,
  composer,
  views,
  editable,
}: {
  eventId: string;
  /** Null on an archived event, which keeps its messages but sends nothing. */
  composer: Omit<ComponentProps<typeof Composer>, "onSent" | "initial"> | null;
  views: BroadcastView[];
  editable: boolean;
}) {
  const [active, setActive] = useState<Tab>("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<BroadcastView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shown = views.filter((view) => inFilter(view.status, filter));
  const count = (f: Filter) => views.filter((view) => inFilter(view.status, f)).length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "list", label: "Mensajes", badge: views.length },
    ...(composer
      ? [{ id: "compose" as const, label: editing ? "Editar mensaje" : "Nuevo mensaje" }]
      : []),
  ];

  return (
    <div className="mt-8">
      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
        <div role="tablist" className="flex gap-1 border-b border-line">
          {tabs.map((tab) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(tab.id)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-[0.9rem] transition-colors ${
                  selected
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-muted hover:text-ink-soft"
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-2 text-[0.75rem] text-ink-muted">{tab.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <section hidden={active !== "list"} className="mt-6">
        {notice && (
          <p className="mb-4 rounded-lg border border-accent/30 bg-action/5 px-4 py-3 text-[0.9rem] text-ink-soft">
            {notice}
          </p>
        )}

        {views.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {filterOrder
              .filter((f) => f === "all" || count(f) > 0)
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`rounded-full border px-3 py-1 text-[0.82rem] transition-colors ${
                    filter === f
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-line text-ink-soft hover:border-accent/50"
                  }`}
                >
                  {filterLabels[f]}
                  <span className="ml-1.5 text-ink-muted">{count(f)}</span>
                </button>
              ))}
          </div>
        )}

        {views.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-paper-deep p-6 text-center text-ink-muted">
            Todavía no hay mensajes.{" "}
            {composer && (
              <button type="button" className="text-accent hover:underline" onClick={() => setActive("compose")}>
                Escribe el primero
              </button>
            )}
          </p>
        ) : shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-paper-deep p-6 text-center text-ink-muted">
            No hay mensajes {filter === "all" ? "" : `con estado «${statusLabels[filter]}»`}.
          </p>
        ) : (
          <ul className="space-y-4">
            {shown.map((view) => (
              <BroadcastCard
                key={view.id}
                eventId={eventId}
                view={view}
                editable={editable}
                onEdit={(chosen) => {
                  setEditing(chosen);
                  setNotice(null);
                  setActive("compose");
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {composer && (
        <section hidden={active !== "compose"} className="mt-8">
          {editing && (
            <p className="mb-4 text-[0.85rem] text-ink-soft">
              Estás editando{" "}
              {editing.status === "draft" ? "un borrador" : "un mensaje programado"}.{" "}
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => setEditing(null)}
              >
                Empezar uno nuevo
              </button>
            </p>
          )}
          <Composer
            // A fresh composer per message: its fields start from whatever it opens.
            key={editing?.id ?? "new"}
            {...composer}
            initial={
              editing
                ? {
                    id: editing.id,
                    title: editing.title,
                    body: editing.body,
                    audience: editing.audienceValue,
                    scheduled: editing.status === "scheduled",
                  }
                : undefined
            }
            onSent={(message) => {
              setNotice(message);
              setEditing(null);
              setFilter("all");
              setActive("list");
            }}
          />
        </section>
      )}
    </div>
  );
}
