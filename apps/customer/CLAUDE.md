# apps/customer: customer app v4

The new customer app (plan 61). It replaces apps/platform's customer pages at cutover; until then it runs on its own host
(local http://localhost:3197, staging next.brandbasket.in). Repo-wide rules are in `../../CLAUDE.md`.

Read before writing code, in this order:

1. `docs/customer-app-v4/BUILD-RULES.md`: the binding rules for every task.
2. `docs/customer-app-v4/61-customer-app-v4-implementation-plan.md`: scope, route map, screen contracts, phases.
3. `docs/customer-app-v4/60-customer-app-v4-design-system.md`: the look (see `DESIGN.md`).

## Layout of `src/`

| Folder | Holds |
|---|---|
| `app/` | Routes only. A page calls its guard, a loader, and renders a feature screen. `(auth)` public entry, `(app)` the signed-in workspace |
| `features/<name>/` | `rules.ts` (pure, tested), `loader.ts` (server only, returns `Loaded<T>` per panel), `actions.ts` (guard, zod, `ActionResult`), `components/` |
| `ui/` | Primitives on `@base-ui/react`, exported from `@/ui`. Preview at `/design-system` (development only) |
| `components/` | Application components built from `ui/` |
| `lib/` | `guards.ts`, `db.ts`, `session.ts`, `auth.ts`, `action-result.ts`, `loaded.ts`, `form.ts`, `format.ts`, `report.ts` |
| `styles/` | `tokens.css` (the only colour values), `globals.css` (Tailwind v4 mapping, type and motion utilities) |

## Rules that the code enforces

- Lint refuses imports of `apps/platform`, `@brandbasket/shared/ui/*` and `@brandbasket/shared/styles/*`; Phosphor outside
  `ui/icon.tsx`; other component, icon and chart libraries; product code inside `ui/`; raw colours, palette classes,
  off-scale spacing and (outside `ui/`) arbitrary values in classes; `Intl`, `toFixed` and `toLocaleString` outside
  `lib/format.ts`.
- `src/copy.test.ts` fails on em and en dashes and on "GST added on top" text in any source file.
- `src/styles/tokens.contrast.test.ts` fails when a token pair drops below its WCAG ratio.
- Every page, route handler and action calls a guard from `@/lib/guards` itself. The business comes from the session.
- Customer data goes through `getAppDb()` inside `withTenantScope` / `withUserScope`. `getStaffDb()` only for the
  exceptions listed in `lib/db.ts`.

## Commands (from this folder)

```bash
pnpm typecheck     # next typegen + tsc
pnpm test          # vitest (happy-dom)
pnpm lint
pnpm dev           # next dev -p 3197, with .env.local from .env.example
```

Build agents do not run `next build` or `next dev` on the shared machine, and do not commit (BUILD-RULES).
