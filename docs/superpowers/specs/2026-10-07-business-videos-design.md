# Business videos: short clips on the business page (Premium)

Date: 2026-10-07, revised 2026-10-08. Status: built and tested end to end in `directory-ads` (platform + admin); the public page is in `website-ads` and being ported onto the newest business page.

## What the user asked for

Each business's page gets a **Photos & videos gallery**. A **Premium member** (a paying client, `businesses.kind = 'website'`) can add up to **3 videos of at most 16 seconds** each from the customer dashboard. Free listing accounts keep their photos and see "Videos are part of Premium". A video goes live on the business page as soon as it is ready, with no staff approval.

## Decisions

| Question | Answer |
| --- | --- |
| Who may add videos | Premium members only, enforced on the server (route, then again inside the database write), never only in the page. |
| How many | 3 per business (slots 1 to 3). A new upload to a slot replaces its video once the new one is ready. |
| Length | At most 16 s (the server accepts up to 16.5 s). The browser checks before sending when it can read the length; the server checks the length Vimeo reports and deletes a clip that is too long. |
| Upload size | At most 50 MB as sent. |
| Where videos live | **Vimeo**, in Firstfold's own account (Starter plan), inside its **"Firstfold" folder** (found by name; with no such folder uploads say "not available" instead of filing videos loose), as unlisted, embeddable, not-downloadable videos. The user chose Vimeo over Cloudflare R2 on 2026-10-08 after comparing price, API access and limits. |
| Who sends the file | The member's browser, straight to Vimeo's upload server (resumable "tus" protocol). Our servers never carry the video, so there is no ffmpeg and no big upload through the droplet. |
| Approval | **None.** Live as soon as Vimeo has prepared it (about 20 to 30 s for a 12 s clip). Staff can **Take down** any video from the Ads page, Videos list; that deletes it from Vimeo too. |
| What visitors see | A poster tile with a play icon and the length; pressing it opens Vimeo's embedded player. Nothing is requested from Vimeo until a visitor presses play. |
| When Premium ends | Videos stop showing publicly (the public read joins `businesses.kind`) and are not deleted. |
| Who can reach a video | Unlisted on Vimeo: only people with its address (which carries a privacy hash) can open it. Starter cannot limit playback to firstfold.io; Standard and above can. |

## The flow

1. **Ask.** The owner picks a file; the page checks size, type and (when the browser can read it) length. `POST /api/listing-videos` with `{ slot, size }` runs the checks (Host, Origin, session, Premium, hourly allowance of 10) and makes an empty unlisted video on Vimeo (`POST /me/videos`, approach `tus`), records a `pending` row, and answers with the one-time upload address. Unfinished uploads of that business older than an hour, and an earlier one in the same slot, are given up and deleted from Vimeo.
2. **Send.** The browser `PATCH`es the file to the upload address with progress (Vimeo's upload server answers CORS for browsers).
3. **Wait.** The page asks `POST /api/listing-videos/<id>/finish` every 3 s (and again after a reload). When Vimeo reports the video available with its length, size, privacy hash and a poster, and the length is within 16.5 s, one locked database write makes it live (`approved`) and removes the slot's old video, which is then deleted from Vimeo. A clip that is too long, unreadable or no longer wanted is deleted from Vimeo and its row dropped, with a message for the owner.
4. **Show.** `GET /api/directory/gallery?ids=…&keys=…` (token, like `/status`) answers per business the owner's gallery photo ids and its live videos as `{ id, embed, poster, seconds, width, height }`: `embed` is `https://player.vimeo.com/video/<id>?h=<hash>&dnt=1&…`, `poster` is on `i.vimeocdn.com`. The website validates both hosts exactly before it renders anything.
5. **Remove.** The owner's Remove (or staff's Take down) deletes the row first, then the video on Vimeo; a Vimeo failure is logged and never undoes the removal.

## Vimeo facts checked (2026-10-08)

- Starter account, API token with `private upload edit delete`: a script uploaded a clip, Vimeo prepared it, reported its length, accepted privacy `unlisted`/embed `public`, and deleted it (all seven steps passed). Vimeo's upload server answers a browser preflight with `Access-Control-Allow-Origin: *`.
- `player_embed_url` for an unlisted video carries the hash (`?h=…`); `pictures.sizes` has a 640×360 poster on `i.vimeocdn.com`.
- The quota Vimeo reported for the account: 2 TB. Vimeo's developer docs list Starter at 5 GB a week and 250 GB a year; when Vimeo refuses an upload for allowance (errors 4101, 4102, 4104) the owner is told to try again in a few days.
- Not verified: behaviour if the subscription lapses, Vimeo's terms for hosting many businesses' videos in one account, playback on iPhone Safari.

## Safety

- The token only ever lives in server env (`VIMEO_ACCESS_TOKEN`, platform and admin). Every address Vimeo gives us is checked before it is passed on: the upload address must be on `*.vimeo.com` over https; a video id must be digits; the embed hash hex; the poster on `i.vimeocdn.com`.
- The browser sends the file with no cookies (`withCredentials` false).
- The dashboard's content security policy allows exactly `player.vimeo.com` (frames), `i.vimeocdn.com` (images) and `*.upload.vimeo.com` (connections); the website's allows the player and posters.

## Out of scope for now

- Trimming a too-long clip in the browser (the owner is told the limit instead).
- Banner and the featured YouTube link on the public page (separate; the YouTube link stays for everyone).
- Deleting videos of lapsed members after a grace period.
- Cleaning up empty placeholders of businesses that start an upload and never return (the platform removes them the next time that business starts one).
