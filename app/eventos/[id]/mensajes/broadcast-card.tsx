"use client";

import { useState, useTransition } from "react";
import { deleteBroadcast, retireBroadcast, updateBroadcast } from "@/lib/broadcasts/actions";
import {
  BODY_MAX,
  exclusionLabels,
  statusLabels,
  TITLE_MAX,
  type BroadcastStatus,
  type ExclusionReason,
  type RecipientRoute,
  type RecipientStatus,
} from "@/lib/broadcasts/labels";
import { Input, Textarea } from "@/components/ui/field";
import { buttonStyles } from "../hechos/buttons";

export type RecipientView = {
  name: string;
  route: RecipientRoute;
  status: RecipientStatus;
  sendStatus: string | null;
  opened: boolean;
  error: string | null;
};

export type BroadcastView = {
  id: string;
  title: string;
  body: string;
  status: BroadcastStatus;
  audience: string;
  author: string | null;
  when: string;
  excluded: Partial<Record<ExclusionReason, number>>;
  stats: {
    total: number;
    free: number;
    template: number;
    held: number;
    failed: number;
    delivered: number;
    read: number;
    opened: number;
  };
  recipients: RecipientView[];
};

const statusTone: Record<BroadcastStatus, string> = {
  scheduled: "bg-amber-100 text-amber-900",
  sending: "bg-blue-100 text-blue-900",
  sent: "bg-emerald-100 text-emerald-900",
  retired: "bg-stone-200 text-stone-700",
};

/** How far one person's copy got, in the organizer's words. */
function recipientState(r: RecipientView): string {
  if (r.status === "held") return "En espera: plantilla en revisión";
  if (r.status === "failed" || r.sendStatus === "failed") return "Falló";
  if (r.sendStatus === "read") return "Leído";
  if (r.sendStatus === "delivered") return "Entregado";
  return "Enviado";
}

/**
 * One message in the history.
 *
 * What can be done depends on whether it left: a scheduled message can still
 * be edited or taken out of the queue; one already on people's phones can
 * only be retired.
 */
export function BroadcastCard({
  eventId,
  view,
  editable,
}: {
  eventId: string;
  view: BroadcastView;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<"delete" | "retire" | null>(null);
  const [title, setTitle] = useState(view.title);
  const [body, setBody] = useState(view.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      const result = await action();
      setError(result.error ?? null);
      if (!result.error) after?.();
    });

  const s = view.stats;
  const sent = s.total - s.held;
  const excluded = Object.entries(view.excluded).filter(([, n]) => n && n > 0) as [
    ExclusionReason,
    number,
  ][];

  return (
    <li className="rounded-xl border border-line bg-paper-deep p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg leading-snug text-ink">{view.title}</p>
          <p className="mt-1 text-[0.82rem] text-ink-muted">
            {view.when} · {view.audience}
            {view.author && ` · por ${view.author}`}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.75rem] font-medium ${statusTone[view.status]}`}
        >
          {statusLabels[view.status]}
        </span>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <Input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
          <Textarea value={body} rows={6} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} />
        </div>
      ) : (
        <details className="mt-3">
          <summary className="cursor-pointer text-[0.85rem] text-accent">Ver mensaje</summary>
          <p className="mt-2 whitespace-pre-line text-[0.9rem] leading-relaxed text-ink-soft">{view.body}</p>
        </details>
      )}

      {view.status !== "scheduled" && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[0.85rem] sm:grid-cols-4">
          <Stat label="Destinatarios" value={s.total} />
          <Stat label="Entregados" value={s.delivered} of={sent} />
          <Stat label="Leídos" value={s.read} of={sent} />
          <Stat label="Abrieron el mensaje completo" value={s.opened} of={sent} />
          {s.template > 0 && <Stat label="Por plantilla" value={s.template} />}
          {s.free > 0 && <Stat label="Sin costo" value={s.free} />}
          {s.held > 0 && <Stat label="En espera" value={s.held} tone="warn" />}
          {s.failed > 0 && <Stat label="Fallaron" value={s.failed} tone="danger" />}
        </dl>
      )}

      {excluded.length > 0 && (
        <p className="mt-3 text-[0.8rem] text-ink-muted">
          {excluded.map(([reason, n]) => exclusionLabels[reason](n)).join(" · ")}.
        </p>
      )}

      {view.recipients.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[0.85rem] text-accent">
            A quiénes ({view.recipients.length})
          </summary>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-paper text-[0.85rem]">
            {view.recipients.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                <span className="text-ink">{r.name}</span>
                <span className="text-ink-muted" title={r.error ?? undefined}>
                  {r.route === "free" ? "Completo" : "Plantilla"} · {recipientState(r)}
                  {r.route === "template" && r.status === "sent" && (r.opened ? " · Abrió el mensaje" : " · Sólo el título")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && <p className="mt-3 text-[0.85rem] text-danger">{error}</p>}

      {editable && view.status === "scheduled" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                disabled={pending}
                className={buttonStyles.save}
                onClick={() => run(() => updateBroadcast(eventId, view.id, { title, body }), () => setEditing(false))}
              >
                Guardar
              </button>
              <button
                type="button"
                disabled={pending}
                className={buttonStyles.cancel}
                onClick={() => {
                  setTitle(view.title);
                  setBody(view.body);
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
            </>
          ) : confirming === "delete" ? (
            <>
              <span className="text-[0.85rem] text-ink-soft">¿Quitarlo? No se enviará.</span>
              <button
                type="button"
                disabled={pending}
                className={buttonStyles.discard}
                onClick={() => run(() => deleteBroadcast(eventId, view.id))}
              >
                Quitar
              </button>
              <button type="button" className={buttonStyles.cancel} onClick={() => setConfirming(null)}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button type="button" className={buttonStyles.cancel} onClick={() => setEditing(true)}>
                Editar
              </button>
              <button type="button" className={buttonStyles.cancel} onClick={() => setConfirming("delete")}>
                Quitar de la cola
              </button>
            </>
          )}
        </div>
      )}

      {editable && (view.status === "sent" || view.status === "sending") && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirming === "retire" ? (
            <>
              <span className="text-[0.85rem] text-ink-soft">
                ¿Retirarlo? Quien no lo haya abierto ya no podrá leerlo, y el asistente deja de
                mencionarlo.
              </span>
              <button
                type="button"
                disabled={pending}
                className={buttonStyles.discard}
                onClick={() => run(() => retireBroadcast(eventId, view.id), () => setConfirming(null))}
              >
                Retirar
              </button>
              <button type="button" className={buttonStyles.cancel} onClick={() => setConfirming(null)}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className={buttonStyles.cancel} onClick={() => setConfirming("retire")}>
              Retirar
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  of,
  tone,
}: {
  label: string;
  value: number;
  of?: number;
  tone?: "warn" | "danger";
}) {
  const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-amber-700" : "text-ink";
  return (
    <div>
      <dt className="text-[0.75rem] text-ink-muted">{label}</dt>
      <dd className={`font-medium ${color}`}>
        {value}
        {of !== undefined && of > 0 && <span className="font-normal text-ink-muted"> / {of}</span>}
      </dd>
    </div>
  );
}
