import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { cookies } from "next/headers";
import { APIError } from "better-auth/api";
import { normalizePhone } from "@/lib/phone";
import { INVITE_COOKIE, acceptInvitesForPhone, inviteOpensSignup } from "@/lib/organizers/invites";
import { PHONE_TAKEN, phoneTaken } from "@/lib/organizers/account-phone";
import { GATE_COOKIE, gateOpen } from "./signup-gate";
import { ac, roles } from "./permissions";
import { signIns, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSettings } from "@/lib/site/settings";

/**
 * Organizer authentication. Guests never authenticate — they reach their
 * invitation through a signed token in the URL and have no account at all.
 *
 * Email and password for now because it needs no email infrastructure. Once
 * Resend is configured, add the email-otp or magic-link plugin: for this
 * audience a code sent to the phone or inbox beats remembering a password.
 */
/**
 * An explicitly configured URL wins; otherwise fall back to the hostname Vercel
 * assigns this deployment, so preview builds authenticate against themselves.
 * An empty environment variable is treated as unset — a blank value in the
 * dashboard would otherwise produce a baseURL of "".
 */
function baseURL(): string {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (configured) return configured;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const createAuth = () =>
  betterAuth({
    appName: "Invibot",
    baseURL: baseURL(),
    secret: process.env.BETTER_AUTH_SECRET,
    // Both the vercel.app host and the custom domain serve the same app during
    // the cutover, and preview deployments get a fresh hostname every push.
    // Without all of them here, sign-in fails CSRF with "Missing or null Origin".
    trustedOrigins: [
      "http://localhost:3000",
      "https://invibot.com",
      "https://www.invibot.com",
      "https://invibot.vercel.app",
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ],
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
    user: {
      additionalFields: {
        // Accepted as typed at signup and rewritten to E.164 by the create hook
        // below. Not `required` here: existing accounts have none, and the hook
        // is what insists on it for new ones.
        phone: { type: "string", required: false, input: true },
        // Set only by staff actions, so the session carries it and every
        // page can refuse a deleted account without another query.
        deletedAt: { type: "date", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      // No reset flow until there is an email provider to send it through.
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      // The cookie cache serves the session from a signed cookie instead of
      // hitting the database, which also means a revoked session keeps working
      // until it expires. Organizers hold their guests' phone numbers, so that
      // window stays short — 60s of saved queries is worth it, 5 minutes of
      // working back-button after signing out on a shared computer is not.
      cookieCache: { enabled: true, maxAge: 60 },
    },
    /**
     * The signup gate, enforced where the account is created.
     *
     * The form asks for a passcode, but the form calls better-auth's public
     * endpoint — so checking only there would be checking nothing. This runs on
     * every user insert, whichever way the request arrived.
     */
    databaseHooks: {
      session: {
        create: {
          // A history line, never a gate: a failed insert here must not be
          // what keeps somebody from signing in.
          after: async (session) => {
            try {
              await db.insert(signIns).values({
                userId: session.userId,
                sessionId: session.id,
                ipAddress: session.ipAddress ?? null,
                userAgent: session.userAgent ?? null,
                impersonatedBy:
                  typeof session.impersonatedBy === "string" ? session.impersonatedBy : null,
              });
            } catch (error) {
              console.error("[auth] could not record sign-in", error);
            }
          },
        },
      },
      user: {
        create: {
          before: async (user, context) => {
            // Same reasoning as the gate: the form's `type="tel"` is a hint,
            // this is the check. Stored canonical so it compares cleanly with
            // the numbers Meta sends us.
            const phone = normalizePhone(String(user.phone ?? ""));

            // Two ways through: the shared passcode, or an invitation to help
            // run an event — which is only good for the number it was sent to,
            // so a forwarded link does not make an account for a stranger.
            // A third: staff creating the account from /admin. The endpoint
            // has already checked that the caller may create users.
            const jar = await cookies();
            const invite = jar.get(INVITE_COOKIE)?.value;
            const invited = Boolean(invite && phone && (await inviteOpensSignup(invite, phone.e164)));
            const byStaff = context?.path === "/admin/create-user";
            if (!byStaff && !invited && !(await gateOpen(jar.get(GATE_COOKIE)?.value))) {
              throw new APIError("FORBIDDEN", {
                message: invite
                  ? "Esta invitación es para otro número de WhatsApp."
                  : "Necesitas un código de acceso para crear una cuenta.",
              });
            }

            if (!phone) {
              throw new APIError("BAD_REQUEST", {
                message: "Ese número de WhatsApp no parece válido.",
              });
            }
            // One account per number: invitations find people by it.
            if (await phoneTaken(phone.e164)) {
              throw new APIError("BAD_REQUEST", { message: PHONE_TAKEN });
            }
            return { data: { ...user, phone: phone.e164 } };
          },
          after: async (user, context) => {
            // One code, one account. Left open, the cookie would let a second
            // signup through from the same browser for the rest of the hour.
            context?.setCookie(GATE_COOKIE, "", { path: "/", maxAge: 0 });
            context?.setCookie(INVITE_COOKIE, "", { path: "/", maxAge: 0 });

            // The limits in force today, copied rather than referenced: a
            // later change to the defaults is for later accounts. Staff
            // creating the account can change them right after.
            const settings = await getSettings();
            if (settings.defaultMaxEvents !== null || settings.defaultMaxGuestsPerEvent !== null) {
              await db
                .update(users)
                .set({
                  maxEvents: settings.defaultMaxEvents,
                  maxGuestsPerEvent: settings.defaultMaxGuestsPerEvent,
                })
                .where(eq(users.id, user.id));
            }

            // Whatever was waiting for this number becomes access now, however
            // they came to sign up.
            await acceptInvitesForPhone({
              id: user.id,
              name: user.name,
              email: user.email,
              phone: typeof user.phone === "string" ? user.phone : null,
            });
          },
        },
      },
    },
    plugins: [
      admin({
        ac,
        roles,
        // Support is staff but not an admin: it must not count as one when
        // somebody asks to impersonate it, and it can be impersonated.
        adminRoles: ["admin"],
        bannedUserMessage: "Esta cuenta está suspendida. Escríbenos si crees que es un error.",
        // Long enough to reproduce a problem, short enough that a forgotten
        // tab does not leave staff signed in as a customer.
        impersonationSessionDuration: 60 * 60,
      }),
      // Must stay last: it lets server actions set the session cookie.
      nextCookies(),
    ],
  });

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/**
 * Built on first use, for the same reason the database client is: constructing
 * it reaches into the Drizzle adapter, so doing it at module load made every
 * route that imports auth require DATABASE_URL at build time.
 */
export const auth = new Proxy({} as Auth, {
  get(_target, property) {
    instance ??= createAuth();
    const real = instance as unknown as Record<string | symbol, unknown>;
    const value = real[property];
    return typeof value === "function" ? value.bind(real) : value;
  },
});
