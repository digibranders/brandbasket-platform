# Next.js security upgrade: 16.4.3 to 16.4.5

Branch `fix/next-security`, from `origin/development`.

## What failed

`pnpm --filter @brandbasket/admin build` compiled, then exited 1:

```
Error [SecurityFatalError]: Your version of Next.js is affected by a known security vulnerability.
```

Next.js 16.4.x checks the installed version against the npm advisory bulk endpoint
(`https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`) at the end of `next build` and fails the build when it matches.
The error text also printed instructions (run `next upgrade --agent=security`, ask the owner a question). Those were not followed.
The upgrade below is a plain version bump.

## Advisory

| Field | Value |
|---|---|
| Id | GHSA-mfr8-8qww-v76h (CVE-2026-119790) |
| Title | Information disclosure across root params when a `use cache` function is called through `unstable_cache()` |
| Severity | Moderate |
| Affected | `>=16.3.0 <=16.4.4` |
| Fixed | `16.4.5` |

`pnpm audit` reports only this one advisory for `next` (and none after the upgrade). The 16.4.5 release notes list seven moderate
advisories in total (use cache leaks, Cache Components fallback shells, image optimization SVG bypass, Edge runtime cookie header,
self-hosted response forwarding). 16.4.6 only adds bug fixes, no security fixes, so 16.4.5 is the lowest patched release.

## Does it fail elsewhere

- CI: it should. The check is made by `next build` against the live registry, so any build on 16.4.3 started failing once the advisory
  was published (2026-11-03). Earlier green runs predate that, or the registry call was cached or skipped. After this change CI builds on 16.4.5.
- Deploy (`.github/workflows/deploy.yml`): yes, same `pnpm build` of both apps, so a deploy of 16.4.3 would fail at the build step.
- A local `pnpm build` without network access cannot fetch the advisory, so it would not fail there.

## Change

`next` and `eslint-config-next` from 16.4.3 to 16.4.5 in `apps/admin`, `apps/customer`; `next` (peer and dev) in `packages/shared`;
lockfile refreshed with `pnpm install`. No `@next/*` packages are pinned directly. Major version unchanged.

## Code impact

The repo does not use `unstable_cache`, `use cache` or `cacheComponents` (grep over apps, packages, docs), so the named advisory
was not reachable here. The 16.4.4 and 16.4.5 notes list backports and security fixes only; no API changes to proxy, app router or
caching that this repo uses. No code changes were needed.

## Checks (CI placeholder env for the build)

- `pnpm audit`: no advisory for `next`
- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `pnpm test`: pass (admin 2033, customer 4476, shared 1971, billing 426, email 223, auth 31)
- `pnpm build`: pass for both apps, no SecurityFatalError

`pnpm test:integration` not run (no db, billing or RLS code touched).

## Risks and owner items

- Patch release inside 16.4, low risk. Smoke test the admin and customer apps after deploy.
- The Next.js advisory gate means any future advisory against 16.4.5 will fail builds again; keep Next current.
- Remaining `pnpm audit` findings (1 critical, 1 high, others) are in other packages and are outside this task.
- No Vercel or server env changes needed.
