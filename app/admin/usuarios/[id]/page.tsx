import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { PLATFORM_ROLES, isPlatformRole, roleLabels } from "@/lib/auth/permissions";
import { getUserDetail, statusLabels, statusOf } from "@/lib/admin/users";
import { activityLabels, userActivity, type ActivityKind } from "@/lib/admin/activity";
import {
  deleteUser,
  impersonateUser,
  purgeUser,
  restoreUser,
  revokeSessions,
  setPassword,
  setRole,
  setUserLimits,
  suspendUser,
  unsuspendUser,
  updateUser,
} from "@/lib/admin/actions";
import { formatPhone } from "@/lib/phone";
import { AdminForm, Field } from "../../admin-form";
import { formatDate, formatDateTime } from "../../format";

export const metadata = { title: "Cuenta" };

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      {note && <p className="mt-2 max-w-lg text-[0.88rem] leading-relaxed text-ink-muted">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

const seatRoles: Record<string, string> = {
  admin: "Admin",
  guest_manager: "Gestor de invitados",
  organizer: "Organizador",
};

const KINDS = Object.keys(activityLabels) as ActivityKind[];

export default async function Cuenta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ver?: string }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const { ver } = await searchParams;
  const detail = await getUserDetail(id);
  if (!detail) notFound();

  const { user, org, events, seats, invites, sessions } = detail;
  const shown = KINDS.find((kind) => kind === ver);
  const activity = (await userActivity(user.id)).filter((item) => !shown || item.kind === shown);
  const activeEvents = events.filter((event) => !event.archivedAt).length;
  const status = statusOf(user);
  const isAdmin = staff.role === "admin";
  const self = user.id === staff.userId;
  // Staff never act on their own account from here; "Mi cuenta" is for that.
  const manage = isAdmin && !self;

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-6 py-12 sm:px-10">
      <div>
        <Link href="/admin/usuarios" className="text-[0.88rem] text-ink-muted hover:text-accent">
          ← Cuentas
        </Link>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-display text-4xl text-ink">{user.name || "Sin nombre"}</h1>
          <span
            className={`rounded-full border px-3 py-0.5 text-[0.8rem] ${
              status === "active" ? "border-line text-ink-soft" : "border-danger text-danger"
            }`}
          >
            {statusLabels[status]}
          </span>
          <span className="rounded-full border border-line px-3 py-0.5 text-[0.8rem] text-ink-soft">
            {isPlatformRole(user.role) ? roleLabels[user.role] : user.role}
          </span>
        </div>
        <p className="mt-3 text-ink-soft">
          {user.email}
          {user.phone && ` · ${formatPhone(user.phone)}`}
        </p>
        <p className="mt-1 text-[0.85rem] text-ink-muted">
          Alta {formatDate(user.createdAt)}
          {org ? ` · Organización «${org.name}»` : " · Todavía no ha entrado"}
        </p>
        {user.banned && user.banReason && (
          <p className="mt-4 max-w-lg rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-[0.9rem] text-ink">
            Suspendida: {user.banReason}
            {user.deletedAt && ` · Eliminada el ${formatDate(user.deletedAt)}`}
          </p>
        )}
      </div>

      {manage && status === "active" && (
        <AdminForm
          action={impersonateUser}
          userId={user.id}
          submit="Ver como esta cuenta"
          busy="Entrando…"
          tone="quiet"
        />
      )}

      <Section title={`Eventos (${events.length})`}>
        {events.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <Link
                  href={`/admin/eventos/${event.id}`}
                  className={`hover:text-accent ${event.archivedAt ? "text-ink-muted" : "text-ink"}`}
                >
                  {event.name}
                  {event.archivedAt && " · archivado"}
                </Link>
                <span className="text-[0.85rem] tabular-nums text-ink-muted">
                  {formatDate(event.startsAt)} · {event.guests} invitados · {event.sends} envíos
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.9rem] text-ink-muted">Ningún evento propio.</p>
        )}
      </Section>

      <Section
        title={`Organiza en eventos de otros (${seats.length})`}
        note="Eventos de otras cuentas donde aceptó una invitación para ayudar."
      >
        {seats.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {seats.map((seat) => (
              <li key={seat.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span className={seat.archivedAt ? "text-ink-muted" : "text-ink"}>
                  <Link href={`/admin/eventos/${seat.eventId}`} className="hover:text-accent">
                    {seat.eventName}
                  </Link>
                  {seat.archivedAt && " · archivado"}
                  <span className="block text-[0.82rem] text-ink-muted">
                    De{" "}
                    <Link href={`/admin/usuarios/${seat.ownerId}`} className="hover:text-accent">
                      {seat.ownerName || seat.ownerEmail}
                    </Link>
                  </span>
                </span>
                <span className="text-[0.85rem] text-ink-muted">
                  {seatRoles[seat.role] ?? seat.role}
                  {seat.isResponder && " · responde a invitados"} · desde {formatDate(seat.joinedAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.9rem] text-ink-muted">En ninguno.</p>
        )}

        {invites.length > 0 && (
          <div className="mt-6">
            <h3 className="text-[0.9rem] text-ink-soft">Invitaciones a su WhatsApp sin aceptar</h3>
            <ul className="mt-2 space-y-2 text-[0.88rem]">
              {invites.map((invite) => (
                <li key={invite.id}>
                  <span className="text-ink">{invite.eventName}</span>
                  <span className="text-ink-muted">
                    {" · "}
                    {seatRoles[invite.role] ?? invite.role}
                    {invite.invitedByName || invite.invitedByEmail
                      ? ` · invitó ${invite.invitedByName || invite.invitedByEmail}`
                      : ""}
                    {" · "}
                    {invite.sentAt ? `enviada ${formatDate(invite.sentAt)}` : "no se pudo enviar"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        title="Límites"
        note={`Tiene ${activeEvents} ${activeEvents === 1 ? "evento activo" : "eventos activos"}. Vacío es sin límite. Un evento puede tener su propio límite de invitados desde su página, y ése manda.`}
      >
        {manage || (isAdmin && self) ? (
          <AdminForm action={setUserLimits} userId={user.id} submit="Guardar límites" className="space-y-4">
            <div className="grid max-w-md gap-4 sm:grid-cols-2">
              <Field
                label="Eventos activos"
                name="maxEvents"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={user.maxEvents ?? ""}
                placeholder="Sin límite"
              />
              <Field
                label="Invitados por evento"
                name="maxGuestsPerEvent"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={user.maxGuestsPerEvent ?? ""}
                placeholder="Sin límite"
              />
            </div>
          </AdminForm>
        ) : (
          <dl className="grid max-w-sm grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[0.9rem]">
            <dt className="text-ink-muted">Eventos activos</dt>
            <dd>{user.maxEvents ?? "Sin límite"}</dd>
            <dt className="text-ink-muted">Invitados por evento</dt>
            <dd>{user.maxGuestsPerEvent ?? "Sin límite"}</dd>
          </dl>
        )}
      </Section>

      <Section
        title="Datos"
        note={
          manage
            ? "Cambiar el WhatsApp lo cambia también en todos sus eventos, igual que si lo hiciera desde «Mi cuenta»."
            : undefined
        }
      >
        {manage ? (
          <AdminForm action={updateUser} userId={user.id} submit="Guardar" className="max-w-sm space-y-4">
            <Field label="Nombre" name="name" required defaultValue={user.name} />
            <Field label="Correo" name="email" type="email" required defaultValue={user.email} />
            <Field
              label="WhatsApp"
              name="phone"
              type="tel"
              defaultValue={user.phone ? formatPhone(user.phone) : ""}
            />
          </AdminForm>
        ) : (
          <dl className="grid max-w-sm grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[0.9rem]">
            <dt className="text-ink-muted">Nombre</dt>
            <dd>{user.name}</dd>
            <dt className="text-ink-muted">Correo</dt>
            <dd>{user.email}</dd>
            <dt className="text-ink-muted">WhatsApp</dt>
            <dd>{user.phone ? formatPhone(user.phone) : "—"}</dd>
          </dl>
        )}
      </Section>

      <Section
        title={`Sesiones abiertas (${sessions.length})`}
        note="Cerrarlas la obliga a volver a entrar en todos lados. Puede tardar hasta un minuto."
      >
        {sessions.length > 0 && (
          <ul className="mb-6 space-y-2 text-[0.85rem] text-ink-soft">
            {sessions.map((session) => (
              <li key={session.id}>
                {formatDateTime(session.updatedAt)}
                {session.impersonatedBy && " · staff viendo como esta cuenta"}
                <span className="block truncate text-ink-muted">
                  {[session.ipAddress, session.userAgent].filter(Boolean).join(" · ") || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {manage && sessions.length > 0 && (
          <AdminForm
            action={revokeSessions}
            userId={user.id}
            submit="Cerrar sesiones"
            busy="Cerrando…"
            tone="quiet"
            confirm="Cerrar todas sus sesiones, en todos sus dispositivos."
          />
        )}
      </Section>

      {manage && status !== "deleted" && (
        <>
          <Section title="Rol" note="Soporte puede ver todas las cuentas, sin cambiar nada. Admin puede todo lo de esta página.">
            <AdminForm
              action={setRole}
              userId={user.id}
              submit="Cambiar rol"
              confirm="Si es a Admin: entiendo que podrá hacer todo, incluso borrar cuentas."
              className="space-y-4"
            >
              <select
                name="role"
                defaultValue={user.role}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-ink"
              >
                {PLATFORM_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </AdminForm>
          </Section>

          <Section title="Contraseña" note="Pone una nueva y cierra sus sesiones. Pásasela por un canal privado.">
            <AdminForm action={setPassword} userId={user.id} submit="Cambiar contraseña" className="max-w-sm space-y-4">
              <Field label="Contraseña nueva" name="password" type="password" required minLength={10} autoComplete="new-password" />
            </AdminForm>
          </Section>
        </>
      )}

      {manage && (
        <Section
          title="Suspender y eliminar"
          note="Primero se suspende; ya suspendida se puede eliminar, y eliminada se puede restaurar o borrar para siempre. Sus eventos siguen funcionando para sus invitados mientras la cuenta no se borre."
        >
          {status === "active" && (
            <AdminForm action={suspendUser} userId={user.id} submit="Suspender" busy="Suspendiendo…" tone="danger" className="max-w-sm space-y-4">
              <Field label="Motivo" name="reason" required hint="Lo va a leer quien la reactive." />
            </AdminForm>
          )}

          {status === "suspended" && (
            <div className="flex flex-wrap gap-3">
              <AdminForm action={unsuspendUser} userId={user.id} submit="Reactivar" busy="Reactivando…" />
              <AdminForm
                action={deleteUser}
                userId={user.id}
                submit="Eliminar"
                busy="Eliminando…"
                tone="danger"
                confirm="Eliminarla. Se puede restaurar mientras no se borre para siempre."
              />
            </div>
          )}

          {status === "deleted" && (
            <div className="space-y-8">
              <AdminForm action={restoreUser} userId={user.id} submit="Restaurar" busy="Restaurando…" tone="quiet" />
              <AdminForm action={purgeUser} userId={user.id} submit="Borrar para siempre" busy="Borrando…" tone="danger" className="max-w-sm space-y-4 rounded-xl border border-danger/40 p-5">
                <p className="text-[0.88rem] leading-relaxed text-ink">
                  Borra la cuenta, su organización y todo lo que tiene: {events.length}{" "}
                  {events.length === 1 ? "evento" : "eventos"}, sus invitados y sus mensajes. No se puede
                  deshacer.
                </p>
                <Field label={`Escribe ${user.email} para confirmar`} name="confirm" required autoComplete="off" />
              </AdminForm>
            </div>
          )}
        </Section>
      )}

      <Section title="Actividad" note="Lo que esta cuenta ha hecho en Invibot, y lo que el staff le ha hecho.">
        <nav className="mb-6 flex flex-wrap gap-2 text-[0.82rem]">
          {[undefined, ...KINDS].map((kind) => (
            <Link
              key={kind ?? "all"}
              href={kind ? `/admin/usuarios/${user.id}?ver=${kind}` : `/admin/usuarios/${user.id}`}
              scroll={false}
              className={`rounded-full border px-3 py-1 ${
                kind === shown ? "border-accent text-accent" : "border-line text-ink-soft hover:border-accent"
              }`}
            >
              {kind ? activityLabels[kind] : "Todo"}
            </Link>
          ))}
        </nav>
        {activity.length ? (
          <ol className="space-y-3 border-l border-line pl-5 text-[0.88rem]">
            {activity.map((item) => (
              <li key={item.id}>
                <span className="text-[0.75rem] uppercase tracking-wide text-ink-muted">
                  {activityLabels[item.kind]} · {formatDateTime(item.at)}
                </span>
                <span className="block text-ink">
                  {item.href ? (
                    <Link href={item.href} className="hover:text-accent">
                      {item.text}
                    </Link>
                  ) : (
                    item.text
                  )}
                </span>
                {item.detail && <span className="block text-ink-muted">{item.detail}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[0.9rem] text-ink-muted">Nada que mostrar.</p>
        )}
      </Section>
    </div>
  );
}
