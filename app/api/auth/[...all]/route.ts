import { auth } from "@/lib/auth";

/**
 * Handlers delegate on each request rather than destructuring `auth.handler`
 * at module scope, which would build the auth instance — and so require
 * DATABASE_URL — while Next collects page data at build time.
 */
export const GET = (request: Request) => auth.handler(request);
export const POST = (request: Request) => auth.handler(request);
