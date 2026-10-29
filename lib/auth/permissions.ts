import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

/**
 * Invibot-wide roles, for the people who run Invibot rather than an event.
 *
 * - `user`    — every customer. No staff permissions at all.
 * - `support` — reads every account and its sessions, changes nothing. Enough
 *               to answer "why can't I get in", not enough to cause it.
 * - `admin`   — everything the admin plugin offers, impersonation included.
 *
 * Kept free of server imports so the client plugin can share it.
 */
export const ac = createAccessControl(defaultStatements);

export const roles = {
  user: ac.newRole({ user: [], session: [] }),
  support: ac.newRole({ user: ["list", "get"], session: ["list"] }),
  admin: ac.newRole(adminAc.statements),
};

export type PlatformRole = keyof typeof roles;

export const PLATFORM_ROLES = Object.keys(roles) as PlatformRole[];

export const roleLabels: Record<PlatformRole, string> = {
  user: "Usuario",
  support: "Soporte",
  admin: "Admin",
};

export const isPlatformRole = (value: unknown): value is PlatformRole =>
  typeof value === "string" && value in roles;

/** Who may open /admin at all. */
export const isStaff = (role: unknown) => role === "admin" || role === "support";
