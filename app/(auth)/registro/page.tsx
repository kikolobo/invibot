import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-chrome";
import { getSession } from "@/lib/auth/session";
import { GATE_COOKIE, gateOpen, gateConfigured } from "@/lib/auth/signup-gate";
import { getSettings } from "@/lib/site/settings";
import { AuthForm } from "../auth-form";
import { PasscodeForm } from "./passcode-form";

export const metadata = { title: "Crear cuenta" };

export default async function Registro() {
  if (await getSession()) redirect("/eventos");

  const settings = await getSettings();
  if (settings.maintenance) redirect("/mantenimiento");

  const jar = await cookies();
  const open = await gateOpen(jar.get(GATE_COOKIE)?.value);
  const configured = await gateConfigured();

  return (
    <SiteShell tone="paper">
      <div className="mx-auto max-w-md px-6 py-16 sm:px-10">
        <h1 className="font-display text-4xl leading-tight text-ink">Crear cuenta</h1>

        {open ? (
          <>
            <p className="mt-3 leading-relaxed text-ink-soft">
              Con una cuenta puedes crear eventos, invitar y seguir las confirmaciones.
            </p>
            <AuthForm mode="signup" />
          </>
        ) : (
          <>
            <p className="mt-3 leading-relaxed text-ink-soft">
              {configured
                ? "Por ahora las cuentas son por invitación. Si tienes un código, escríbelo aquí."
                : "Las cuentas están cerradas por el momento."}
            </p>
            {configured && <PasscodeForm />}
          </>
        )}
      </div>
    </SiteShell>
  );
}
