/**
 * Test stub for the `server-only` package.
 *
 * The real package throws when imported outside a React Server Component build
 * (it has no Node entry point). Under vitest we run server modules — the F6
 * service_role db client and the worker — directly in Node, so this no-op stub
 * is aliased in `vitest.config.ts`. It does NOT weaken the production guard:
 * the real `server-only` still protects the client bundle in `next build`.
 */
export {};
