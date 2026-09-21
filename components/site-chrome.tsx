import Link from "next/link";

type Tone = "paper" | "night";

const tones = {
  paper: {
    wrap: "bg-paper text-ink",
    logo: "text-ink hover:text-accent",
    line: "border-line",
    muted: "text-ink-muted",
    strong: "text-ink",
    link: "hover:text-accent",
  },
  night: {
    wrap: "bg-night text-night-text",
    logo: "text-night-text hover:text-gold",
    line: "border-night-line",
    muted: "text-night-soft",
    strong: "text-night-text",
    link: "hover:text-gold",
  },
} satisfies Record<Tone, Record<string, string>>;

export function SiteHeader({ tone = "paper" }: { tone?: Tone }) {
  const t = tones[tone];
  const appButton =
    tone === "night"
      ? "border-gold/40 text-night-text hover:border-gold hover:text-gold"
      : "border-line text-ink-soft hover:border-accent hover:text-accent";

  return (
    <header className="flex items-center justify-between px-6 py-6 sm:px-10">
      <Link
        href="/"
        className={`font-display text-2xl tracking-tight transition-colors ${t.logo}`}
      >
        Invibot
      </Link>

      {/* One door for everybody. Signed in it opens the events list; signed
          out it lands on the sign-in form — which is what "Login" promises
          either way, where "App" left people guessing. */}
      <Link
        href="/eventos"
        className={`rounded-full border px-5 py-2 text-sm transition-colors ${appButton}`}
      >
        Login
      </Link>
    </header>
  );
}

export function SiteFooter({ tone = "paper" }: { tone?: Tone }) {
  const t = tones[tone];
  return (
    <footer className={`border-t px-6 py-10 sm:px-10 ${t.line}`}>
      <div
        className={`mx-auto flex max-w-5xl flex-col gap-6 text-sm sm:flex-row sm:items-start sm:justify-between ${t.muted}`}
      >
        <div className="max-w-xs">
          <p className={`font-display text-xl ${t.strong}`}>Invibot</p>
          <p className="mt-2 leading-relaxed">
            Invitaciones digitales y confirmación de asistencia por WhatsApp.
          </p>
        </div>
        <nav className="flex flex-col gap-2">
          <Link href="/privacidad" className={`transition-colors ${t.link}`}>
            Aviso de privacidad
          </Link>
          <Link href="/terminos" className={`transition-colors ${t.link}`}>
            Términos y condiciones
          </Link>
          <a href="mailto:hola@invibot.com" className={`transition-colors ${t.link}`}>
            hola@invibot.com
          </a>
        </nav>
      </div>
      {/* Quién opera esto, dicho en el sitio. Lo pide la política de nombre
          para mostrar de WhatsApp: el nombre del negocio verificado —Movic
          Technologies— tiene que poder reconocerse desde la marca, y esta
          línea es lo que revisa quien evalúa la solicitud. */}
      <p className={`mx-auto mt-8 max-w-5xl text-xs ${t.muted}`}>
        © {new Date().getFullYear()} Invibot. Hecho en México. Operado por Movic
        Technologies, S.A. de C.V.
      </p>
    </footer>
  );
}

/** Wraps a full page in one tone, including its own header and footer. */
export function SiteShell({
  tone = "paper",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-h-full flex-1 flex-col ${tones[tone].wrap}`}>
      <SiteHeader tone={tone} />
      <main className="flex-1">{children}</main>
      <SiteFooter tone={tone} />
    </div>
  );
}
