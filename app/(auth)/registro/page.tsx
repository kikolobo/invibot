import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-chrome";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Crear cuenta" };

export default async function Registro() {
  if (await getSession()) redirect("/eventos");
  return (
    <SiteShell tone="paper">
      <div className="mx-auto max-w-md px-6 py-16 sm:px-10">
        <h1 className="font-display text-4xl leading-tight text-ink">Crear cuenta</h1>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Con una cuenta puedes crear eventos, invitar y seguir las
          confirmaciones.
        </p>
        <AuthForm mode="signup" />
      </div>
    </SiteShell>
  );
}
