# Customer app v4: rules for every build agent

Read before writing code. Scope: `docs/customer-app-v4/61-customer-app-v4-implementation-plan.md`. Look: `docs/customer-app-v4/60-customer-app-v4-design-system.md`. Visual reference: `docs/customer-app-v4/mock/customer-app-v4-mock.html` (source in `mock/source/`, screens in `screens-a.js`, `screens-b.js`, `screens-c.js`, overlays in `overlays.js`, styles in `style.css`).

Worktree: `/Users/a12345/Desktop/AI/BrandBasket/wt/customer-v4`, branch `customer-v4`. Work only there.

## Hard rules

1. `apps/customer` never imports from `apps/platform`, `@brandbasket/shared/ui/*` or `@brandbasket/shared/styles/*`. You may READ old code in `apps/platform` to port its rules and tests. Port = copy the logic and its tests into `apps/customer/src/features/<name>/rules.ts` (and `rules.test.ts`), adapted. Keep behaviour.
2. Packages are allowed: `@brandbasket/db` (schema, queries, `withTenantScope`, `withUserScope`), `@brandbasket/shared` server and lib modules (money, pricing, charges, add-ons, tax invoicing), `@brandbasket/billing`, `@brandbasket/email`, `@brandbasket/auth`.
3. Every page and every server action calls a guard from `src/lib/guards.ts` itself. Business id comes from the session, never from params or body. Customer data goes through `withTenantScope` / `withUserScope` on the app connection.
4. No screen computes a price, discount, tax or ad credit. Use the shared billing and pricing functions.
5. Every action validates input with zod and returns `ActionResult` from `src/lib/action-result.ts`: `{ ok: true, data? } | { ok: false, message, fieldErrors? }`.
6. No `quietly()` swallow pattern. A loader returns `Loaded<T>` (`{ ok: true, data } | { ok: false, error }`) per panel; the panel shows its error state; the error is reported to Sentry.
7. No fake data in the app. A panel with no real data source is not rendered. Sample data only in tests and fixtures.
8. Migrations are additive only.
9. Light theme only. Tokens only, never raw colours. Geist. Phosphor icons, weight "light".
10. No em dashes or en dashes in any string a person reads, in code comments, or in commit text. Use a colon, a full stop, or brackets.
11. Words: follow plan 60 section 12 (glossary). Prices include GST; never write "+ GST". USD customers see no GST wording.
12. Do not add UI the plan and mock do not show.

## Structure (`apps/customer/src`)

- `app/` routes only. A page: guard, call loader, render a feature screen. `app/(auth)` public entry, `app/(app)` signed-in workspace with the shell.
- `features/<name>/rules.ts` pure logic, no I/O, unit tested. `loader.ts` server only, returns a view model. `actions.ts` "use server", guard, zod, write, return ActionResult. `components/` screens built from `ui/` and `components/`.
- `ui/` primitives (on `@base-ui/react`). `components/` application components. Do not edit `ui/`, `components/`, `lib/` or `styles/` from a feature task: if you need something missing, build it inside your feature folder and say so in your report.

## Checks you run

- `pnpm --filter @brandbasket/customer exec tsc --noEmit` (or `pnpm --filter @brandbasket/customer typecheck`)
- `pnpm --filter @brandbasket/customer exec vitest run src/features/<yours>`
- `pnpm --filter @brandbasket/customer lint` (eslint)
- Do NOT run `next build` or `next dev` (the machine is shared; the lead runs the build). Do NOT commit or push; the lead commits. Do not touch other worktrees or the `brandbasket-platform` checkout.

## Report back

Files created, what is ported from where, tests added and their result, anything you could not finish, any copy (UI text) you wrote that is new and needs owner approval, and anything you had to build locally that belongs in `ui/` or `components/`.
