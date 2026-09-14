import type { Metadata } from "next";
import { Geist, Cormorant_Garamond } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://invibot.com"),
  title: {
    default: "Invibot — Invitaciones que responden solas",
    template: "%s · Invibot",
  },
  description:
    "Crea invitaciones para tu evento, envíalas por WhatsApp y deja que un asistente confirme la asistencia y responda las dudas de tus invitados.",
  openGraph: {
    title: "Invibot — Invitaciones que responden solas",
    description:
      "Invitaciones por WhatsApp con confirmación automática de asistencia.",
    url: "https://invibot.com",
    siteName: "Invibot",
    locale: "es_MX",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-MX"
      className={`${geistSans.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <header className="px-6 py-6 sm:px-10">
          <Link
            href="/"
            className="font-display text-2xl tracking-tight text-ink hover:text-accent transition-colors"
          >
            Invibot
          </Link>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line px-6 py-10 sm:px-10">
          <div className="mx-auto flex max-w-5xl flex-col gap-6 text-sm text-ink-muted sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xs">
              <p className="font-display text-xl text-ink">Invibot</p>
              <p className="mt-2 leading-relaxed">
                Invitaciones digitales y confirmación de asistencia por WhatsApp.
              </p>
            </div>
            <nav className="flex flex-col gap-2">
              <Link href="/privacidad" className="hover:text-accent transition-colors">
                Aviso de privacidad
              </Link>
              <Link href="/terminos" className="hover:text-accent transition-colors">
                Términos y condiciones
              </Link>
              <a
                href="mailto:hola@invibot.com"
                className="hover:text-accent transition-colors"
              >
                hola@invibot.com
              </a>
            </nav>
          </div>
          <p className="mx-auto mt-8 max-w-5xl text-xs text-ink-muted">
            © {new Date().getFullYear()} Invibot. Hecho en México.
          </p>
        </footer>
      </body>
    </html>
  );
}
