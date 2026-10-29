/**
 * Dar o quitar un rol de staff desde la terminal. Es la única forma de hacer
 * el primer admin: la consola no deja que nadie se promueva a sí mismo.
 *
 *   npx tsx scripts/set-platform-role.mts francisco@lobo.fm admin
 *   npx tsx scripts/set-platform-role.mts alguien@ejemplo.com support
 *   npx tsx scripts/set-platform-role.mts alguien@ejemplo.com user
 *
 * ⚠️ `.env.local` apunta a la misma base que producción: esto cambia
 * producción en el acto. Queda en el historial de la consola como "script".
 */
process.loadEnvFile(".env.local");

const { eq } = await import("drizzle-orm");
const { db } = await import("@/db");
const { users } = await import("@/db/schema");
const { audit } = await import("@/lib/admin/audit");
const { isPlatformRole, PLATFORM_ROLES } = await import("@/lib/auth/permissions");

const [email, role] = process.argv.slice(2);
if (!email || !isPlatformRole(role)) {
  console.error(`Uso: set-platform-role.mts <correo> <${PLATFORM_ROLES.join("|")}>`);
  process.exit(1);
}

const user = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
if (!user) {
  console.error(`No hay ninguna cuenta con ${email}.`);
  process.exit(1);
}

if (user.role === role) {
  console.log(`${user.email} ya es ${role}.`);
} else {
  await db.update(users).set({ role }).where(eq(users.id, user.id));
  await audit({
    actorUserId: null,
    target: user,
    action: "set_role",
    detail: { from: user.role, to: role, via: "script" },
  });
  console.log(`${user.email}: ${user.role} → ${role}. Vale desde su próxima petición (hasta un minuto por la caché de sesión).`);
}
process.exit(0);
