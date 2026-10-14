# Automatic errors implementation plan

**Goal:** Capture browser, boundary and Next server failures in a private native staff inbox without recording sensitive error data.

**Architecture:** Pure strict contracts sanitize classifications, routes and source coordinates before transport. The injected server collector validates origins and bounded bodies, derives identity from the server session, and writes grouped aggregates with expiring idempotency receipts. Next instrumentation and boundaries call fail-safe helpers; private staff pages read only aggregates.

**Tech stack:** Next 16.3, Zod, Drizzle, PostgreSQL and Vitest; existing design tokens and console components.

- [x] Write and run failing privacy-contract tests; implement the allowlist and browser transport.
- [x] Write and run failing injected reporter/collector tests; implement bounded ingestion and server capture.
- [x] Add grouped schema/query storage, approximate signed-in user bitmap and one-day event receipts; provide staff-only RLS fragment to the coordinating agent.
- [x] Wire browser/server Next hooks and error boundaries, following installed Next guides.
- [x] Add staff-authorized paginated issue list/detail and investigating/resolved/ignored transitions with regression reopening.
- [x] Run scoped unit tests, lint, TypeScript and builds; coordinate aggregate verification and review with the parent agent.
