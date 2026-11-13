# Feature agent brief (customer app v4)

Read `BUILD-RULES.md` first. Then plan 61 section 4 (screen contract for your screens), section 5 (logic to carry over), and your feature's section in `PARITY.md` (old files, actions, behaviours, old loaders that show a wrong screen on error). Where PARITY.md and plan 61 disagree, verify in the old code; the old behaviour wins unless plan 61 explicitly changes it.

## What already exists (code against it, do not edit it)

- Guards `@/lib/guards`: `requireSignedIn`, `requireCustomer`, `requirePaid(opts?)`, `requireBilling`, `requireOwner(opts?)`, `requireWebsite(opts?)`, `requireService(service, opts?)`, `requireAffiliate`. `opts.write: true` needs a live paid period. Context: `{ user, tenant, businessId, businessName, role, billing, services, currency }`. Pass `tenant` to `withTenantScope`. Role can be `owner | editor | viewer`: hide write actions from viewers (the database refuses viewer writes anyway).
- `@/lib/db`: `getAppDb()` (RLS, customer work), `getStaffDb()` (only for documented exceptions; add a one-line justification comment if you must), `getPublicDb()`.
- `@/lib/loaded`: `load(area, fn)` returns `Loaded<T>`. Each panel loads independently. A failed read shows the panel's error state, NEVER a wrong screen (old loaders showed "no preview yet" or "book your kickoff" on a database error: do not repeat that).
- `@/lib/form` `parseForm(schema, formData)`, `@/lib/action-result` `actionOk`, `actionFail`. `@/lib/format` for every money, date, number (lint bans Intl and toFixed elsewhere).
- `@/ui`: Button, IconButton, LinkButton, Field, Input, Textarea, PhoneInput, Select, Combobox, Checkbox, RadioGroup, Radio, RadioCard, Switch, Chips, Segmented, TabLinks, Tabs, Pagination, Badge, ServiceTag, Avatar, Kbd, Skeleton, Banner, EmptyState, Meter, FileDrop, Icon (registry: if you need an icon not in `ICON_NAMES`, add it to `src/ui/icon.tsx` registry only, nothing else in ui/), Dialog, Sheet, AlertDialog, Menu, Popover, Tooltip, useToast, Table parts.
- `@/components`: PageHeader, Panel, PanelData (renders Loaded with error/empty/asOf), PanelEmpty, PanelError, PanelLoading, MetricStrip, Delta, DataTable (client; `inspect` opens a Sheet via `?open=id`, or `rowHref`), FilterBar (URL state), NextStep, Stepper, TimelineSteps, StatusBadge, ServiceMark, SaveBar, LineChart, Sparkline, BarList. Read `src/components/index.ts` and the component file for exact props.
- Shell is done: `src/app/(app)/layout.tsx` renders it. Your pages go under `src/app/(app)/<route>/page.tsx`, each calling its own guard.
- Database helpers in `@brandbasket/db` (schema, queries, `withTenantScope`, `withUserScope`, new: enquiries, website pages, connected accounts, notification preferences and reads, business invites). Shared money and billing in `@brandbasket/shared` server modules and `@brandbasket/billing`.
- Private databases for this worktree: `brandbasket_platform_v4` and `_test` (env in `apps/platform/.env.local`). Only run integration tests if you touch `packages/*`, and avoid touching packages.

## Rules for parallel work

- You own only: `src/features/<your features>/**` and `src/app/(app)/<your routes>/**` listed in your task. Do not edit other features, `src/ui` (except the icon registry), `src/components`, `src/lib`, `src/styles`, the shell, `package.json`. If you need a shared component that does not exist, build it inside your feature and say so.
- Need logic from `apps/platform/lib/server`? Port it into your feature (`rules.ts` for pure logic with its tests; `loader.ts` and `actions.ts` for I/O). Do not import from apps/platform (lint fails).
- Server pages pass data to client components; DataTable and charts are client components.
- Follow the mock for layout and words: `docs/customer-app-v4/mock/source/screens-*.js`, `overlays.js`. Words from the mock are approved. Any other new words: list them in your report.
- Not bought: a service page for a service the customer has not bought shows the Not bought screen (plan 61 section 4: two sentences, what is included, price with the package discount from shared pricing, Add to plan linking to `/billing?add=<service>`). No fake dashboard preview.

## Checks

`pnpm --filter @brandbasket/customer typecheck`, `pnpm --filter @brandbasket/customer exec vitest run src/features/<yours> src/app`, `pnpm --filter @brandbasket/customer lint`. Other agents' files may have transient errors; make sure none are yours. No next build or next dev. No commits.
