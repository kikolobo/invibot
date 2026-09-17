import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The pass renderer reads this font at runtime to convert text to outlines.
  // Nothing imports it, so tracing cannot see it, and without this the webhook
  // ships without a font and every pass prints empty boxes.
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": ["./lib/passes/fonts/*.ttf"],
  },
  experimental: {
    serverActions: {
      // Invitation cards go up through a Server Action and WhatsApp allows 5 MB
      // images; the 1 MB default would reject most of them before validation
      // had a chance to say anything useful.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
