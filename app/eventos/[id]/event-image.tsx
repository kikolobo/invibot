"use client";

import { useActionState, useState, useTransition } from "react";
import type { ReactNode } from "react";
import type { ActionState } from "@/lib/events/actions";

type Action = (
  eventId: string,
  prev: ActionState & { ok?: string },
  formData: FormData,
) => Promise<ActionState & { ok?: string }>;

/**
 * One uploaded image on an event.
 *
 * Shared by the two of them because they behave identically and mean opposite
 * things: the invitation goes privately to someone who has confirmed, the
 * teaser goes publicly to whoever a shared link reaches. The copy is passed in
 * so that difference is stated where the organizer is standing, not inferred
 * from a field name.
 */
export function EventImage({
  eventId,
  field,
  endpoint,
  title,
  intro,
  notice,
  footnote,
  hasImage,
  bytes,
  uploadedAt,
  storageReady,
  upload,
  remove,
}: {
  eventId: string;
  /** The form field, and the R2 kind behind it. */
  field: "card" | "teaser";
  /** Where the organizer's own preview is streamed from. */
  endpoint: string;
  title: string;
  intro: string;
  /** Shown before the picker — for anything the organizer must know first. */
  notice?: ReactNode;
  /** Shown under it — for anything that only matters once. */
  footnote?: ReactNode;
  hasImage: boolean;
  bytes: number | null;
  uploadedAt: Date | null;
  storageReady: boolean;
  upload: Action;
  remove: (eventId: string) => Promise<ActionState & { ok?: string }>;
}) {
  const [state, formAction, pending] = useActionState<ActionState & { ok?: string }, FormData>(
    upload.bind(null, eventId),
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

  // Busts the browser cache when an image is replaced at the same URL.
  const src = `${endpoint}?v=${uploadedAt?.getTime() ?? 0}`;

  return (
    // No margin of its own: these sit side by side now, and the row places them.
    <section>
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <p className="mt-2 text-[0.9rem] leading-relaxed text-ink-muted">{intro}</p>

      {notice}

      {!storageReady && (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-paper-deep p-4 text-[0.88rem] text-ink-muted">
          El almacenamiento de imágenes todavía no está configurado en este entorno.
        </p>
      )}

      {hasImage && (
        <div className="mt-5 flex flex-wrap items-start gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={title} className="w-48 rounded-xl border border-line bg-white" />
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
                  const result = await remove(eventId);
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
              name={field}
              accept="image/jpeg,image/png"
              disabled={!storageReady || pending}
              onChange={(e) => setChosen(e.target.files?.[0]?.name ?? null)}
              className="sr-only"
            />
            {hasImage ? "Elegir otra imagen" : "Elegir imagen"}
          </label>
          {chosen && <span className="text-[0.85rem] text-ink-soft">{chosen}</span>}
        </div>
        <p className="mt-2 text-[0.82rem] text-ink-muted">JPG o PNG, hasta 5 MB.</p>

        {footnote}

        {state.error && <p className="mt-3 text-[0.88rem] text-accent">{state.error}</p>}
        {state.ok && <p className="mt-3 text-[0.88rem] text-ink-soft">{state.ok}</p>}

        {chosen && (
          <button
            type="submit"
            disabled={!storageReady || pending}
            className="mt-4 rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
          >
            {pending ? "Subiendo…" : hasImage ? "Reemplazar" : "Subir"}
          </button>
        )}
      </form>
    </section>
  );
}
