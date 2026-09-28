"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createBroadcast,
  previewBroadcast,
  sendTestBroadcast,
  type BroadcastPreview,
} from "@/lib/broadcasts/actions";
import {
  audienceLabels,
  audienceOrder,
  BODY_MAX,
  exclusionLabels,
  TITLE_MAX,
  type Audience,
  type AudienceKind,
  type ExclusionReason,
} from "@/lib/broadcasts/labels";
import { renderTemplate } from "@/lib/whatsapp/templates";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Bubble, Phone } from "../chat-bubble";
import { buttonStyles } from "../hechos/buttons";
import { WhatsAppText } from "./whatsapp-text";

/**
 * Writing a message, and the confirmation before it goes out.
 *
 * The confirmation is not a formality: part of this can be paid, none of it
 * can be recalled, and the audience is read fresh from the guest list — so it
 * shows exactly who gets it, how, who is left out and why, and both versions
 * of the message, before the button that sends it is reachable.
 */

type Props = {
  eventId: string;
  eventName: string;
  /** "hoy a las 11:00 a.m.", worked out on the server in the event's zone. */
  cronLabel: string;
  groups: { id: string; name: string }[];
  people: { id: string; name: string; group: string | null }[];
  /** Called once it is sent or scheduled, with what to tell the organizer. */
  onSent: (notice: string) => void;
};

export function Composer({ eventId, eventName, cronLabel, groups, people, onSent }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<AudienceKind>("not_declined");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [guestIds, setGuestIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [when, setWhen] = useState<"now" | "cron">("now");

  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const audience: Audience =
    kind === "groups"
      ? { kind, ids: groupIds }
      : kind === "guests"
        ? { kind, ids: guestIds }
        : { kind };

  const draft = { title, body };
  const ready = title.trim().length > 0 && body.trim().length > 0;

  const visiblePeople = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return people;
    return people.filter(
      (person) =>
        person.name.toLowerCase().includes(needle) ||
        person.group?.toLowerCase().includes(needle),
    );
  }, [people, search]);

  // Any change to what is being sent invalidates a confirmation already on screen.
  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPreview(null);
    setNotice(null);
  };

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  function review() {
    setError(null);
    setNotice(null);
    start(async () => {
      const result = await previewBroadcast(eventId, audience);
      if (result.error) setError(result.error);
      else setPreview(result);
    });
  }

  function test() {
    setError(null);
    setNotice(null);
    start(async () => {
      const result = await sendTestBroadcast(eventId, draft);
      if (result.error) setError(result.error);
      else setNotice(`Te mandamos la prueba a ${result.sentTo}. Toca «Leer mensaje» para ver el resto.`);
    });
  }

  function send() {
    setError(null);
    start(async () => {
      const result = await createBroadcast(eventId, draft, audience, when);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSent(
        when === "now"
          ? "Listo, el mensaje va saliendo. Recarga la página para ver cómo avanzan los números."
          : `Listo, el mensaje sale ${cronLabel}. Hasta entonces puedes editarlo o quitarlo.`,
      );
      setTitle("");
      setBody("");
      setGroupIds([]);
      setGuestIds([]);
      setPreview(null);
    });
  }

  const reached = preview?.names?.length ?? 0;
  const excluded = Object.entries(preview?.excluded ?? {}).filter(([, n]) => n && n > 0) as [
    ExclusionReason,
    number,
  ][];

  return (
    <div className="rounded-xl border border-line bg-paper-deep p-5 sm:p-6">
      <div className="space-y-5">
        <Field
          label="Título"
          help="Es lo único que ve quien recibe la plantilla, antes de tocar «Leer mensaje»."
          required
        >
          <Input
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => edit(setTitle)(e.target.value)}
            placeholder="Cambio de horario de la ceremonia"
          />
          <p className="text-right text-[0.75rem] text-ink-muted">
            {title.length}/{TITLE_MAX}
          </p>
        </Field>

        <Field label="Mensaje" required>
          <Textarea
            value={body}
            rows={7}
            maxLength={BODY_MAX}
            onChange={(e) => edit(setBody)(e.target.value)}
            placeholder="Escribe el mensaje completo, como se lo dirías a tus invitados."
          />
          <p className="text-right text-[0.75rem] text-ink-muted">
            {body.length}/{BODY_MAX}
          </p>
        </Field>

        <Field label="Enviar a" required>
          <div className="flex flex-wrap gap-2">
            {audienceOrder.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => edit(setKind)(option)}
                aria-pressed={kind === option}
                className={`rounded-full border px-3.5 py-1.5 text-[0.85rem] transition-colors ${
                  kind === option
                    ? "border-accent bg-accent/10 text-ink"
                    : "border-line text-ink-soft hover:border-accent/50"
                }`}
              >
                {audienceLabels[option]}
              </button>
            ))}
          </div>

          {kind === "groups" &&
            (groups.length === 0 ? (
              <p className="mt-3 text-[0.85rem] text-ink-muted">Este evento todavía no tiene grupos.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                {groups.map((group) => (
                  <label key={group.id} className="flex items-center gap-2 text-[0.9rem] text-ink">
                    <input
                      type="checkbox"
                      checked={groupIds.includes(group.id)}
                      onChange={() => edit(setGroupIds)(toggle(groupIds, group.id))}
                    />
                    {group.name}
                  </label>
                ))}
              </div>
            ))}

          {kind === "guests" && (
            <div className="mt-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o grupo…"
              />
              <p className="mt-2 text-[0.8rem] text-ink-muted">
                {guestIds.length === 1 ? "1 persona elegida" : `${guestIds.length} personas elegidas`}
              </p>
              <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line bg-paper">
                {visiblePeople.map((person) => (
                  <li key={person.id} className="border-b border-line last:border-0">
                    <label className="flex items-center gap-2.5 px-3 py-2 text-[0.9rem] text-ink">
                      <input
                        type="checkbox"
                        checked={guestIds.includes(person.id)}
                        onChange={() => edit(setGuestIds)(toggle(guestIds, person.id))}
                      />
                      <span className="min-w-0 flex-1 truncate">{person.name}</span>
                      {person.group && (
                        <span className="shrink-0 text-[0.78rem] text-ink-muted">{person.group}</span>
                      )}
                    </label>
                  </li>
                ))}
                {visiblePeople.length === 0 && (
                  <li className="px-3 py-3 text-[0.85rem] text-ink-muted">Nadie coincide.</li>
                )}
              </ul>
            </div>
          )}
        </Field>

        <Field label="Cuándo" required>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-[0.9rem] text-ink">
              <input
                type="radio"
                name="when"
                checked={when === "now"}
                onChange={() => edit(setWhen)("now")}
              />
              Enviar ahora
            </label>
            <label className="flex items-center gap-2 text-[0.9rem] text-ink">
              <input
                type="radio"
                name="when"
                checked={when === "cron"}
                onChange={() => edit(setWhen)("cron")}
              />
              Enviar {cronLabel}
            </label>
          </div>
        </Field>
      </div>

      {error && <p className="mt-5 text-[0.9rem] text-danger">{error}</p>}
      {notice && <p className="mt-5 text-[0.9rem] text-ink-soft">{notice}</p>}

      {!preview && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={review}
            disabled={!ready || pending}
            className="rounded-full bg-action px-5 py-2 text-[0.9rem] text-ink-onaction transition-opacity disabled:opacity-50"
          >
            {pending ? "Un momento…" : "Revisar y enviar"}
          </button>
          <button
            type="button"
            onClick={test}
            disabled={!ready || pending}
            className={buttonStyles.cancel}
          >
            Enviarme una prueba
          </button>
        </div>
      )}

      {preview && (
        <div className="mt-6 border-t border-line pt-5">
          {reached === 0 ? (
            <p className="text-[0.95rem] text-ink">
              Nadie de los que elegiste puede recibir el mensaje ahora.
            </p>
          ) : (
            <>
              <p className="font-display text-xl text-ink">
                {reached === 1 ? "Lo recibe 1 persona" : `Lo reciben ${reached} personas`}
                {when === "cron" && <span className="text-ink-muted"> · {cronLabel}</span>}
              </p>
              <ul className="mt-2 space-y-1 text-[0.88rem] leading-relaxed text-ink-soft">
                {(preview.free ?? 0) > 0 && (
                  <li>
                    <span className="text-ink">{preview.free}</span> completo, sin costo: tienen la
                    conversación abierta.
                  </li>
                )}
                {(preview.template ?? 0) > 0 && (
                  <li>
                    <span className="text-ink">{preview.template}</span> con la plantilla, que tiene
                    costo. El mensaje completo les llega al tocar «Leer mensaje».
                  </li>
                )}
                {(preview.held ?? 0) > 0 && (
                  <li className="text-danger">
                    <span className="font-medium">{preview.held}</span> quedan en espera: Meta todavía
                    está revisando la plantilla. Se les envía solo en cuanto la aprueben.
                  </li>
                )}
              </ul>
              {when === "cron" && (
                <p className="mt-2 text-[0.82rem] text-ink-muted">
                  La lista se vuelve a calcular al enviarse: si alguien cambia su respuesta antes,
                  se ajusta.
                </p>
              )}
              <details className="mt-3">
                <summary className="cursor-pointer text-[0.85rem] text-accent">Ver quiénes</summary>
                <p className="mt-2 text-[0.85rem] leading-relaxed text-ink-soft">
                  {preview.names?.join(", ")}
                </p>
              </details>
            </>
          )}

          {excluded.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow">No se les envía</p>
              <ul className="mt-2 space-y-1 text-[0.88rem] text-ink-soft">
                {excluded.map(([reason, n]) => (
                  <li key={reason}>{exclusionLabels[reason](n)}.</li>
                ))}
              </ul>
            </div>
          )}

          {reached > 0 && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {(preview.template ?? 0) + (preview.held ?? 0) > 0 && (
                <div>
                  <p className="eyebrow">Con la conversación cerrada</p>
                  <div className="mt-2">
                    <TemplatePreview
                      eventName={eventName}
                      name={preview.sampleName ?? "María"}
                      title={title}
                    />
                  </div>
                </div>
              )}
              <div>
                <p className="eyebrow">
                  {(preview.template ?? 0) + (preview.held ?? 0) > 0
                    ? "Al tocar «Leer mensaje», o con la conversación abierta"
                    : "Así les llega"}
                </p>
                <div className="mt-2">
                  <Phone title={eventName}>
                    <Bubble from="them">
                      <WhatsAppText text={`*${title.trim()}*\n\n${body.trim()}`} />
                    </Bubble>
                  </Phone>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {reached > 0 && (
              <button
                type="button"
                onClick={send}
                disabled={pending}
                className="rounded-full bg-action px-5 py-2 text-[0.9rem] text-ink-onaction transition-opacity disabled:opacity-50"
              >
                {pending
                  ? "Enviando…"
                  : when === "now"
                    ? reached === 1
                      ? "Enviar a 1 persona"
                      : `Enviar a ${reached} personas`
                    : `Programar para ${cronLabel}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={pending}
              className="text-[0.9rem] text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              Seguir editando
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The template as a guest with a closed window reads it, from the same definition sent to Meta. */
function TemplatePreview({ eventName, name, title }: { eventName: string; name: string; title: string }) {
  const rendered = renderTemplate("mensaje_organizador", [name, eventName, title.trim()]);
  return (
    <Phone title={eventName}>
      <Bubble from="them">
        <WhatsAppText text={rendered.body} />
        {rendered.footer && <p className="mt-2 text-[0.72rem] text-black/45">{rendered.footer}</p>}
        <div className="-mx-2.5 -mb-1 mt-2 border-t border-black/10">
          {rendered.buttons.map((label) => (
            <span
              key={label}
              className="block px-2 py-1.5 text-center text-[0.8rem] text-[#00a5f4]"
            >
              {label}
            </span>
          ))}
        </div>
      </Bubble>
    </Phone>
  );
}
