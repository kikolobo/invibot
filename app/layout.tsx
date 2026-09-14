import type { Metadata } from "next";
import { Geist, Cormorant_Garamond } from "next/font/google";
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
      {/* Each page owns its own chrome via <SiteShell>, so variants can diverge
          completely in palette instead of fighting a shared header and footer. */}
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
