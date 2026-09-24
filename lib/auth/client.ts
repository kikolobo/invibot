"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

/**
 * No baseURL on purpose: the client then talks to the origin the page was
 * served from. Hardcoding it through an environment variable means a missing
 * or stale value points the browser at localhost in production, and because
 * NEXT_PUBLIC_ values are inlined at build time that breaks silently until
 * someone tries to sign in.
 */
export const authClient = createAuthClient({
  // Mirrors `user.additionalFields` in the server config, spelled out rather
  // than inferred from it so this client bundle never imports server code.
  plugins: [inferAdditionalFields({ user: { phone: { type: "string", required: false } } })],
});

export const { signIn, signUp, signOut, useSession } = authClient;
