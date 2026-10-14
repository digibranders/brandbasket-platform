# Owner replies to directory reviews (2026-10-12)

A business's verified owner can answer the reviews on its public page in the directory, from the dashboard or from the page itself. Free for every verified owner, on any plan (decided with the user, 2026-10-12).

## What the owner can do

- **Reply** to a published review of their own business. One shared list per review: the owner's answers sit with visitors' comments, oldest first, no nesting.
- **Edit** their own answer (it then reads "edited") and **remove** it (the row is hidden, never deleted, so staff can still see and restore it).
- Never touch a visitor's review or comment. Staff moderate owner answers like any other comment (hide / restore) in the console's Comments tab, where they carry an "Owner" tag and no phone number.

## Who is a verified owner

Exactly whoever the Leads page opens leads to (`leadsSource`, apps/platform/lib/leads.ts): a website client with a directory listing staff placed, or an account whose claim on a directory listing Firstfold approved. A pending or turned-down claim, an account awaiting its membership payment and a closing account are not owners. This inherits the claim-approval gap noted in the 2026-10-08 security audit: replies are only as trustworthy as claim approval.

## How an answer is marked

`directory_review_comments.author_kind` is `visitor` or `owner` (migration 0133). An owner row has the signed-in account (`owner_user_id`) and no phone; a visitor row the reverse (CHECK `_author_check`). Publicly an owner's answer is signed with the **business's name** and an **Owner** tag; the account name stays with staff. The tag comes only from the server's ownership check, never from anything the request says. Owner text may be 500 characters (visitors 300).

## Two places, one set of rules

1. **Dashboard** `/reviews` (all menus that have Leads, and Care clients with a claim): unanswered reviews first-class (a "Need a reply" count and filter), reply box open on an unanswered review, "Reply again" on an answered one. Server actions in `app/app-host/(protected)/reviews/actions.ts`.
2. **The public business page**: an owner who is signed in to the dashboard sees "Reply as owner", Edit and Remove. The website cannot sign anyone in (the dashboard's session cookie is httpOnly on the app host), so the owner's **browser calls the platform directly** (`/api/directory-owner/access` and `/replies`, credentials included). The platform decides who the caller is on every call.

Both call the same functions (`apps/platform/lib/server/owner-replies.ts`), which hold every write to the owner's own business: another business's review or answer is simply "not found".

## Security of the browser-called routes

- CORS allows exactly one origin, the website's (`NEXT_PUBLIC_SITE_URL`), with credentials; any other origin, or none, gets 403 before the session is looked at.
- JSON content type only (forces a preflight), 16 KB body cap, strict request shapes.
- The session cookie is same-site between the website and the dashboard (shared parent domain `firstfold.io`; `localhost` locally).
- Rate limits: 30 replies and 60 edits/removals per owner per hour.
- The website's CSP gains the dashboard origin in `connect-src` only.
- The page's check "am I the owner" is only a hint for what to draw.

## Fresh pages

The website caches a business's reviews for 15 minutes. After a post, edit or removal the platform calls the website's `POST /api/directory-refresh` (shared `LEADS_API_TOKEN`, in `after()` so the owner never waits), which expires that business's cache tag. A failed call only means the page catches up on its own.

## Not built

Notifications to the owner of new reviews (needs a registered SMS template or email), pinning the owner's first answer above visitors' comments, replying to a single visitor comment (no threads, by decision), the staff console showing who removed an answer.
