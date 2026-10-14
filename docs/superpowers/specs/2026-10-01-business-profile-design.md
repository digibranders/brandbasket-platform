# Business profile: Details, Photos, Listing, Publish

Date: 2026-10-01. Status: agreed with the user and being built in `login-logo` (branch `feat/login-logo`, dashboard on :3131).

## What the user asked for

A free listing account's first menu item becomes **Business profile**, with tabs:

1. **Details**
   - Business name, address, phone, WhatsApp, directions, and the other necessary details.
   - Plus **Import from Google Business Profile**.
2. **Photos**: the featured photo and video.
3. **Listing**: district → area → category. After that, a **Business ID** is generated and saved to the profile.
4. The owner checks everything, confirms, and **publishes**.

Photos leaves the side menu.

## Decisions

| Question | Answer |
| --- | --- |
| Google import | Sign in with Google (Business Profile API). |
| Video | A YouTube link. We store no video. |
| Publish | The page goes live at once, marked **Claimed**. There is no call from us and no Verified badge. |
| Featured photo | Live at once, like the listing. Staff can still take it down. |
| Checkout | `login-logo`. The Business ID format and the `directory_claims.place_id` column name match `directory-ads` (permanent-id work), so the merge lines up. |

## Side menu (free listing account)

The menu is **Business profile** (`/business`) · Advertise · Billing · Premium. `/photos` now redirects to `/business?tab=photos`.

The two ad pictures (tall and wide) move to the Advertise page. That is the only place they are used, and they keep staff approval.

## The tabs

The page lives at `/business?tab=details|photos|listing|review`. Each tab shows a check mark once it is complete.

- A business that has not been published opens on its first incomplete tab.
- A published business opens on Details.

### Details

**Import from Google Business Profile** sits at the top.

- If `GOOGLE_BUSINESS_CLIENT_ID` and `GOOGLE_BUSINESS_CLIENT_SECRET` are not set, the button reads "Not connected yet" and is disabled.
- Flow:
  1. `/api/google-business/connect` sends the owner to Google with the scope `https://www.googleapis.com/auth/business.manage`. A random `state` is held in an httpOnly cookie.
  2. `/api/google-business/callback` checks `state` and exchanges the code for an access token, which is used once and never stored.
  3. It lists the owner's accounts and their locations, using:
     - the Account Management API `v1/accounts`
     - the Business Information API `v1/{account}/locations`, with `readMask=name,title,phoneNumbers,storefrontAddress,websiteUri,latlng,regularHours,profile`
  4. It keeps up to 5 locations, trimmed to the fields we use, in an encrypted httpOnly cookie (AES-256-GCM, 10 minutes).
  5. It redirects back to Details.
- Details then offers the imported values: a picker when there are several locations, and "Use these details" to fill the form. **Nothing is saved until the owner presses Save.** Saving or discarding clears the cookie.
- The imported phone number, website, hours, description and map pin fill their own fields. The address becomes one line.

Fields:

| Field | Rule |
| --- | --- |
| Business name | Required; same rules as today. |
| Address | Required, one line, up to 200 characters. |
| Phone | Required; Indian mobile or landline, stored as E.164. |
| WhatsApp | Optional. A "Same as phone" tick is on by default. |
| Directions | Optional Google Maps link (`google.com/maps…`, `maps.google.com…`, `maps.app.goo.gl/…`, `goo.gl/maps/…`). When the link carries `@lat,lng`, `q=lat,lng` or `!3d…!4d…`, the map pin is stored too. |
| Website | Optional; same rules as today (`parseListingWebsite`). |
| Opening hours | Optional; the existing `HoursEditor`, saved to `business_hours` like the paying clients' "Your details". |
| About the business | Optional, up to 500 characters. |

### Photos

- **Featured photo**: the existing crop window and the `listing` slot (1:1, 640×640). A new photo goes live straight away and replaces the old one.
- **Featured video**: a YouTube link, stored as the 11-character video id and shown as a thumbnail with a Remove button. Accepted forms: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`, `m.youtube.com`.
- Photos can be added before the business has a listing (the account is a listing account with no claim yet). Refused once staff have taken the business down.

### Listing

The owner picks:

1. **District**: Thane is the only one for now.
2. **Area**: one searchable list across the district, each shown with its town ("Naupada · Thane").
3. **Category**: searchable.

As they pick, the line "Where you'll be listed: `firstfold.io/in/mh/thane/{area}/{category}`" fills in.

- Details must be saved first, because a listing needs the name, address and phone. Otherwise the tab says "Fill in Details first".
- The first save creates the added claim and generates the **Business ID** (`newPlatformPlaceId()`: 7 characters, starts with a digit), stored in `directory_claims.place_id`.
- The page then shows "Business ID **7K2M9QA**". The id is upper-cased only for display.
- The listing can be changed until it is published, and the Business ID never changes.
- After publishing it is locked behind "Request a change". This branch's page addresses still contain the category and area. When the permanent-id work merges, this lock can lift.

### Review & publish

- One summary page: details, photo, video, listing and Business ID, with "Edit" linking to each tab.
- **Publish** is enabled when the name, address, phone, area and category are set. Until then, a list shows what is missing.
- Publishing does all of this in one transaction:
  - sets the claim to `approved`
  - sets `decided_at = now`, `decided_by_user_id` = the owner and `published_at = now`
  - leaves every other field as it is
- Publish is refused when:
  - the owner has confirmed neither their email nor their phone (same rule as staff approval)
  - the claim has been taken down (`rejected`)
- The page goes into the directory feed (`listConfirmedAddedBusinesses` already reads approved added claims).
- After publishing, the status reads "Live · Claimed". Staff can take a page down with the existing Reject on an approved claim.

**Claimed listings** (made from an existing directory page with `/join?id=`) keep today's rule, where staff confirm the claim by phone. That protects other people's businesses. They get the Details extras (WhatsApp, directions, hours, about, video, photo) but no Publish tab.

## Data

Migration 0075 adds the following (it collides with `directory-ads` 0075–0078 and must be renumbered after them at merge; `place_id` is the same column as 0077 there, so at merge that half is dropped and 0077 keeps it):

- **`directory_claims`**
  - `place_id text`, unique when set, matching the place-id pattern.
  - `published_at timestamptz`.
- **`directory_business_profiles`**, one row per business:

  | Column | Type | Notes |
  | --- | --- | --- |
  | `business_id` | uuid | PK, FK businesses |
  | `street_address` | text | |
  | `phone` | text | E.164 |
  | `whatsapp` | text | E.164, null |
  | `maps_url` | text | null |
  | `latitude`, `longitude` | double precision | null, both or neither |
  | `website_url` | text | null |
  | `about` | text | null, ≤ 500 |
  | `youtube_video_id` | text | null |
  | `created_at`, `updated_at` | | |

- **Grants** (0076), following the pattern of 0070:
  - the customer (`webfold_app`) reads its own row through RLS
  - every write goes through the staff connection after the platform has checked the customer

The profile is the single home of the Details fields. When a claim exists, saving Details also updates the claim's copies (`business_name`, `street_address`, `phone`, `website_url`) and `businesses.name`, in the same transaction. The directory feed reads the claim.

## Out of scope (said to the user)

- The website does not show the new extras yet (WhatsApp, directions, hours, about, video). The feed contract and the website's page for added businesses belong to `website-listing` and other sessions. This is the next piece.
- The hashed business URL (`/in/mh/business/{name}/{code}`) belongs to the "Search bar length reduction" session. "View page" keeps this branch's current address until the merge.
- Google's approval for the Business Profile API, and the OAuth keys, come from the user.
