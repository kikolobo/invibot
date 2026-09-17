import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
