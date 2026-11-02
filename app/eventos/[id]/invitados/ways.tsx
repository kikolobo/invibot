import type { ReactNode } from "react";
import type { WaysToAdd } from "@/lib/guests/ways";
import { AutoRegister } from "../auto-register";
import { ImportGuests } from "./import-guests";

/**
 * The ways guests get onto a list, explained once and shown in two places:
 * the new-event wizard's last step and the Invitados tabs. One wording, so a
 * host who read it in one place recognises it in the other.
 */

export function Way({ title, note, children }: { title: string; note: ReactNode; children?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-paper-deep p-5">
      <p className="font-display text-lg text-ink">{title}</p>
      <div className="mt-1 text-[0.88rem] leading-relaxed text-ink-muted">{note}</div>
      {children}
    </section>
  );
}

export function RegistrationWay({
  eventId,
  registration,
  canToggle,
}: {
  eventId: string;
  registration: WaysToAdd["registration"];
  /** Turning the link on is the event's setting; a guest manager only reads it. */
  canToggle: boolean;
}) {
  if (canToggle) {
    return (
      <AutoRegister
        eventId={eventId}
        enabled={registration.enabled}
        link={registration.link}
        pendingCount={registration.pendingCount}
        className=""
      />
    );
  }
  return (
    <Way
      title="Autorregistro con liga de WhatsApp"
      note={
        registration.enabled
          ? "Está activo: quien abre la liga se registra solo y espera aprobación. Sólo el dueño o un admin del evento puede apagarlo."
          : "Está apagado. Sólo el dueño o un admin del evento puede activarlo."
      }
    />
  );
}

export function ImportWay({ eventId }: { eventId: string }) {
  return (
    <Way
      title="Importar una lista"
      note={
        <>
          Si ya tienes a tus invitados en Excel, Numbers o Google Sheets. Baja la plantilla, llénala con nombre y
          WhatsApp (lo demás es opcional), guárdala como CSV y súbela aquí. También puedes copiar y pegar las
          columnas directo de tu hoja.
        </>
      }
    >
      <a
        href="/plantilla-invitados.csv"
        download
        className="mt-3 inline-block rounded-full border border-line px-4 py-2 text-[0.85rem] text-ink-soft transition-colors hover:border-accent hover:text-accent"
      >
        ↓ Bajar plantilla
      </a>
      <div className="mt-4">
        <ImportGuests eventId={eventId} />
      </div>
    </Way>
  );
}

export function ContactsWay({ contacts }: { contacts: WaysToAdd["contacts"] }) {
  return (
    <Way
      title="Compartir contactos por WhatsApp"
      note={
        <>
          Para quien se te ocurra en el camino, sin abrir la app ni teclear números.
          {!contacts.ownPhone && (
            <span className="mt-1 block text-ink">
              Primero agrega tu WhatsApp en «Mi cuenta»: sólo aceptamos contactos de los organizadores.
            </span>
          )}
        </>
      }
    >
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[0.88rem] text-ink-soft">
        <li>
          Desde tu WhatsApp{contacts.ownPhone ? <> ({contacts.ownPhone})</> : null}, abre el chat con Invibot
          {contacts.botPhone ? <> al {contacts.botPhone}</> : null}.
          {contacts.botLink && (
            <>
              {" "}
              <a
                href={contacts.botLink}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                Abrir el chat ↗
              </a>
            </>
          )}
        </li>
        <li>Toca 📎 (en Android) o + (en iPhone) y elige «Contacto».</li>
        <li>Selecciona uno o varios y envíalos.</li>
      </ol>
      <p className="mt-3 text-[0.82rem] text-ink-muted">
        Te contestamos con quién quedó en tu lista. Si alguien está guardado como «Mamá» o «Tío», te preguntamos
        su nombre. Si tienes varios eventos, te preguntamos a cuál van.
      </p>
    </Way>
  );
}

export function OneByOneWay({ where }: { where: ReactNode }) {
  return <Way title="Uno por uno" note={<>{where} con su nombre y WhatsApp.</>} />;
}

/** Said wherever the ways are listed: none of them sends anything. */
export const NOTHING_SENT = "Agregar a alguien no le manda nada. La invitación sale sólo cuando tú la envíes.";
