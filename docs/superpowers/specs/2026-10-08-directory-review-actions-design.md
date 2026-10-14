# Directory review actions: Helpful, Comment, Share (design)

Date: 2026-10-08. Status: asked for by the user in chat with a reference picture (stars, then Helpful, Comment, Share
under each review); the Comment rule ("phone code like reviews") and building it across both repos, uncommitted, were
chosen by the user.

## Goal

Every review on a business page (`/in/mh/business/<name>/<code>`) gets the row under it that the reference shows: its
five stars, then **Helpful**, **Comment** and **Share**.

- **Helpful**: a visitor says the review helped. Shows a count.
- **Comment**: a visitor replies under the review. Confirmed by a texted code, like writing a review.
- **Share**: the review's own address (the business page at `#review-<id>`), through the phone's share sheet or copied.
  Not counted: the ranking counts shares of a business's profile, and a review is not the profile.

Out of scope: replies from the business owner, editing or deleting your own comment, notifying the reviewer, and
reporting a comment (staff hide one from the console).

## Rules

- **Helpful** counts once per visitor address and review per week (7 days). The only trace of the visitor is a
  rate-limit bucket keyed by an HMAC of their address and the review, which expires by itself; nothing is stored about
  them. Marking it again answers with the current count. A visitor address may mark at most 60 an hour (a bot).
  The page keeps no cookie or storage for it, so a reload shows the count but not that you marked it.
- A review that is written again by the same phone (a re-review) starts at 0 Helpful: the words are new. Its comments
  stay.
- **Comment**: 1 to 300 characters, name 1 to 60 (shown as first name and initial), a phone number confirmed by a
  6-digit code (10 minutes, 5 tries, the review code's rules, `BOOKING_OTP_BYPASS` applies). The code request is
  rate-limited per address (10 an hour), per phone (3 in 10 minutes, 8 a day), per review (30 a day) and overall (500
  a day). A honeypot field gets a convincing fake success. Only a published review takes a comment.
- A review shows its latest 20 comments, oldest first, with the count of all of them.
- Staff can hide and restore a comment (Directory, Comments); a hidden comment stops showing. A hidden review hides
  its comments with it.
- A review's code never publishes a comment and a comment's never publishes a review.

## Data (migration 0108, grants 0109)

- `directory_reviews.helpful_count` integer, default 0, never below 0.
- `directory_review_comments`: id, review_id, commenter_name, phone, text, status (`published` | `hidden`), hidden_at,
  hidden_by_user_id, created_at. Staff-only, no DELETE (like reviews).
- `directory_review_otps.review_id`: set when the code is for a comment on that review (the row also carries the
  review's own business, which the table requires); null for a review's code. The payload is `{commenterName, text}`.

## API (platform, server-to-server with `LEADS_API_TOKEN`; contract in `lib/directory-api.ts`, additive)

| Method + path | Body | Response |
|---|---|---|
| `GET /api/directory/reviews` | (as before) | each review also has `helpful`, `commentCount`, `comments: [{id, name, text, createdAt}]` (all optional in the contract, so an older platform still reads) |
| `POST /api/directory/reviews/helpful` | `{reviewId, clientIp}` | `{status: "counted", helpful}` or error (`invalid` for a review that is gone, `limited`, `failed`) |
| `POST /api/directory/reviews/comments/otp` | `{reviewId, text, name, phone: {country, number}, website: "", clientIp}` | like `/reviews/otp` |
| `POST /api/directory/reviews/comments/confirm` | `{otpId, code, clientIp}` | like `/reviews/confirm` |

## Website

`ReviewsList` (components/local/business-page.tsx) draws the stars and, for the platform's own reviews (not the local
demo's stand-ins), `ReviewActions` (components/local/review-actions.tsx): three actions a third of a row each from a
tablet up and spread across a phone's width, and the conversation (comments and the form) opening under them. The
form is the review form's two steps (`CodeStep` is shared). Helpful and the comment steps are server actions
(lib/server/directory-actions.ts) that clear the business's cached reviews so the next load shows them.

## Before this goes live

- **DLT**: the comment code is a new SMS template (`commentOtpMessage`). India's DLT rules need it registered
  word for word, as the review's was, before a provider is switched on. Until then production has no SMS provider and
  a comment code answers "unavailable", exactly like a review's.
- Platform first, website second: the website sends the new routes' requests as soon as it is deployed.
