"use client";

import { createAuthClient } from "better-auth/react";

/**
 * No baseURL on purpose: the client then talks to the origin the page was
 * served from. Hardcoding it through an environment variable means a missing
 * or stale value points the browser at localhost in production, and because
 * NEXT_PUBLIC_ values are inlined at build time that breaks silently until
 * someone tries to sign in.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
