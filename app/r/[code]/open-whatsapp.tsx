"use client";

import { useEffect } from "react";

/**
 * Sends the visitor on to WhatsApp.
 *
 * `replace`, not `assign`: this page exists only to be passed through, and
 * leaving it in history means the back button lands here and bounces the
 * person forward again.
 *
 * The redirect is client-side on purpose. A server redirect would take the
 * link-preview crawler with it, and the preview would be built from `wa.me`'s
 * own Open Graph tags instead of ours — which is exactly what used to happen.
 * Crawlers do not run this.
 */
export function OpenWhatsApp({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return null;
}
