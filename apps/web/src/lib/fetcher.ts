// Narrower than `typeof fetch` — nitro's Vercel runner types ambiently pull in bun-types, which adds a `preconnect` static method plain test mocks don't implement.
export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
