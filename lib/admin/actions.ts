"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { db } from "@/db";
import { events, organizations, promoCodes, users } from "@/db/schema";
import { generateCode, normalizeCode } from "@/lib/billing/promo";
import { stripeFromEnv } from "@/lib/billing/stripe";
import { STRIPE_EVENTS, STRIPE_METHODS, describe as describeStripe, webhookPath } from "@/lib/connectors/stripe";
import { getSettings, saveSettings } from "@/lib/site/settings";
import { auth } from "@/lib/auth";
import { getSession, requireAdmin, type StaffSession } from "@/lib/auth/session";
import { isPlatformRole, roleLabels } from "@/lib/auth/permissions";
import { normalizePhone } from "@/lib/phone";
import { PHONE_TAKEN, changeAccountPhone, phoneTaken } from "@/lib/organizers/account-phone";
import { audit } from "./audit";
import { statusOf } from "./users";

export type AdminState = { error?: string; ok?: string };

/** Must match `emailAndPassword.minPasswordLength` in the auth config. */
const MIN_PASSWORD = 10;

/**
 * Better Auth speaks English and in codes; the people reading this do not.
 * Anything not listed falls back to its own message rather than to nothing.
 */
const MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya hay una cuenta con ese correo.",
  USER_ALREADY_EXISTS: "Ya hay una cuenta con ese correo.",
  YOU_CANNOT_IMPERSONATE_ADMINS: "No se puede entrar como otro admin.",
  PASSWORD_TOO_SHORT: `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`,
};

/**
 * Runs one change and turns any failure into a message for the form. A
 * refusal from Better Auth says why; anything else — the database dropping a
 * connection, a constraint we did not foresee — is logged in full and shown
 * as a plain failure, rather than taking the whole page down with it.
 */
async function attempt(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof APIError) {
      const code = (error.body as { code?: string } | undefined)?.code;
      return (code && MESSAGES[code]) || error.message || "No se pudo.";
    }
    console.error("[admin] action failed", error);
    return "Algo falló de nuestro lado y no se guardó. Inténtalo otra vez.";
  }
}

const validEmail = (value: string) => z.email().safeParse(value).success;

/** For the irreversible-ish buttons: a checkbox the form has to carry. */
const confirmed = (formData: FormData) => formData.get("confirmed") === "on";

/**
 * The account an action is about, and the guard every one of them shares:
 * staff never act on themselves from here. Suspending, deleting or demoting
 * yourself is how an Invibot ends up with no admin at all.
 */
async function target(
  formData: FormData,
  { allowSelf = false } = {},
): Promise<{ staff: StaffSession; user: typeof users.$inferSelect } | { error: string }> {
  const staff = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Esa cuenta ya no existe." };
  if (!allowSelf && user.id === staff.userId) {
    return { error: "Eso no se hace sobre tu propia cuenta." };
  }
  return { staff, user };
}

const refresh = (userId?: string) => {
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/actividad");
  if (userId) revalidatePath(`/admin/usuarios/${userId}`);
};

export async function createUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const staff = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "user");
  const phone = normalizePhone(String(formData.get("phone") ?? ""));

  if (!name) return { error: "Falta el nombre." };
  if (!validEmail(email)) return { error: "Ese correo no parece válido." };
  if (!phone) return { error: "Ese número de WhatsApp no parece válido." };
  if (password.length < MIN_PASSWORD) {
    return { error: `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.` };
  }
  if (!isPlatformRole(role)) return { error: "Ese rol no existe." };
  // The create hook checks this too; asking first gives the message a field.
  if (await phoneTaken(phone.e164)) return { error: PHONE_TAKEN };

  let createdId: string | null = null;
  const failed = await attempt(async () => {
    const { user } = await auth.api.createUser({
      headers: await headers(),
      body: { name, email, password, role, data: { phone: phone.e164 } },
    });
    createdId = user.id;
  });
  if (failed || !createdId) return { error: failed ?? "No se pudo crear la cuenta." };

  await audit({
    actorUserId: staff.userId,
    target: { id: createdId, email },
    action: "create",
    detail: { role },
  });
  refresh();
  redirect(`/admin/usuarios/${createdId}`);
}

export async function updateUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData, { allowSelf: true });
  if ("error" in found) return found;
  const { staff, user } = found;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;

  if (!name) return { error: "Falta el nombre." };
  if (!validEmail(email)) return { error: "Ese correo no parece válido." };
  if (rawPhone && !phone) return { error: "Ese número de WhatsApp no parece válido." };

  const before = { name: user.name, email: user.email, phone: user.phone };
  const changes: Record<string, string> = {};
  if (name !== user.name) changes.name = name;
  if (email !== user.email) changes.email = email;

  if (Object.keys(changes).length) {
    const failed = await attempt(async () =>
      auth.api.adminUpdateUser({
        headers: await headers(),
        body: { userId: user.id, data: changes },
      }),
    );
    if (failed) return { error: failed };
  }

  // Through the same path the owner uses, so their events follow the number.
  let skipped = 0;
  if (phone && phone.e164 !== user.phone) {
    let result: Awaited<ReturnType<typeof changeAccountPhone>> = {};
    const failed = await attempt(async () => {
      result = await changeAccountPhone(user.id, phone.e164);
    });
    if (failed) return { error: failed };
    if (result.error) return { error: result.error };
    skipped = result.skipped ?? 0;
    changes.phone = phone.e164;
  }

  if (!Object.keys(changes).length) return { ok: "No había nada que cambiar." };

  await audit({
    actorUserId: staff.userId,
    target: { id: user.id, email: changes.email ?? user.email },
    action: "update",
    detail: { before, after: changes },
  });
  refresh(user.id);
  return {
    ok: skipped
      ? `Guardado. En ${skipped === 1 ? "un evento" : `${skipped} eventos`} el número nuevo ya estaba con otra persona y se quedó el anterior.`
      : "Guardado.",
  };
}

export async function setRole(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData);
  if ("error" in found) return found;
  const { staff, user } = found;

  const role = String(formData.get("role") ?? "");
  if (!isPlatformRole(role)) return { error: "Ese rol no existe." };
  if (role === user.role) return { ok: "Ya tenía ese rol." };
  // Admin is everything on this console, purging included: worth a second look.
  if (role === "admin" && !confirmed(formData)) {
    return { error: "Hacerla admin le da todo, borrar cuentas incluido. Marca la casilla para confirmar." };
  }

  const failed = await attempt(async () =>
    auth.api.setRole({ headers: await headers(), body: { userId: user.id, role } }),
  );
  if (failed) return { error: failed };

  await audit({
    actorUserId: staff.userId,
    target: user,
    action: "set_role",
    detail: { from: user.role, to: role },
  });
  refresh(user.id);
  return { ok: `Ahora es ${roleLabels[role]}.` };
}

export async function setPassword(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData);
  if ("error" in found) return found;
  const { staff, user } = found;

  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) {
    return { error: `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.` };
  }

  const failed = await attempt(async () => {
    const requestHeaders = await headers();
    await auth.api.setUserPassword({
      headers: requestHeaders,
      body: { userId: user.id, newPassword: password },
    });
    // A reset is usually because somebody else might know the old one.
    await auth.api.revokeUserSessions({ headers: requestHeaders, body: { userId: user.id } });
  });
  if (failed) return { error: failed };

  await audit({ actorUserId: staff.userId, target: user, action: "set_password" });
  refresh(user.id);
  return { ok: "Contraseña cambiada. Sus sesiones se cerraron." };
}

export async function revokeSessions(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData);
  if ("error" in found) return found;
  const { staff, user } = found;
  if (!confirmed(formData)) return { error: "Marca la casilla para confirmar." };

  const failed = await attempt(async () =>
    auth.api.revokeUserSessions({ headers: await headers(), body: { userId: user.id } }),
  );
  if (failed) return { error: failed };

  await audit({ actorUserId: staff.userId, target: user, action: "revoke_sessions" });
  refresh(user.id);
  return { ok: "Sesiones cerradas." };
}

/** Suspending also closes every session — the plugin does that, not us. */
export async function suspendUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData);
  if ("error" in found) return found;
  const { staff, user } = found;
  if (statusOf(user) !== "active") return { error: "Esta cuenta no está activa." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Escribe por qué. Lo va a leer quien la reactive." };

  const failed = await attempt(async () =>
    auth.api.banUser({
      headers: await headers(),
      body: { userId: user.id, banReason: reason },
    }),
  );
  if (failed) return { error: failed };

  await audit({ actorUserId: staff.userId, target: user, action: "suspend", detail: { reason } });
  refresh(user.id);
  return { ok: "Suspendida. Ya no puede entrar." };
}

export async function unsuspendUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData);
  if ("error" in found) return found;
  const { staff, user } = found;
  if (statusOf(user) !== "suspended") {
    return { error: "Sólo se reactiva una cuenta suspendida. Una eliminada se restaura primero." };
  }

  const failed = await attempt(async () =>
    auth.api.unbanUser({ headers: await headers(), body: { userId: user.id } }),
  );
  if (failed) return { error: failed };

  await audit({
    actorUserId: staff.userId,
    target: user,
    action: "unsuspend",
    detail: { reason: user.banReason },
  });
  refresh(user.id);
  return { ok: "Reactivada." };
}

/**
 * Deleting is logical, and only of a suspended account: it hides the account
 * from the list and marks it for purging, and nothing it owns is touched.
 */
export async function deleteUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData);
  if ("error" in found) return found;
  const { staff, user } = found;
  if (statusOf(user) !== "suspended") return { error: "Suspéndela primero." };
  if (!confirmed(formData)) return { error: "Marca la casilla para confirmar." };

  // Conditional, so two admins on the same page cannot delete an account the
  // other has just reactivated.
  let changed = 0;
  const failed = await attempt(async () => {
    const rows = await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(and(eq(users.id, user.id), eq(users.banned, true), isNull(users.deletedAt)))
      .returning({ id: users.id });
    changed = rows.length;
  });
  if (failed) return { error: failed };
  if (!changed) return { error: "La cuenta cambió mientras tanto. Recarga la página." };

  await audit({ actorUserId: staff.userId, target: user, action: "delete" });
  refresh(user.id);
  return { ok: "Eliminada. Se puede restaurar mientras no se borre definitivamente." };
}

/** Back to suspended, not to active: coming back is a second, separate decision. */
export async function restoreUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData);
  if ("error" in found) return found;
  const { staff, user } = found;
  if (statusOf(user) !== "deleted") return { error: "Esta cuenta no está eliminada." };

  let changed = 0;
  const failed = await attempt(async () => {
    const rows = await db
      .update(users)
      .set({ deletedAt: null })
      .where(and(eq(users.id, user.id), isNotNull(users.deletedAt)))
      .returning({ id: users.id });
    changed = rows.length;
  });
  if (failed) return { error: failed };
  if (!changed) return { error: "La cuenta cambió mientras tanto. Recarga la página." };

  await audit({ actorUserId: staff.userId, target: user, action: "restore" });
  refresh(user.id);
  return { ok: "Restaurada. Sigue suspendida hasta que alguien la reactive." };
}

/**
 * The one thing here that cannot be undone. Removing the user cascades to its
 * organization, and from there to every event, guest and message it owns.
 */
export async function purgeUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData);
  if ("error" in found) return found;
  const { staff, user } = found;
  if (statusOf(user) !== "deleted") return { error: "Sólo se borra una cuenta ya eliminada." };

  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (confirm !== user.email.toLowerCase()) {
    return { error: "Escribe el correo de la cuenta, tal cual, para confirmar." };
  }

  const failed = await attempt(async () =>
    auth.api.removeUser({ headers: await headers(), body: { userId: user.id } }),
  );
  if (failed) return { error: failed };

  await audit({
    actorUserId: staff.userId,
    target: user,
    action: "purge",
    detail: { name: user.name, phone: user.phone, createdAt: user.createdAt.toISOString() },
  });
  refresh();
  redirect("/admin/usuarios?estado=deleted");
}

/** "Ver como": a session as that customer, for an hour, with a way back. */
export async function impersonateUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData);
  if ("error" in found) return found;
  const { staff, user } = found;
  if (statusOf(user) !== "active") return { error: "Sólo se puede entrar a una cuenta activa." };

  const failed = await attempt(async () =>
    auth.api.impersonateUser({ headers: await headers(), body: { userId: user.id } }),
  );
  if (failed) return { error: failed };

  await audit({ actorUserId: staff.userId, target: user, action: "impersonate" });
  redirect("/eventos");
}

/**
 * Called from inside the impersonated session, which is the customer's — so
 * this checks for an impersonation rather than for staff.
 */
export async function stopImpersonating() {
  const session = await getSession();
  const userId = session?.user.id;
  if (!session?.session.impersonatedBy) redirect("/eventos");

  await auth.api.stopImpersonating({ headers: await headers() });
  redirect(userId ? `/admin/usuarios/${userId}` : "/admin/usuarios");
}

/** A limit as typed: blank is no limit, anything else a whole number. */
function readLimit(formData: FormData, field: string): number | null | { error: string } {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 100_000) {
    return { error: "Los límites son números enteros, o vacío para no tener límite." };
  }
  return value;
}

const isError = (value: unknown): value is { error: string } =>
  typeof value === "object" && value !== null && "error" in value;

/** Per-account limits. Applies from the next event or guest; nothing existing is removed. */
export async function setUserLimits(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData, { allowSelf: true });
  if ("error" in found) return found;
  const { staff, user } = found;

  const maxEvents = readLimit(formData, "maxEvents");
  const maxGuestsPerEvent = readLimit(formData, "maxGuestsPerEvent");
  if (isError(maxEvents)) return maxEvents;
  if (isError(maxGuestsPerEvent)) return maxGuestsPerEvent;

  const failed = await attempt(() =>
    db.update(users).set({ maxEvents, maxGuestsPerEvent }).where(eq(users.id, user.id)),
  );
  if (failed) return { error: failed };

  await audit({
    actorUserId: staff.userId,
    target: user,
    action: "set_limits",
    detail: {
      before: { maxEvents: user.maxEvents, maxGuestsPerEvent: user.maxGuestsPerEvent },
      after: { maxEvents, maxGuestsPerEvent },
    },
  });
  refresh(user.id);
  return { ok: "Límites guardados. Lo que ya tiene se queda; aplican a lo siguiente que agregue." };
}

/** The event an event action is about, with its owner for the log. */
async function eventTarget(formData: FormData) {
  const staff = await requireAdmin();
  const eventId = String(formData.get("eventId") ?? "");
  const [row] = await db
    .select({ event: events, ownerId: users.id, ownerEmail: users.email })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .innerJoin(users, eq(users.id, organizations.ownerUserId))
    .where(eq(events.id, eventId));
  if (!row) return { error: "Ese evento ya no existe." } as const;
  return { staff, ...row };
}

const refreshEvent = (eventId: string, ownerId: string) => {
  revalidatePath("/admin/eventos");
  revalidatePath(`/admin/eventos/${eventId}`);
  revalidatePath(`/admin/usuarios/${ownerId}`);
  revalidatePath(`/eventos/${eventId}`, "layout");
};

export async function suspendEvent(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await eventTarget(formData);
  if ("error" in found) return { error: found.error };
  const { staff, event, ownerId, ownerEmail } = found;
  if (event.suspendedAt) return { error: "Ya está suspendido." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Escribe por qué. Lo va a leer quien lo reactive." };

  const failed = await attempt(() =>
    db
      .update(events)
      .set({ suspendedAt: new Date(), suspendedReason: reason, suspendedByUserId: staff.userId })
      .where(and(eq(events.id, event.id), isNull(events.suspendedAt))),
  );
  if (failed) return { error: failed };

  await audit({
    actorUserId: staff.userId,
    target: { id: ownerId, email: ownerEmail },
    action: "suspend_event",
    detail: { eventId: event.id, eventName: event.name, reason },
  });
  refreshEvent(event.id, ownerId);
  return { ok: "Suspendido. No sale nada más a sus invitados." };
}

export async function unsuspendEvent(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await eventTarget(formData);
  if ("error" in found) return { error: found.error };
  const { staff, event, ownerId, ownerEmail } = found;
  if (!event.suspendedAt) return { error: "No está suspendido." };

  const failed = await attempt(() =>
    db
      .update(events)
      .set({ suspendedAt: null, suspendedReason: null, suspendedByUserId: null })
      .where(eq(events.id, event.id)),
  );
  if (failed) return { error: failed };

  await audit({
    actorUserId: staff.userId,
    target: { id: ownerId, email: ownerEmail },
    action: "unsuspend_event",
    detail: { eventId: event.id, eventName: event.name, reason: event.suspendedReason },
  });
  refreshEvent(event.id, ownerId);
  return {
    ok: "Reactivado. Los mensajes programados que se quedaron esperando salen en la próxima corrida diaria.",
  };
}

export async function setEventLimit(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await eventTarget(formData);
  if ("error" in found) return { error: found.error };
  const { staff, event, ownerId, ownerEmail } = found;

  const maxGuests = readLimit(formData, "maxGuests");
  if (isError(maxGuests)) return maxGuests;

  const failed = await attempt(() =>
    db.update(events).set({ maxGuests }).where(eq(events.id, event.id)),
  );
  if (failed) return { error: failed };

  await audit({
    actorUserId: staff.userId,
    target: { id: ownerId, email: ownerEmail },
    action: "event_limit",
    detail: { eventId: event.id, eventName: event.name, from: event.maxGuests, to: maxGuests },
  });
  refreshEvent(event.id, ownerId);
  return {
    ok: maxGuests === null ? "Ahora sigue el límite de su dueño." : `Límite de ${maxGuests} invitados guardado.`,
  };
}

/** The settings page, all at once: one form, one save, one line in the log. */
export async function updateSettings(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const staff = await requireAdmin();
  const before = await getSettings();

  const signupMode = String(formData.get("signupMode") ?? "");
  if (signupMode !== "passcode" && signupMode !== "open" && signupMode !== "closed") {
    return { error: "Elige cómo se crean las cuentas." };
  }
  const passcode = String(formData.get("signupPasscode") ?? "").trim();
  if (passcode && passcode.length < 6) {
    return { error: "El código necesita al menos 6 caracteres: es lo único entre un extraño y una cuenta." };
  }
  const nextPasscode = passcode || before.signupPasscode;
  if (signupMode === "passcode" && !(nextPasscode || process.env.SIGNUP_PASSCODE?.trim())) {
    return { error: "Para registro con código, escribe un código." };
  }

  const defaultMaxEvents = readLimit(formData, "defaultMaxEvents");
  const defaultMaxGuestsPerEvent = readLimit(formData, "defaultMaxGuestsPerEvent");
  if (isError(defaultMaxEvents)) return defaultMaxEvents;
  if (isError(defaultMaxGuestsPerEvent)) return defaultMaxGuestsPerEvent;

  const pesos = Number(String(formData.get("pricePerGuest") ?? "").trim());
  if (!Number.isFinite(pesos) || pesos < 0 || pesos > 10_000) {
    return { error: "El precio por invitado es un número en pesos, como 10 o 12.50." };
  }
  const pricePerGuestMinor = Math.round(pesos * 100);
  const minimumSlots = readLimit(formData, "minimumSlots");
  const freeSimulatorTurns = readLimit(formData, "freeSimulatorTurns");
  if (isError(minimumSlots)) return minimumSlots;
  if (isError(freeSimulatorTurns)) return freeSimulatorTurns;

  const maintenance = formData.get("maintenance") === "on";
  const maintenanceMessage = String(formData.get("maintenanceMessage") ?? "").trim() || null;

  const after = {
    signupMode,
    signupPasscode: nextPasscode,
    maintenance,
    maintenanceMessage,
    defaultMaxEvents,
    defaultMaxGuestsPerEvent,
    pricePerGuestMinor,
    minimumSlots: minimumSlots ?? 1,
    freeSimulatorTurns: freeSimulatorTurns ?? 0,
  } as const;

  const failed = await attempt(() => saveSettings(after, staff.userId));
  if (failed) return { error: failed };

  // The log names what changed; the code itself is only ever "changed".
  const changed = Object.fromEntries(
    Object.entries(after)
      .filter(([key, value]) => before[key as keyof typeof before] !== value)
      .map(([key, value]) => [key, key === "signupPasscode" ? "(cambió)" : value]),
  );
  if (Object.keys(changed).length) {
    await audit({ actorUserId: staff.userId, target: null, action: "settings", detail: changed });
  }

  revalidatePath("/admin", "layout");
  return { ok: "Configuración guardada." };
}

/** "Cortesía": every event this account owns sends without paying. */
export async function setBillingExempt(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await target(formData, { allowSelf: true });
  if ("error" in found) return found;
  const { staff, user } = found;

  const exempt = formData.get("exempt") === "on";
  if (exempt === user.billingExempt) return { ok: "No había nada que cambiar." };

  const failed = await attempt(() =>
    db.update(users).set({ billingExempt: exempt }).where(eq(users.id, user.id)),
  );
  if (failed) return { error: failed };

  await audit({ actorUserId: staff.userId, target: user, action: "billing_exempt", detail: { to: exempt } });
  refresh(user.id);
  return { ok: exempt ? "Ahora es de cortesía: no paga por sus invitados." : "Ya no es de cortesía." };
}

/** Places on the house, for one event. Negative takes back unused ones. */
export async function giftSlots(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const found = await eventTarget(formData);
  if ("error" in found) return { error: found.error };
  const { staff, event, ownerId, ownerEmail } = found;

  const amount = Math.trunc(Number(formData.get("slots")));
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 5000) {
    return { error: "Escribe cuántos lugares regalar (o un número negativo para quitar)." };
  }
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Escribe por qué. Queda en el historial." };

  const next = event.giftedSlots + amount;
  if (next < 0) return { error: `Sólo tiene ${event.giftedSlots} lugares de regalo para quitar.` };

  const failed = await attempt(() =>
    db.update(events).set({ giftedSlots: next }).where(eq(events.id, event.id)),
  );
  if (failed) return { error: failed };

  await audit({
    actorUserId: staff.userId,
    target: { id: ownerId, email: ownerEmail },
    action: "gift_slots",
    detail: { eventId: event.id, eventName: event.name, amount, reason },
  });
  refreshEvent(event.id, ownerId);
  return { ok: `Listo: ahora tiene ${next} lugares de regalo.` };
}

export async function createPromoCode(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const staff = await requireAdmin();

  const code = normalizeCode(String(formData.get("code") ?? "")) || generateCode();
  if (!/^[A-Z0-9-]{4,32}$/.test(code)) {
    return { error: "El código va de 4 a 32 letras, números o guiones." };
  }
  const slotsPerUser = Math.floor(Number(formData.get("slotsPerUser")));
  const maxRedemptions = Math.floor(Number(formData.get("maxRedemptions")));
  if (!Number.isFinite(slotsPerUser) || slotsPerUser < 1 || slotsPerUser > 5000) {
    return { error: "Los lugares por usuario van de 1 a 5,000." };
  }
  if (!Number.isFinite(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 100_000) {
    return { error: "El número de usuarios va de 1 a 100,000." };
  }
  const rawExpiry = String(formData.get("expiresAt") ?? "").trim();
  // A date alone means through the end of that day in Mexico City.
  const expiresAt = rawExpiry ? new Date(`${rawExpiry}T23:59:59-06:00`) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { error: "Esa fecha no se entiende." };
  const note = String(formData.get("note") ?? "").trim() || null;

  const taken = await db.query.promoCodes.findFirst({ where: eq(promoCodes.code, code), columns: { id: true } });
  if (taken) return { error: `Ya existe el código ${code}.` };

  const failed = await attempt(() =>
    db.insert(promoCodes).values({
      code,
      slotsPerUser,
      maxRedemptions,
      expiresAt,
      note,
      createdByUserId: staff.userId,
    }),
  );
  if (failed) return { error: failed };

  await audit({
    actorUserId: staff.userId,
    target: null,
    action: "promo_create",
    detail: { code, slotsPerUser, maxRedemptions, expiresAt: expiresAt?.toISOString() ?? null },
  });
  revalidatePath("/admin/codigos");
  return { ok: `Código ${code} creado: ${maxRedemptions} usuarios, ${slotsPerUser} invitados cada uno.` };
}

export async function setPromoActive(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const staff = await requireAdmin();
  const id = String(formData.get("codeId") ?? "");
  const active = formData.get("active") === "true";
  const promo = await db.query.promoCodes.findFirst({ where: eq(promoCodes.id, id) });
  if (!promo) return { error: "Ese código ya no existe." };

  const failed = await attempt(() => db.update(promoCodes).set({ active }).where(eq(promoCodes.id, id)));
  if (failed) return { error: failed };

  await audit({ actorUserId: staff.userId, target: null, action: "promo_toggle", detail: { code: promo.code, active } });
  revalidatePath("/admin/codigos");
  return { ok: active ? "Activado." : "Desactivado: ya nadie lo puede usar." };
}

/**
 * Creates — or repairs — the webhook Stripe uses to tell us a payment went
 * through, pointed at the host this admin is using. Stripe hands back the
 * signing secret only at creation, so an endpoint whose secret we never kept
 * is replaced rather than reused.
 */
export async function setupStripeWebhook(): Promise<AdminState> {
  const staff = await requireAdmin();
  const stripe = stripeFromEnv();
  if (!stripe) return { error: "Primero pon STRIPE_SECRET_KEY en el entorno." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (/^(localhost|127\.|\[::1\])/.test(host)) {
    return {
      error: `Stripe no puede llegar a ${host}. En local usa: stripe listen --forward-to localhost:3000${webhookPath}`,
    };
  }
  const url = `https://${host}${webhookPath}`;
  const settings = await getSettings();

  try {
    const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.find(
      (endpoint) => endpoint.url === url || endpoint.id === settings.stripeWebhookId,
    );
    if (existing && existing.id === settings.stripeWebhookId && settings.stripeWebhookSecret) {
      await stripe.webhookEndpoints.update(existing.id, { url, enabled_events: STRIPE_EVENTS, disabled: false });
      await audit({ actorUserId: staff.userId, target: null, action: "connector", detail: { stripe: "webhook_updated", url } });
      revalidatePath("/admin/conectores");
      return { ok: "Webhook al día." };
    }
    if (existing) await stripe.webhookEndpoints.del(existing.id);

    const created = await stripe.webhookEndpoints.create({
      url,
      enabled_events: STRIPE_EVENTS,
      description: "Invibot: lugares pagados",
    });
    await saveSettings({ stripeWebhookId: created.id, stripeWebhookSecret: created.secret ?? null }, staff.userId);
    await audit({ actorUserId: staff.userId, target: null, action: "connector", detail: { stripe: "webhook_created", url } });
  } catch (error) {
    return { error: describeStripe(error) };
  }

  revalidatePath("/admin/conectores");
  return { ok: `Webhook creado en ${url}. Los pagos ya se acreditan solos.` };
}

/** Turns one payment method on or off in the configuration Checkout uses. */
export async function setStripeMethod(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const staff = await requireAdmin();
  const stripe = stripeFromEnv();
  if (!stripe) return { error: "Stripe no está configurado." };

  const method = String(formData.get("method") ?? "");
  if (!STRIPE_METHODS.some((m) => m.key === method)) return { error: "Ese método no existe." };
  const configurationId = String(formData.get("configurationId") ?? "");
  const on = formData.get("on") === "true";

  try {
    await stripe.paymentMethodConfigurations.update(configurationId, {
      [method]: { display_preference: { preference: on ? "on" : "off" } },
    });
  } catch (error) {
    return { error: describeStripe(error) };
  }

  await audit({ actorUserId: staff.userId, target: null, action: "connector", detail: { stripe: "method", method, on } });
  revalidatePath("/admin/conectores");
  return { ok: on ? "Activado." : "Desactivado." };
}
