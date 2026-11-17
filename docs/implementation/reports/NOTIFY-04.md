# NOTIFY-04: web push (package N4)

Branch `claude/notify-04-push-6a5c8b`, stacked on `claude/notify-01-foundation-324d17` (PR 214, unmerged). Spec: `docs/notifications/03-build-plan.md` section "N4 Push" and the "Push design" table in `02-target-matrix.md`. No migration: N1's `push_subscriptions` is used as is.

## What changed

- **Real sender** (`packages/shared/src/server/web-push-sender.ts`, `web-push` 4 added to `@brandbasket/shared`). Looks up live subscriptions (one customer, or every staff browser for a staff target), sends the same short payload to each, sets `last_success_at`, sets `revoked_at` on a 404 or 410, and throws after the loop when other errors happened so `notify()` reports them. The subscription row is the opt-in; `notify()` has already checked the person's Push choice (mandatory and staff events skip it), so the sender does not read preferences again.
- **Wired in** `createDefaultNotifier`: the real sender when `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are all set, the fake sender otherwise (so development and tests never push). `PushMessage` gained an optional `event` so the sender can apply quiet hours.
- **Quiet hours**: customers 21:00 to 08:00 India time, except `billing.payment_failed`. Staff pushes are never held. A held push is dropped, not deferred (no queue exists and no migration was allowed); the bell and email carry the event.
- **Collapse by tag**: the tag travels in the payload and the service worker passes it to `showNotification`, so a repeat replaces the one on screen. The web-push `topic` header is not used (it allows only 32 URL-safe characters; our tags contain dots).
- **Env**: names added with empty values to both `.env.production.example` files. `pnpm env:check` warns when none are set (push off), fails when only some are set, fails when `NEXT_PUBLIC_VAPID_PUBLIC_KEY` differs from `VAPID_PUBLIC_KEY`, and fails when the keys differ between the two apps' files (either app can send to the other's browsers).
- **Public key to the browser**: pages read `VAPID_PUBLIC_KEY` (or the `NEXT_PUBLIC_` name) on the server at request time and pass it as a prop, so a build made without the `NEXT_PUBLIC_` value still works.
- **Service worker, manifest, icons** in both apps: `public/sw.js` (same file, tested identical), `public/manifest.webmanifest` (standalone), `public/icons/` with the 192, 512 and maskable 512 PNGs copied from `brand/web-assets` (Soft bB mark, checked by eye). `/sw.js` is served `no-cache` with `Service-Worker-Allowed: /`. Layouts link the manifest. The worker opens only same-origin addresses.
- **Console proxy** (`apps/admin/proxy.ts`): the matcher now skips `sw.js`, `manifest.webmanifest` and `icons/`, with a matcher test. Customer middleware only sets a header and never blocks; a test confirms these paths pass.
- **CSP**: no change needed. With no `worker-src`, `child-src` or `manifest-src` the browser falls back to `'self'`; a test pins that.
- **Opt-in UI**: customer Settings, Notifications has a "Notices on this device" switch above the table; the browser permission is requested only after the click. Home shows one prompt once the plan is paid (not while a payment is due, under review or lapsed), with "Turn on notices" and "Not now" (remembered in this browser). Console Settings has one switch ("Notices on this browser"). Shared hook `packages/shared/src/lib/use-push-device.ts`; switch state is read from the browser's own subscription.
- **Server actions**: `savePushDeviceAction` and `removePushDeviceAction` in each app, zod validated, person taken from the session. Save runs on the staff connection because an endpoint is unique across everyone, so a browser another person used holds a row the customer connection cannot see (it moves to the person who subscribes last). Customer removal uses `withUserScope`. The endpoint is a URL our server posts to, so only these hosts are accepted: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com` (https, no port, no credentials).

## Results

| Check | Result |
|---|---|
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | pass (customer: 2 tests failed only because my shell set `CLIENT_SITE_BASE_DOMAIN` and origins; both pass with those unset) |
| `pnpm build` | pass (the admin build once stopped on a Next.js security advisory notice; a retry passed. The Next.js version is flagged by the npm advisory feed: worth a separate upgrade decision) |
| Integration | push subscriptions, notifications foundation, erasure and export: 53 passed; `packages/shared` integration: 291 passed. The full `pnpm test:integration` run was killed in `packages/db` (exit 137, two 60 second timeouts in `directory-ads`, a file this package does not touch) |

Own databases: `brandbasket_platform_n4` and `_n4_test`.

## New strings (for the owner)

Customer:
- Switch label: "Notices on this device"
- Note under it: "On iPhone this needs Brandbasket added to your Home Screen."
- Home prompt: "Get a notice on this device when something needs you." Buttons: "Turn on notices", "Not now".

Console:
- Section "Notices on this browser", aside "Only you"; switch "Notices on this browser"
- Hint: "You get a notice here for calls, new requests and anything staff need to look at."
- When no key is set: "Push is not set up on this server."

Both apps:
- Blocked: "Notifications are blocked for this site in your browser. Allow them in the browser's site settings, then try again."
- Unsupported: "This browser cannot show notifications from a website."
- iPhone: "On iPhone, add Brandbasket to your Home Screen first, then open it from there and turn this on."
- Failures: "We could not turn notifications on. Please try again in a moment." and "We could not turn notifications off. Please try again in a moment."
- Manifest: "Brandbasket", "Brandbasket staff console" (short name "Console").

## Open questions and what could not be tested

1. **Real browsers and keys.** No VAPID keys were used and no push left the machine. Registration, the permission prompt, delivery, tap to open, the iPhone home screen flow and the 404 or 410 path against a real push service are untested. Unit tests cover the hook with a stubbed browser and the sender with a stubbed transport.
2. **Cloudflare Access** must bypass `/sw.js`, `/manifest.webmanifest` and `/icons/*` on console.brandbasket.in. The proxy no longer checks them, but Access sits in front of it. Owner action.
3. **VAPID keys**: generate one pair (`npx web-push generate-vapid-keys`), set the same three values in both apps' production files, plus `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
4. **Push columns default off** in the notification table, so the device switch alone delivers only "Always sent" events (payment failed and the like) until a person turns topics on. Defaults were not changed; owner decision whether turning the device switch on should also switch the topic Push columns on.
5. **Dropped, not deferred**: customer pushes in quiet hours are lost (the bell and email still carry them). Deferring needs a queue.
6. **Allowed push hosts** are a short list; a browser using another push service would be refused until added.
7. The Home prompt sits above the page header; where it should sit is a design call.
8. The console switch is a native switch checkbox, as the console has no switch component.
