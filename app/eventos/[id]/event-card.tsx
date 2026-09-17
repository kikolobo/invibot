"use client";

import { useActionState, useState, useTransition } from "react";
import { uploadCard, removeCard } from "@/lib/events/card";
import type { ActionState } from "@/lib/events/actions";

/**
 * The invitation card, uploaded once per event.
 *
 * Sent as its own message right after a guest confirms, inside the 24-hour
 * window their own reply opens — which is why it costs nothing and why it has
 * to exist *before* invitations go out. A card uploaded afterwards can only
 * reach guests whose window is still open.
 */
export function EventCard({
  eventId,
  hasCard,
  bytes,
  uploadedAt,
  storageReady,
  invitedCount,
}: {
  eventId: string;
  hasCard: boolean;
  bytes: number | null;
  uploadedAt: Date | null;
  storageReady: boolean;
  invitedCount: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState & { ok?: string }, FormData>(
    uploadCard.bind(null, eventId),
    {},
  );
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  // The native file input renders "Choose File / No file chosen" in the
  // browser's own language and cannot be relabelled, so it is hidden behind a
  // label and the chosen name is shown by us.
  const [chosen, setChosen] = useState<string | null>(null);

  // Cleared during render rather than in an effect: a successful upload has
  // already replaced what the picker was holding, and an effect here would
  // render the stale filename once before wiping it.
  const [seenOk, setSeenOk] = useState(state.ok);
  if (state.ok !== seenOk) {
    setSeenOk(state.ok);
    if (state.ok) setChosen(null);
  }

  // Busts the browser cache when a card is replaced at the same URL.
  const src = `/api/eventos/${eventId}/card?v=${uploadedAt?.getTime() ?? 0}`;

  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl text-ink">La invitación</h2>
      <p className="mt-2 text-[0.9rem] leading-relaxed text-ink-muted">
        Sube la imagen de tu invitación. Se la mandamos a cada invitado justo
        después de que confirme, sin costo extra.
      </p>

      {!storageReady && (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-paper-deep p-4 text-[0.88rem] text-ink-muted">
          El almacenamiento de imágenes todavía no está configurado en este entorno.
        </p>
      )}

      {hasCard && (
        <div className="mt-5 flex flex-wrap items-start gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Invitación"
            className="w-48 rounded-xl border border-line bg-white"
          />
          <div className="text-[0.85rem] text-ink-muted">
            {bytes !== null && <p>{(bytes / 1024).toFixed(0)} KB</p>}
            {uploadedAt && (
              <p className="mt-1">
                Subida el{" "}
                {new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(
                  uploadedAt,
                )}
              </p>
            )}
            <button
              type="button"
              disabled={removing}
              onClick={() =>
                startRemoving(async () => {
                  const result = await removeCard(eventId);
                  setRemoveError(result.error ?? null);
                })
              }
              className="mt-3 text-accent hover:underline disabled:opacity-50"
            >
              {removing ? "Quitando…" : "Quitar"}
            </button>
            {removeError && <p className="mt-2 text-accent">{removeError}</p>}
          </div>
        </div>
      )}

      <form action={formAction} className="mt-5">
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={`inline-flex items-center rounded-full border border-line px-4 py-2 text-[0.85rem] transition-colors ${
              !storageReady || pending
                ? "cursor-not-allowed text-ink-muted opacity-50"
                : "cursor-pointer text-ink-soft hover:border-accent hover:text-accent"
            }`}
          >
            <input
              type="file"
              name="card"
              accept="image/jpeg,image/png"
              disabled={!storageReady || pending}
              onChange={(e) => setChosen(e.target.files?.[0]?.name ?? null)}
              className="sr-only"
            />
            {hasCard ? "Elegir otra imagen" : "Elegir imagen"}
          </label>
          {chosen && <span className="text-[0.85rem] text-ink-soft">{chosen}</span>}
        </div>
        <p className="mt-2 text-[0.82rem] text-ink-muted">JPG o PNG, hasta 5 MB.</p>

        {invitedCount > 0 && !hasCard && (
          <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-muted">
            Ya enviaste {invitedCount} {invitedCount === 1 ? "invitación" : "invitaciones"}.
            Quien haya confirmado hace más de un día ya no puede recibir la imagen — WhatsApp
            solo nos deja mandarla dentro de las 24 horas siguientes a su mensaje.
          </p>
        )}

        {state.error && <p className="mt-3 text-[0.88rem] text-accent">{state.error}</p>}
        {state.ok && <p className="mt-3 text-[0.88rem] text-ink-soft">{state.ok}</p>}

        {chosen && (
          <button
            type="submit"
            disabled={!storageReady || pending}
            className="mt-4 rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
          >
            {pending ? "Subiendo…" : hasCard ? "Reemplazar" : "Subir"}
          </button>
        )}
      </form>
    </section>
  );
}
