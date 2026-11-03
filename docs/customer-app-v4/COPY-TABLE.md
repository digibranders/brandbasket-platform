# Customer app v4: new wording for owner approval (plan 61, gate G9)

Every user-visible string in `apps/customer/src` that is **not** already in the old app (`apps/platform`, plus the shared `packages/*` it used) or in the approved mock (`docs/customer-app-v4/mock/source/*.js`). Tick **Approve** when the wording is fine; leave unticked and comment where it is not.

- Total rows: 507. Per screen: Sign in and sign up 23, Checkout 12, Home 67, Enquiries 37, Requests 36, Website 29, Blog 62, Social & Ads 32, Local SEO + AEO 12, Reports 8, Business profile 11, Plan & billing 48, Settings 60, Help & calls 17, Shell (sidebar, menus, bell, search, banners) 19, Errors and empty states 11, Affiliate portal 23.
- Paths are relative to `apps/customer/` (`src/...`). When one string sits in several files, the first three are listed.
- `{name}` marks a dynamic part (a date, amount, count, name). Where the code builds the dynamic part from a longer expression, the Replaces / note column shows it.
- "Panel error noun" rows finish the sentence "We could not load ____." (see Errors and empty states).
- A string counts as old when the same text, case and punctuation included, exists in the old app or the mock. A different case, a changed word or a changed sentence ending counts as new, and the old line is quoted under "Replaces".
- Left out: test files, code comments, the dev-only `/design-system` page, console logs and developer errors that are thrown but never shown, class names, headers and routes.
- Emails: the new app sends no email text of its own. Customer emails use the shared templates in `packages/email`, which are unchanged. The one subject set in the app (`Reset your {brand} password`) already exists in the old app.
- Em or en dashes in quoted old text are written as "(em dash)" and "(en dash)" so this file stays dash free.

## Rule flags (house rules)

| Approve | String | File:line | Rule broken |
|---|---|---|---|
| [ ] | `{used} Unlock {posts} more for {amount} to keep writing.` | `src/features/blog/components/posts-screen.tsx:27` | HYPE: "Unlock" |
| [ ] | `Unlock more posts` | `src/features/blog/components/unlock-posts-button.tsx:18` | HYPE: "Unlock" |
| [ ] | `Your ad spend is paid on top` | `src/features/setup/rules.ts:91` | WATCH: "paid on top" is about ad spend, not GST; owner to confirm it does not read as GST on top |
| [ ] | `You've used all {allowance} of your blog posts. Unlock {posts} more from your blog page.` | `src/features/blog/rules/posts.ts:271` | HYPE: "Unlock" (text already existed in the old app, so it counts as approved, listed so the rule is applied once) |

Checked and clean: no em or en dashes in any string (`src/copy.test.ts` enforces it), no "+ GST" and no "GST added on top" text, and every new GST string is gated to rupee plans (`taxRateBasisPoints > 0`, `currency === "INR"`, or the `taxed` flag). Billing details (the GST invoice wording) load as null for non-rupee businesses, so a dollar customer never sees them.

## Sign in and sign up (23)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Description | `Use the email or mobile number you signed up with.` | `src/app/(auth)/login/page.tsx:25` |  |
| [ ] | Title | `Choose a new password.` | `src/app/(auth)/reset-password/[token]/page.tsx:18` | Reworded from "Choose a new password" (old: app/app-host/reset-password/[token]/page.tsx:9) |
| [ ] | Title | `Welcome back` | `src/app/(auth)/restore-account/page.tsx:28` | Reworded from "Welcome back." (old: components/panel/unpaid-home.tsx:20) |
| [ ] | Title | `This link no longer works.` | `src/app/(auth)/setup/[token]/page.tsx:22` | Reworded from "This link no longer" (old: app/app-host/affiliate/setup/[token]/page.tsx:31) |
| [ ] | Title | `Try this link again soon.` | `src/app/(auth)/setup/[token]/page.tsx:33` | Reworded from "Try this link again" (old: app/app-host/affiliate/setup/[token]/page.tsx:48) |
| [ ] | Title | `Create your account` | `src/app/(auth)/signup/page.tsx:18` |  |
| [ ] | Title | `Create your account.` | `src/app/(auth)/signup/page.tsx:42` |  |
| [ ] | Title | `This invitation link is not valid.` | `src/app/invite/[token]/page.tsx:23` |  |
| [ ] | Title | `You have been invited to join a team.` | `src/app/invite/[token]/page.tsx:33` |  |
| [ ] | Description | `Sign in with the email address the invitation was sent to, or create an account with it.` | `src/app/invite/[token]/page.tsx:33` |  |
| [ ] | Title | `Join the team.` | `src/app/invite/[token]/page.tsx:46` |  |
| [ ] | Text | `You are signed in as {email}. The invitation only works for the address it was sent to.` | `src/app/invite/[token]/page.tsx:46` |  |
| [ ] | Text | `Not the right address?` | `src/app/invite/[token]/page.tsx:49` |  |
| [ ] | Title | `Join a team` | `src/app/invite/[token]/page.tsx:9` |  |
| [ ] | Label | `Your posts and ads` | `src/features/entry/components/auth-art.tsx:10` |  |
| [ ] | Label | `Found on Google` | `src/features/entry/components/auth-art.tsx:11` |  |
| [ ] | Text | `Before They Visit You, They Visit Your Website.` | `src/features/entry/components/auth-art.tsx:6` |  |
| [ ] | Text | `If {typed} has a {shortName} account, we've emailed it a link to choose a new password.` | `src/features/entry/components/forgot-password-form.tsx:23` | Reworded from "account, we've emailed it a link to choose a new password." (old: components/panel/forgot-password-form.tsx:46) |
| [ ] | Text | `If {typed} has a {shortName} account, we've emailed a link to choose a new password to the email address on it.` | `src/features/entry/components/forgot-password-form.tsx:24` | Reworded from "account, we've emailed a link to choose a new password to the email address on it." (old: components/panel/forgot-password-form.tsx:47) |
| [ ] | Title | `Almost there.` | `src/features/entry/components/no-business.tsx:8` |  |
| [ ] | Text | `Verify your {shortName} account to finish linking this invite.` | `src/features/entry/components/setup-form.tsx:40` | Reworded from "account to finish linking this invite." (old: components/panel/setup-form.tsx:123) |
| [ ] | Text | `We emailed a {OTP_LENGTH}-digit code to {emailHint}. It works for 10 minutes. Nothing there? Check your spam folder.` | `src/features/entry/components/sign-up-form.tsx:117` | Reworded from ". It works for 10 minutes. Nothing there? Check your spam folder." (old: components/panel/join-form.tsx:387) |
| [ ] | Text | `Test mode: enter any {OTP_LENGTH} digits to continue with {emailHint}.` | `src/features/entry/components/sign-up-form.tsx:118` |  |

## Checkout (12)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Text | `We couldn't save your billing details just now. Please try again in a minute.` | `src/features/checkout/actions.ts:28` | Reworded from "We couldn't open your payment just now. Please try again in a minute." (old: lib/keep-plan-copy.ts:7) |
| [ ] | Text | `Enter the code again.` | `src/features/checkout/actions.ts:72` |  |
| [ ] | Label | `No state matches.` | `src/features/checkout/components/billing-fieldset.tsx:131` |  |
| [ ] | Label | `Show states` | `src/features/checkout/components/billing-fieldset.tsx:132` |  |
| [ ] | Label | `Address line 2 (optional)` | `src/features/checkout/components/billing-fieldset.tsx:99` |  |
| [ ] | Text | `Only the owner of this account can pay. Ask them to sign in and finish the checkout.` | `src/features/checkout/components/checkout-screen.tsx:44` |  |
| [ ] | Text | `Confirming payment…` | `src/features/checkout/components/razorpay-checkout.tsx:72` |  |
| [ ] | Text | `We couldn't reach the payment provider. This can happen if an ad blocker or privacy extension is active. Please email us at` | `src/features/checkout/components/razorpay-checkout.tsx:82` | Reworded from "We couldn't reach the payment provider (em dash) this can happen if an ad blocker or privacy extension is active. Please email us at" (old: components/panel/razorpay-checkout-launcher.tsx:91) |
| [ ] | Text | `Payment not confirmed` | `src/features/checkout/components/test-checkout.tsx:47` |  |
| [ ] | Text | `Includes {amount} of GST at {percent}` | `src/features/checkout/loader.ts:108` | Reworded from "of GST at" (old: components/panel/membership/checkout-ledger.tsx:221) |
| [ ] | Panel error noun | `your prices` | `src/features/start/components/start-screen.tsx:49` |  |
| [ ] | Text | `Only the owner or an editor can change this.` | `src/features/start/rules.ts:17` |  |

## Home (67)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Title | `Setup checklist` | `src/app/(app)/checklist/page.tsx:21` |  |
| [ ] | Panel error noun | `your checklist` | `src/app/(app)/checklist/page.tsx:26`, `src/features/home/components/panels.tsx:273` |  |
| [ ] | Description | `Anything we need from you will show here.` | `src/app/(app)/checklist/page.tsx:28` |  |
| [ ] | Error or refusal | `Only the owner or an editor can add images.` | `src/app/(app)/checklist/upload/route.ts:24` |  |
| [ ] | Text | `Add a phone number or an email your customers can use.` | `src/features/checklist/actions.ts:52` | Reworded from "A phone number or email your customers can use" (packages/shared/src/lib/onboarding/checklist.ts:37) |
| [ ] | Text | `That domain is already connected to another website. Tell us in Requests and we'll sort it out.` | `src/features/checklist/actions.ts:54` | Reworded from "That domain is already connected to another website. Email us and we'll sort it out." (old: lib/move-domain-state.ts:9) |
| [ ] | Text | `Choose a logo` | `src/features/checklist/components/brand-form.tsx:112` |  |
| [ ] | Text | `JPG, PNG or WebP. Large images are shrunk to {MAX_UPLOAD_SIZE_LABEL} or less.` | `src/features/checklist/components/brand-form.tsx:113` |  |
| [ ] | Text | `Your place, your team, your work. Up to {MAX_PHOTOS} images. You have {length} of {MAX_PHOTOS}.` | `src/features/checklist/components/brand-form.tsx:144` | Reworded from "Your place, your team, your work. Up to" (old: components/panel/media-uploader.tsx:236) |
| [ ] | Text | `Your logo (optional)` | `src/features/checklist/components/brand-form.tsx:97` |  |
| [ ] | Label | `Tagline (optional)` | `src/features/checklist/components/business-form.tsx:42` |  |
| [ ] | Label | `About your business (optional)` | `src/features/checklist/components/business-form.tsx:45` | Reworded from "About your business" (old: components/intake/intake-summary.tsx:64) |
| [ ] | Label | `Phone number` | `src/features/checklist/components/business-form.tsx:50` |  |
| [ ] | Label | `Which address` | `src/features/checklist/components/domain-form.tsx:32` |  |
| [ ] | Label | `I have a domain` | `src/features/checklist/components/domain-form.tsx:33` |  |
| [ ] | Label | `Start with a free address` | `src/features/checklist/components/domain-form.tsx:34` |  |
| [ ] | Hint | `For example yourbusiness.com` | `src/features/checklist/components/domain-form.tsx:39` |  |
| [ ] | Label | `This domain is mine` | `src/features/checklist/components/domain-form.tsx:42` |  |
| [ ] | Label | `Choose a name` | `src/features/checklist/components/domain-form.tsx:45` |  |
| [ ] | Text | `Your address will be name.{value}. You can move to your own domain later.` | `src/features/checklist/components/domain-form.tsx:45` | Dynamic part built from `{baseDomain ?? ""}` |
| [ ] | Text | `{name}: how this day works` | `src/features/checklist/components/hours-editor.tsx:17` |  |
| [ ] | Text | `{name}: opens` | `src/features/checklist/components/hours-editor.tsx:28` |  |
| [ ] | Text | `{name}: closes` | `src/features/checklist/components/hours-editor.tsx:35` |  |
| [ ] | Label | `Short description (optional)` | `src/features/checklist/components/services-form.tsx:48` |  |
| [ ] | Label | `Price (optional)` | `src/features/checklist/components/services-form.tsx:51` |  |
| [ ] | Text | `Add a service` | `src/features/checklist/components/services-form.tsx:71` |  |
| [ ] | Label | `What should we know? (optional)` | `src/features/checklist/components/services-form.tsx:76` |  |
| [ ] | Label | `Styles you like (optional)` | `src/features/checklist/components/services-form.tsx:79` |  |
| [ ] | Text | `Websites you like (optional)` | `src/features/checklist/components/services-form.tsx:83` | Reworded from "Websites you like" (old: components/panel/onboarding-summary.tsx:160) |
| [ ] | Text | `Only the owner or an editor can change this.` | `src/features/checklist/rules-items.ts:91` |  |
| [ ] | Text | `You've sent this to us, so these answers are locked. To change anything now, see Website.` | `src/features/checklist/rules-snapshot.ts:16` | Reworded from "You've sent this to us, so these answers are locked. To change anything now," (old: components/panel/onboarding-summary.tsx:248) |
| [ ] | Text | `Your plan starts once your first payment goes through.` | `src/features/home/components/home-screen.tsx:108` |  |
| [ ] | Text | `We missed each other on {date and time}. Pick a new time.` | `src/features/home/components/home-screen.tsx:124` | Reworded from "We missed each other on" (old: components/home/kickoff-home.tsx:66) |
| [ ] | Text | `Welcome, {value}. Your plan is active.` | `src/features/home/components/home-screen.tsx:134` | Reworded from "Welcome, Anand. Your plan is active." (mock: screens-a.js:56). Dynamic part built from `{firstName(person.name)}` |
| [ ] | Text | `Everything is running. Nothing needs you right now.` | `src/features/home/components/home-screen.tsx:245` | Reworded from "Nothing needs you right now." (packages/shared/src/ui/panel/account-bar.tsx:356) |
| [ ] | Text | `Everything is running. {value} you.` | `src/features/home/components/home-screen.tsx:245` | Dynamic part built from `{count === 1 ? "1 thing needs" : `${String(count)} things need`}` |
| [ ] | Text | `1 thing needs` | `src/features/home/components/home-screen.tsx:245` |  |
| [ ] | Text | `{count} things need` | `src/features/home/components/home-screen.tsx:245` |  |
| [ ] | Panel error noun | `your home page` | `src/features/home/components/home-screen.tsx:47` |  |
| [ ] | Title | `Payment under review` | `src/features/home/components/home-screen.tsx:77` |  |
| [ ] | Text | `We have your payment and are checking it. Your plan starts as soon as it clears.` | `src/features/home/components/home-screen.tsx:78` |  |
| [ ] | Text | `Your plan has ended. Reactivate it to restart your services.` | `src/features/home/components/home-screen.tsx:93` |  |
| [ ] | Panel error noun | `your services` | `src/features/home/components/panels.tsx:109` | Case or punctuation differs from "Your services" (old: components/intake/intake-aside.tsx:28) |
| [ ] | Title | `No services yet` | `src/features/home/components/panels.tsx:109` | Reworded from "No services yet." (old: components/panel/onboarding-summary.tsx:131) |
| [ ] | Description | `The services on your plan show here.` | `src/features/home/components/panels.tsx:109` |  |
| [ ] | Panel error noun | `what we did` | `src/features/home/components/panels.tsx:135` | Case or punctuation differs from "What we did" (old: components/home/ongoing-home.tsx:38) |
| [ ] | Description | `Each piece of work we do for you shows here.` | `src/features/home/components/panels.tsx:135` |  |
| [ ] | Text | `{date and time} to {time}. Video` | `src/features/home/components/panels.tsx:166` |  |
| [ ] | Title | `1 post scheduled` | `src/features/home/components/panels.tsx:169` |  |
| [ ] | Title | `to be confirmed` | `src/features/home/components/panels.tsx:170` | Case or punctuation differs from "To be confirmed" (old: components/home/ongoing-home.tsx:45) |
| [ ] | Panel error noun | `what is coming up` | `src/features/home/components/panels.tsx:173` |  |
| [ ] | Title | `Nothing booked yet` | `src/features/home/components/panels.tsx:173` |  |
| [ ] | Description | `Calls, posts and payments show here before they happen.` | `src/features/home/components/panels.tsx:173` |  |
| [ ] | Panel error noun | `your included edits` | `src/features/home/components/panels.tsx:195` |  |
| [ ] | Label | `Used this month` | `src/features/home/components/panels.tsx:199` |  |
| [ ] | Text | `. Small website changes are included. Bigger ones get a price first, and you decide.` | `src/features/home/components/panels.tsx:200` |  |
| [ ] | Title | `Nothing to get ready` | `src/features/home/components/panels.tsx:273` |  |
| [ ] | Description | `Bring your questions to the call.` | `src/features/home/components/panels.tsx:273` |  |
| [ ] | Panel error noun | `what needs you` | `src/features/home/components/panels.tsx:32` |  |
| [ ] | Description | `Anything we need from you shows here first.` | `src/features/home/components/panels.tsx:35` |  |
| [ ] | Panel error noun | `your enquiries` | `src/features/home/components/panels.tsx:79`, `src/features/home/components/panels.tsx:90` |  |
| [ ] | Text | `1 post is waiting for your approval.` | `src/features/home/loader.ts:203` | Reworded from "Waiting for your approval" (mock: screens-b.js:38) |
| [ ] | Text | `{count} posts are waiting for your approval.` | `src/features/home/loader.ts:203` | Reworded from "12 posts published. 4 are waiting for your approval." (mock: screens-a.js:43) |
| [ ] | Text | `1 post published this month.` | `src/features/home/loader.ts:204` |  |
| [ ] | Text | `{published} posts published this month.` | `src/features/home/loader.ts:204` |  |
| [ ] | Text | `{pageOne} tracked {value} on Google page one.` | `src/features/home/loader.ts:209` | Reworded from "9 of 12 tracked searches on Google page one." (mock: screens-a.js:43). Dynamic part built from `{pageOne === 1 ? "search" : "searches"}` |
| [ ] | Hint | `We need this to start` | `src/features/home/rules.ts:238` |  |

## Enquiries (37)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Error or refusal | `We could not export your enquiries. Try again in a minute.` | `src/app/(app)/enquiries/export/route.ts:17` |  |
| [ ] | Text | `Only owners and editors can change this.` | `src/features/enquiries/actions.ts:13` |  |
| [ ] | Error or refusal | `We could not find that enquiry.` | `src/features/enquiries/actions.ts:31` | Reworded from "We could not find that assistant." (old: app/app-host/(protected)/website/enquiries/actions.ts:45) |
| [ ] | Error or refusal | `Check the fields marked below.` | `src/features/enquiries/actions.ts:33` |  |
| [ ] | Error or refusal | `Keep the note to 1000 characters or fewer.` | `src/features/enquiries/actions.ts:33` | Reworded from "Keep the note to {MAX_CALL_NOTE_LENGTH} characters or fewer." (old: lib/calls/form.ts:18) |
| [ ] | Label | `Chat leads` | `src/features/enquiries/components/chat-assistant.tsx:20` |  |
| [ ] | Panel error noun | `your chatbot` | `src/features/enquiries/components/chat-assistant.tsx:32` | Case or punctuation differs from "Your chatbot" (old: components/panel/oyechats/chatbot-panel.tsx:19) |
| [ ] | Description | `The team builds it for your business and adds it to your website. Then its status shows here, and visitors who leave their details appear in your enquiries.` | `src/features/enquiries/components/chat-assistant.tsx:38` | Reworded from "The team builds it for your business and adds it to your website. Then its status shows here, and visitors who leave their deta..." (old: components/panel/oyechats/oyechats-intro.tsx:27) |
| [ ] | Text | `View conversation` | `src/features/enquiries/components/conversation-view.tsx:36` |  |
| [ ] | Description | `Everyone who called, chatted, filled a form or answered an ad. Last 30 days, and anyone still waiting for a reply.` | `src/features/enquiries/components/enquiries-screen.tsx:135` | Reworded from "Everyone who called, chatted, filled a form or answered an ad. Last 30 days." (mock: screens-a.js:77) |
| [ ] | Label | `Enquiries sections` | `src/features/enquiries/components/enquiries-screen.tsx:150` |  |
| [ ] | Label | `Chat assistant` | `src/features/enquiries/components/enquiries-screen.tsx:154` |  |
| [ ] | Panel error noun | `your enquiries` | `src/features/enquiries/components/enquiries-screen.tsx:171` |  |
| [ ] | Text | `{x of y} came from {value}` | `src/features/enquiries/components/enquiries-screen.tsx:48` | Dynamic part built from `{SOURCE_PHRASES[summary.bestSource.group]}` |
| [ ] | Text | `Counted from your website in the last 30 days: {quantity}, {quantity}, {quantity}.` | `src/features/enquiries/components/enquiries-screen.tsx:60` |  |
| [ ] | Text | `WhatsApp tap` | `src/features/enquiries/components/enquiries-screen.tsx:60` |  |
| [ ] | Text | `{quantity} from your Google profile {value} in the total: Google does not share who called.` | `src/features/enquiries/components/enquiries-screen.tsx:63` | Dynamic part built from `{googleCalls === 1 ? "is" : "are"}` |
| [ ] | Text | `Only the latest enquiries are shown. Export has them all.` | `src/features/enquiries/components/enquiries-screen.tsx:64` |  |
| [ ] | Description | `When someone calls, chats, fills a form or answers an ad, they appear here.` | `src/features/enquiries/components/enquiries-screen.tsx:78` |  |
| [ ] | Label | `Enquiries at a glance` | `src/features/enquiries/components/enquiries-screen.tsx:96` |  |
| [ ] | Toast | `Enquiry updated` | `src/features/enquiries/components/enquiry-form.tsx:16` |  |
| [ ] | Toast | `Name saved` | `src/features/enquiries/components/rename-assistant.tsx:17` |  |
| [ ] | Title | `Rename your assistant` | `src/features/enquiries/components/rename-assistant.tsx:31` |  |
| [ ] | Text | `{calls} {value} from your Google profile. Google does not share who called.` | `src/features/enquiries/rules.ts:164` | Dynamic part built from `{calls === 1 ? "call" : "calls"}` |
| [ ] | Text | `Waiting since {date}` | `src/features/enquiries/rules.ts:281` |  |
| [ ] | Text | `Oldest from today` | `src/features/enquiries/rules.ts:287` |  |
| [ ] | Text | `Oldest from {date}` | `src/features/enquiries/rules.ts:288` |  |
| [ ] | Text | `Received (India time)` | `src/features/enquiries/rules.ts:344` |  |
| [ ] | Text | `WhatsApp button tap` | `src/features/enquiries/rules.ts:52` |  |
| [ ] | Text | `Contact form sent` | `src/features/enquiries/rules.ts:52` |  |
| [ ] | Text | `Calls from your Google profile` | `src/features/enquiries/rules.ts:52` | Reworded from "Google profile calls" (packages/shared/src/lib/reports/enquiries.ts:19) |
| [ ] | Text | `Someone tapped Call on your website. We can see the tap, not who called.` | `src/features/enquiries/rules.ts:55` | Reworded from "Someone tapped Call on the Contact page. We can see the tap, not who called." (mock: screens-a.js:12) |
| [ ] | Text | `Someone tapped WhatsApp on your website. We can see the tap, not who messaged.` | `src/features/enquiries/rules.ts:56` |  |
| [ ] | Text | `Someone sent the contact form on your website. We can see that it was sent, not who sent it.` | `src/features/enquiries/rules.ts:57` |  |
| [ ] | Text | `your website` | `src/features/enquiries/rules.ts:80` | Case or punctuation differs from "Your website" (old: components/website/live-card.tsx:15) |
| [ ] | Text | `your ads` | `src/features/enquiries/rules.ts:80` |  |
| [ ] | Text | `your Google profile` | `src/features/enquiries/rules.ts:80` |  |

## Requests (36)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Error or refusal | `Your reply could not be saved. Your draft is still here; try again.` | `src/features/requests/actions.ts:129` | Reworded from "Your request could not be saved. Your draft is still here; try again." (old: app/app-host/(support)/support/actions.ts:21) |
| [ ] | Error or refusal | `Could not mark this as read.` | `src/features/requests/actions.ts:208` |  |
| [ ] | Text | `Your role can read requests but not change them. Ask the owner of the account.` | `src/features/requests/actions.ts:42` |  |
| [ ] | Panel error noun | `the conversation` | `src/features/requests/components/request-detail.tsx:102` |  |
| [ ] | Text | `Start a new request` | `src/features/requests/components/request-detail.tsx:110` |  |
| [ ] | Text | `to continue.` | `src/features/requests/components/request-detail.tsx:110` |  |
| [ ] | Panel error noun | `the details` | `src/features/requests/components/request-detail.tsx:123` | Case or punctuation differs from "The details" (old: components/website/details-card.tsx:8) |
| [ ] | Panel error noun | `the attachments` | `src/features/requests/components/request-detail.tsx:130` |  |
| [ ] | Panel error noun | `where your request is` | `src/features/requests/components/request-detail.tsx:84` |  |
| [ ] | Title | `No requests for this service` | `src/features/requests/components/requests-screen.tsx:21` |  |
| [ ] | Description | `Requests about it appear here as soon as you send one.` | `src/features/requests/components/requests-screen.tsx:21` |  |
| [ ] | Title | `Nothing is waiting for you` | `src/features/requests/components/requests-screen.tsx:22` | Reworded from "Nothing is waiting for you." (old: components/requests/request-list.tsx:16) |
| [ ] | Description | `A quote to answer or a change to check will appear here.` | `src/features/requests/components/requests-screen.tsx:22` |  |
| [ ] | Title | `Nothing is open` | `src/features/requests/components/requests-screen.tsx:23` | Reworded from "Nothing is open." (old: components/requests/request-list.tsx:16) |
| [ ] | Description | `Requests we are working on appear here.` | `src/features/requests/components/requests-screen.tsx:23` |  |
| [ ] | Title | `Nothing is done yet` | `src/features/requests/components/requests-screen.tsx:24` | Reworded from "Nothing is done yet." (old: components/requests/request-list.tsx:16) |
| [ ] | Description | `Finished requests appear here.` | `src/features/requests/components/requests-screen.tsx:24` |  |
| [ ] | Panel error noun | `your requests` | `src/features/requests/components/requests-screen.tsx:60` |  |
| [ ] | Label | `All services` | `src/features/requests/components/requests-screen.tsx:81` |  |
| [ ] | Text | `, waiting for your answer.` | `src/features/requests/components/requests-table.tsx:42` |  |
| [ ] | Label | `Screenshots to send` | `src/features/requests/components/screenshots.tsx:104` |  |
| [ ] | Text | `Uploading...` | `src/features/requests/components/screenshots.tsx:115` |  |
| [ ] | Error or refusal | `Screenshots could not be uploaded. You can still send your text, or try the upload again.` | `src/features/requests/components/screenshots.tsx:73` | Reworded from "Screenshots could not be uploaded. You can still send your text or remove these images and try uploading again." (old: components/panel/support/support-attachments.tsx:115) |
| [ ] | Text | `Add screenshots` | `src/features/requests/components/screenshots.tsx:96` |  |
| [ ] | Text | `Tell us a little more, in at least {BODY_MIN} characters.` | `src/features/requests/rules.ts:225` | Reworded from "Tell us a little more, in at least 10 characters." (old: lib/requests/form.ts:223) |
| [ ] | Text | `Keep the page to {PAGE_FIELD_LIMIT} characters or fewer.` | `src/features/requests/rules.ts:262` | Reworded from "Keep the page to 200 characters or fewer." (old: lib/requests/form.ts:229) |
| [ ] | Text | `PNG, JPEG or WebP, up to {SUPPORT_ATTACHMENT_LIMIT} files, {size} each.` | `src/features/requests/rules.ts:319` | Reworded from "JPEG, PNG or WebP, up to" (old: components/panel/details/brand-assets-panel.tsx:112) |
| [ ] | Text | `Choose up to {SUPPORT_ATTACHMENT_LIMIT} PNG, JPEG or WebP screenshots, each at most {size}.` | `src/features/requests/rules.ts:325` | Reworded from "Choose up to three PNG, JPEG or WebP screenshots, each at most 4 MB." (old: components/panel/support/support-attachments.tsx:73) |
| [ ] | Text | `{total} includes GST` | `src/features/requests/rules.ts:407` | Case or punctuation differs from "Includes GST {taxRateBasisPoints / MINOR_UNITS_PER_MAJOR}%" (old: lib/billing/receipt-document.ts:77) |
| [ ] | Text | `{total} includes {percent} GST` | `src/features/requests/rules.ts:407` | Reworded from "includes {charge.taxRateBasisPoints / 100}% GST" (old: lib/billing/billing-months.ts:98) |
| [ ] | Description | `We have asked you something. Your reply is below.` | `src/features/requests/rules.ts:480` |  |
| [ ] | Text | `One of your included edits` | `src/features/requests/rules.ts:486` |  |
| [ ] | Text | `No charge` | `src/features/requests/rules.ts:488` |  |
| [ ] | Text | `We will tell you` | `src/features/requests/rules.ts:492` |  |
| [ ] | Text | `We will assign someone soon` | `src/features/requests/rules.ts:498` |  |
| [ ] | Description | `Thanks, we're confirming your payment with the bank. Your change starts within a minute or two.` | `src/features/requests/rules.ts:529` | Reworded from "Thanks, we are confirming your payment with the bank. Your change starts within a minute or two." (old: lib/requests/notices.ts:36) |

## Website (29)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Panel error noun | `your web address` | `src/app/(app)/website/domain/page.tsx:17`, `src/app/(app)/website/domain/page.tsx:25` | Case or punctuation differs from "Your web address" (old: lib/ready-items.ts:21) |
| [ ] | Panel error noun | `your website` | `src/app/(app)/website/page.tsx:23`, `src/app/(app)/website/pages/page.tsx:16` | Case or punctuation differs from "Your website" (old: components/website/live-card.tsx:15) |
| [ ] | Text | `with your package discount` | `src/features/website/components/not-bought-screen.tsx:12` |  |
| [ ] | Text | `{price}{discount}, including GST.` | `src/features/website/components/not-bought-screen.tsx:13` |  |
| [ ] | Panel error noun | `the price of the Managed Website` | `src/features/website/components/not-bought-screen.tsx:21` |  |
| [ ] | Text | `Before they visit you, they visit your website. We build yours and keep it running, every month.` | `src/features/website/components/not-bought-screen.tsx:24` |  |
| [ ] | Text | `Add to plan` | `src/features/website/components/not-bought-screen.tsx:30` |  |
| [ ] | Panel error noun | `your pages` | `src/features/website/components/pages-screen.tsx:38`, `src/features/website/components/website-screen.tsx:164` |  |
| [ ] | Title | `No pages listed yet` | `src/features/website/components/pages-screen.tsx:41` |  |
| [ ] | Description | `Your pages appear here once your website is live. We read them from the website each night.` | `src/features/website/components/pages-screen.tsx:41` |  |
| [ ] | Text | `Last seen` | `src/features/website/components/pages-screen.tsx:50`, `src/features/website/components/website-screen.tsx:178` |  |
| [ ] | Text | `Actions` | `src/features/website/components/pages-screen.tsx:52` |  |
| [ ] | Panel error noun | `your website's progress` | `src/features/website/components/website-parts.tsx:64`, `src/features/website/components/website-screen.tsx:55` |  |
| [ ] | Text | `The home page of the preview for {businessName}` | `src/features/website/components/website-screen.tsx:108` |  |
| [ ] | Text | `Version {count}, sent {date}.` | `src/features/website/components/website-screen.tsx:111` |  |
| [ ] | Text | `{hostname} · Live since {date}` | `src/features/website/components/website-screen.tsx:142` | Reworded from "Live since" (old: lib/website/history.ts:139) |
| [ ] | Panel error noun | `your enquiries` | `src/features/website/components/website-screen.tsx:159` |  |
| [ ] | Text | `All pages` | `src/features/website/components/website-screen.tsx:171` |  |
| [ ] | Panel error noun | `your preview` | `src/features/website/components/website-screen.tsx:96` | Case or punctuation differs from "Your preview" (old: components/website/preview-card.tsx:119) |
| [ ] | Text | `Sign in to the company you bought` | `src/features/website/domain/components/connect-domain.tsx:124` | Reworded from "Sign in to your domain registrar, the company you bought" (old: components/panel/connect-domain-card.tsx:127) |
| [ ] | Text | `DNS records for {hostname}` | `src/features/website/domain/components/connect-domain.tsx:129` |  |
| [ ] | Text | `If your registrar won't take @ as a host, leave it blank or type your domain.` | `src/features/website/domain/components/connect-domain.tsx:146` | Reworded from "as a host, leave it blank or type your domain." (old: app/app-host/(protected)/domain/page.tsx:69) |
| [ ] | Description | `Your domain still points somewhere else. Check the values match exactly, and remove any older record for the same name.` | `src/features/website/domain/components/connect-domain.tsx:18` | Reworded from "Your domain still points somewhere else. Check the values above match exactly, and remove any older record for the same name." (old: components/panel/connect-domain-card.tsx:24) |
| [ ] | Hint | `What to change at your domain company` | `src/features/website/domain/components/domain-screen.tsx:157` |  |
| [ ] | Text | `Free, temporary address.` | `src/features/website/domain/components/domain-screen.tsx:40` |  |
| [ ] | Text | `Free, temporary address for now.` | `src/features/website/domain/components/domain-screen.tsx:41` | Reworded from "(free, temporary) for now" (old: app/app-host/(protected)/domain/page.tsx:137) |
| [ ] | Description | `Where your website lives, and how to move it to a domain of your own.` | `src/features/website/domain/components/domain-screen.tsx:74` | Reworded from "Where your website lives, and what to do to move it to a domain of your own." (old: app/app-host/(protected)/domain/page.tsx:108) |
| [ ] | Text | `That's a lot of checks in a short time. Please wait a while and try again.` | `src/features/website/domain/rules.ts:114` | Reworded from "That's a lot of attempts in a short time. Please wait a little and try again." (old: lib/keep-plan-copy.ts:6) |
| [ ] | Text | `Only the owner or an editor can do this.` | `src/features/website/rules/notices.ts:22` |  |

## Blog (62)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Panel error noun | `this post` | `src/app/(app)/website/blog/[id]/page.tsx:22` |  |
| [ ] | Panel error noun | `this author` | `src/app/(app)/website/blog/authors/[id]/page.tsx:22` |  |
| [ ] | Hint | `Shown with the posts they write.` | `src/app/(app)/website/blog/authors/new/page.tsx:22` | Reworded from "{authors.length === 1 ? "1 author" : `${authors.length} authors`} · shown on the posts they write" (old: app/app-host/(protected)/content/authors/page.tsx:36) |
| [ ] | Label | `Add author` | `src/app/(app)/website/blog/authors/new/page.tsx:23` |  |
| [ ] | Panel error noun | `this category` | `src/app/(app)/website/blog/categories/[id]/page.tsx:23` |  |
| [ ] | Hint | `For example, Back care. It gets its own page on your website.` | `src/app/(app)/website/blog/categories/new/page.tsx:22` |  |
| [ ] | Label | `Add category` | `src/app/(app)/website/blog/categories/new/page.tsx:23` | Reworded from "Add a category" (old: app/app-host/(protected)/content/categories/page.tsx:26) |
| [ ] | Error or refusal | `Only the owner or an editor can add images.` | `src/app/(app)/website/blog/media/route.ts:22` |  |
| [ ] | Hint | `You can change it, and everything else, in the editor.` | `src/app/(app)/website/blog/new/page.tsx:22` |  |
| [ ] | Label | `Formatting` | `src/features/blog/components/body-editor.tsx:224` |  |
| [ ] | Text | `This post's text could not be opened here. You can still change everything else, and publish, unpublish or delete it. Saving now starts the text fresh.` | `src/features/blog/components/body-editor.tsx:330` |  |
| [ ] | Label | `Post text` | `src/features/blog/components/body-editor.tsx:343` |  |
| [ ] | Text | `Start writing` | `src/features/blog/components/body-editor.tsx:344` | Reworded from "Start writing…" (old: components/panel/rich-text-editor.tsx:549) |
| [ ] | Text | `Hidden from Google` | `src/features/blog/components/editor-parts.tsx:213` |  |
| [ ] | Text | `Your title` | `src/features/blog/components/editor-parts.tsx:217` |  |
| [ ] | Text | `The post stays on your website but does not show in search results.` | `src/features/blog/components/editor-parts.tsx:252` | Reworded from "The post stays on your website but won't show in search results." (old: components/panel/blog-editor/search-panel.tsx:138) |
| [ ] | Text | `Fair` | `src/features/blog/components/editor-parts.tsx:262` | Case or punctuation differs from "fair" (old: lib/blog-seo-health.ts:75) |
| [ ] | Text | `Needs work` | `src/features/blog/components/editor-parts.tsx:263` |  |
| [ ] | Text | `Upload an image` | `src/features/blog/components/editor-parts.tsx:85` |  |
| [ ] | Text | `Replace image` | `src/features/blog/components/editor-parts.tsx:85` |  |
| [ ] | Text | `JPEG, PNG or WebP, up to {MAX_UPLOAD_SIZE_LABEL}. We shrink large photos.` | `src/features/blog/components/editor-parts.tsx:86` | Reworded from "JPEG, PNG or WebP, up to" (old: components/panel/details/brand-assets-panel.tsx:112) |
| [ ] | Text | `Duplicate last saved version` | `src/features/blog/components/post-editor.tsx:221` |  |
| [ ] | Title | `Delete this post?` | `src/features/blog/components/post-editor.tsx:252` |  |
| [ ] | Description | `It comes off your website and frees one post of your allowance. This cannot be undone.` | `src/features/blog/components/post-editor.tsx:253` |  |
| [ ] | Label | `Keep post` | `src/features/blog/components/post-editor.tsx:254` |  |
| [ ] | Label | `Cover image description` | `src/features/blog/components/post-editor.tsx:290` |  |
| [ ] | Hint | `Describes the image for people using screen readers and for search engines.` | `src/features/blog/components/post-editor.tsx:290` |  |
| [ ] | Text | `Text` | `src/features/blog/components/post-editor.tsx:295` | Case or punctuation differs from "text" (old: components/intake/question-form.tsx:44) |
| [ ] | Text | `A date ahead schedules the post: it goes live on its own then.` | `src/features/blog/components/post-editor.tsx:307` | Reworded from "A future date schedules the post: it goes live on its own then." (old: components/panel/blog-editor/blog-post-editor.tsx:513) |
| [ ] | Description | `Search description follows your summary or the start of the post` | `src/features/blog/components/post-editor.tsx:333` |  |
| [ ] | Text | `{x of y} posts used.` | `src/features/blog/components/posts-screen.tsx:25` | Reworded from "posts used" (old: app/app-host/(protected)/content/blog/page.tsx:55) |
| [ ] | Text | `{used} Unlock {posts} more for {amount} to keep writing.` | `src/features/blog/components/posts-screen.tsx:27` | Reworded from "· unlock {usage.nextBlock.posts} more to keep writing" (old: app/app-host/(protected)/content/blog/page.tsx:56). FLAG: HYPE: "Unlock" |
| [ ] | Panel error noun | `how many posts your plan has left` | `src/features/blog/components/posts-screen.tsx:46` |  |
| [ ] | Panel error noun | `your posts` | `src/features/blog/components/posts-screen.tsx:52` |  |
| [ ] | Description | `Your posts appear here. A new post stays a draft until you publish it.` | `src/features/blog/components/posts-screen.tsx:59` |  |
| [ ] | Text | `Last edited` | `src/features/blog/components/posts-screen.tsx:72` |  |
| [ ] | Text | `{count} published, {count} drafts{value}` | `src/features/blog/components/taxonomy-editors.tsx:129` | Dynamic part built from `{author.lastPublishedAt === null ? "" : `. Last published ${formatD...}` |
| [ ] | Text | `. Last published {date}` | `src/features/blog/components/taxonomy-editors.tsx:129` | Reworded from "Last published" (old: components/panel/blog-editor/authors-table.tsx:62) |
| [ ] | Hint | `Their posts stay on your website, without an author. This cannot be undone.` | `src/features/blog/components/taxonomy-editors.tsx:130` | Reworded from "Their posts stay on your website, just without an author." (old: components/panel/blog-editor/author-editor.tsx:310) |
| [ ] | Hint | `Shown with the posts they write` | `src/features/blog/components/taxonomy-editors.tsx:139` | Reworded from "{authors.length === 1 ? "1 author" : `${authors.length} authors`} · shown on the posts they write" (old: app/app-host/(protected)/content/authors/page.tsx:36) |
| [ ] | Hint | `For example, Head physio.` | `src/features/blog/components/taxonomy-editors.tsx:143` |  |
| [ ] | Label | `Bio` | `src/features/blog/components/taxonomy-editors.tsx:146` | Case or punctuation differs from "bio" (old: components/panel/blog-editor/author-editor.tsx:251) |
| [ ] | Text | `One or two lines, shown under their posts. Up to {AUTHOR_BIO_MAX_LENGTH} characters.` | `src/features/blog/components/taxonomy-editors.tsx:146` | Reworded from "One or two lines about them, shown under their posts." (old: components/panel/blog-editor/author-editor.tsx:261) |
| [ ] | Hint | `Shown under their posts` | `src/features/blog/components/taxonomy-editors.tsx:151` |  |
| [ ] | Text | `{count} published, {count} drafts` | `src/features/blog/components/taxonomy-editors.tsx:200` |  |
| [ ] | Hint | `Its posts stay on your website, without a category, and the category's page stops working. This cannot be undone.` | `src/features/blog/components/taxonomy-editors.tsx:201` |  |
| [ ] | Hint | `Changing it moves the category's page. The old address stops working.` | `src/features/blog/components/taxonomy-editors.tsx:221` |  |
| [ ] | Description | `Search description follows the description` | `src/features/blog/components/taxonomy-editors.tsx:232` | Reworded from "Search description follows the default" (old: components/panel/blog-editor/search-panel.tsx:105) |
| [ ] | Text | `Delete this {what}?` | `src/features/blog/components/taxonomy-editors.tsx:80` |  |
| [ ] | Text | `Keep {what}` | `src/features/blog/components/taxonomy-editors.tsx:82` | Case or punctuation differs from "Keep your plan" (old: app/app-host/restore-account/keep-plan/page.tsx:18) |
| [ ] | Panel error noun | `your authors` | `src/features/blog/components/taxonomy-screens.tsx:29` |  |
| [ ] | Description | `Add the people who write your posts, so readers know who is behind them.` | `src/features/blog/components/taxonomy-screens.tsx:33` | Reworded from "Add the people who write your posts, so readers know who's behind them." (old: app/app-host/(protected)/content/authors/page.tsx:23) |
| [ ] | Text | `Nothing published yet` | `src/features/blog/components/taxonomy-screens.tsx:59` | Reworded from "Nothing published yet." (old: components/panel/blog-editor/author-editor.tsx:301) |
| [ ] | Panel error noun | `your categories` | `src/features/blog/components/taxonomy-screens.tsx:82` |  |
| [ ] | Description | `Categories group your posts by topic. Each one gets its own page on your website.` | `src/features/blog/components/taxonomy-screens.tsx:86` |  |
| [ ] | Text | `Unlock more posts` | `src/features/blog/components/unlock-posts-button.tsx:18` | Reworded from "Unlock {usage.nextBlock.posts} more posts · {usage.nextBlock.price}" (old: app/app-host/(protected)/content/blog/page.tsx:21). FLAG: HYPE: "Unlock" |
| [ ] | Text | `Only the owner or an editor can change the blog.` | `src/features/blog/rules/messages.ts:4` |  |
| [ ] | Text | `We couldn't save that just now. Nothing was lost. Try again in a minute.` | `src/features/blog/rules/messages.ts:6` | Reworded from "We couldn't look that up just now. Try again in a minute." (old: lib/connect-domain-state.ts:11) |
| [ ] | Label | `Search description {SEARCH_DESCRIPTION_MIN_LENGTH} to {META_DESCRIPTION_MAX_LENGTH} characters` | `src/features/blog/rules/seo.ts:100` | Reworded from "Search description {SEARCH_DESCRIPTION_MIN_LENGTH}(en dash){META_DESCRIPTION_MAX_LENGTH} characters" (old: lib/blog-seo-health.ts:54) |
| [ ] | Label | `Search title {SEARCH_TITLE_MIN_LENGTH} to {META_TITLE_MAX_LENGTH} characters` | `src/features/blog/rules/seo.ts:95` | Reworded from "Search title {SEARCH_TITLE_MIN_LENGTH}(en dash){META_TITLE_MAX_LENGTH} characters" (old: lib/blog-seo-health.ts:49) |
| [ ] | Text | `This post or author no longer exists. Reload the page.` | `src/features/blog/server/media.ts:51` | Reworded from "This author no longer exists. Reload the page." (old: app/app-host/(protected)/content/authors/actions.ts:22) |
| [ ] | Text | `Something went wrong with the form. Reload the page and try again.` | `src/features/blog/taxonomy-actions.ts:43` | Reworded from "Something went wrong with the editor. Reload the page and try again." (old: app/app-host/(protected)/content/blog/actions.ts:278) |

## Social & Ads (32)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Text | `Add to plan` | `src/features/setup/components/not-bought.tsx:52` |  |
| [ ] | Text | `We plan and publish your Instagram, Facebook and Google profile posts each month, and run your Meta ads. You approve every post before it goes out.` | `src/features/setup/rules.ts:60` |  |
| [ ] | Text | `Your ad spend is paid on top` | `src/features/setup/rules.ts:91` | FLAG: WATCH: "paid on top" is about ad spend, not GST; owner to confirm it does not read as GST on top |
| [ ] | Error or refusal | `We could not find those posts.` | `src/features/social/actions.ts:34` |  |
| [ ] | Text | `Review post` | `src/features/social/components/approvals-panel.tsx:131` |  |
| [ ] | Text | `The picture for the post "{title}"` | `src/features/social/components/approvals-panel.tsx:30` |  |
| [ ] | Title | `No posts are planned for this week.` | `src/features/social/components/parts.tsx:100` |  |
| [ ] | Description | `Posts for the days ahead appear here once we have planned them.` | `src/features/social/components/parts.tsx:100` |  |
| [ ] | Text | `No posts are planned for {month} yet.` | `src/features/social/components/parts.tsx:128` |  |
| [ ] | Description | `Planned and published posts appear on their day.` | `src/features/social/components/parts.tsx:128` |  |
| [ ] | Text | `Posts in {month}` | `src/features/social/components/parts.tsx:131` |  |
| [ ] | Panel error noun | `your posts` | `src/features/social/components/parts.tsx:71` |  |
| [ ] | Description | `When a post is ready, it appears here as it will look, with one button to approve it.` | `src/features/social/components/parts.tsx:79` | Reworded from "When a post is ready, it appears here as it will look on Instagram and Facebook, with one button to approve it." (old: components/social/social-view.tsx:89) |
| [ ] | Label | `Ad money added by us each month` | `src/features/social/components/social-screens.tsx:105` | Reworded from "Ad money added by us" (old: components/social/social-view.tsx:51) |
| [ ] | Text | `Figures updated` | `src/features/social/components/social-screens.tsx:107` |  |
| [ ] | Text | `Needs attention` | `src/features/social/components/social-screens.tsx:128` |  |
| [ ] | Text | `Not connected` | `src/features/social/components/social-screens.tsx:129` |  |
| [ ] | Panel error noun | `your accounts` | `src/features/social/components/social-screens.tsx:141` |  |
| [ ] | Title | `No accounts are listed yet.` | `src/features/social/components/social-screens.tsx:144` |  |
| [ ] | Description | `Your Instagram, Facebook and Google accounts appear here once we have connected them.` | `src/features/social/components/social-screens.tsx:144` |  |
| [ ] | Label | `Cost per lead` | `src/features/social/components/social-screens.tsx:33`, `src/features/social/components/social-screens.tsx:104` |  |
| [ ] | Panel error noun | `what we need from you` | `src/features/social/components/social-screens.tsx:52` | Case or punctuation differs from "What we need from you" (old: components/home/attention.tsx:26) |
| [ ] | Label | `This month` | `src/features/social/components/social-screens.tsx:54` | Case or punctuation differs from "this month" (old: app/app-host/affiliate/(portal)/page.tsx:186) |
| [ ] | Panel error noun | `your ad figures` | `src/features/social/components/social-screens.tsx:57`, `src/features/social/components/social-screens.tsx:90` |  |
| [ ] | Title | `No ad figures for this month yet.` | `src/features/social/components/social-screens.tsx:92` |  |
| [ ] | Description | `Your ad spend and results appear here as soon as we have them.` | `src/features/social/components/social-screens.tsx:92` |  |
| [ ] | Text | `Spent in {month}` | `src/features/social/components/social-screens.tsx:99`, `src/features/social/components/social-screens.tsx:102` |  |
| [ ] | Text | `Only owners and editors can change this.` | `src/features/social/rules.ts:157` |  |
| [ ] | Text | `Those posts could not be found.` | `src/features/social/rules.ts:175` | Reworded from "Those posts could not be found for this business." (packages/db/src/queries/deliverables.ts:100) |
| [ ] | Text | `Choose a post to approve.` | `src/features/social/rules.ts:177` |  |
| [ ] | Text | `Approve {MAX_APPROVE} posts or fewer at a time.` | `src/features/social/rules.ts:177` |  |
| [ ] | Label | `YouTube` | `src/features/social/rules.ts:309` | Case or punctuation differs from "youtube" (packages/db/src/schema/connected-accounts.ts:8) |

## Local SEO + AEO (12)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Text | `{SEARCH_DESCRIPTION} Last check {date}.` | `src/features/search/components/search-screen.tsx:32` |  |
| [ ] | Panel error noun | `what we need from you` | `src/features/search/components/search-screen.tsx:47` | Case or punctuation differs from "What we need from you" (old: components/home/attention.tsx:26) |
| [ ] | Panel error noun | `your monthly numbers` | `src/features/search/components/search-screen.tsx:50` |  |
| [ ] | Label | `Searches` | `src/features/search/components/search-screen.tsx:58` | Case or punctuation differs from "Tracked searches" (mock: screens-a.js:42) |
| [ ] | Text | `What we did in {month}` | `src/features/search/components/search-screen.tsx:72` | Reworded from "What we did" (old: components/home/ongoing-home.tsx:38) |
| [ ] | Panel error noun | `the work we finished` | `src/features/search/components/search-screen.tsx:73` | Reworded from "the finished work" (old: lib/server/search.ts:32) |
| [ ] | Title | `Nothing is finished yet this month.` | `src/features/search/components/search-screen.tsx:76` |  |
| [ ] | Description | `Each page we improve and each listing we fix appears here once it is done.` | `src/features/search/components/search-screen.tsx:76` |  |
| [ ] | Text | `Page improved` | `src/features/search/components/search-screen.tsx:93` |  |
| [ ] | Text | `Listing fixed` | `src/features/search/components/search-screen.tsx:93` |  |
| [ ] | Text | `AEO stands for answer engine optimisation: making sure AI tools like ChatGPT mention your business when people ask about your kind of work.` | `src/features/search/rules.ts:17` |  |
| [ ] | Text | `We improve how you show up on Google, Maps and in AI answers like ChatGPT. Every month you see what we did and how your searches moved.` | `src/features/setup/rules.ts:61` |  |

## Reports (8)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Error or refusal | `Not found` | `src/app/(app)/reports/[month]/pdf/route.ts:18`, `src/app/(app)/reports/[month]/pdf/route.ts:21` | Case or punctuation differs from "Not found." (old: app/api/content-media-uploads/route.ts:54) |
| [ ] | Error or refusal | `We could not get this report. Try again in a minute.` | `src/app/(app)/reports/[month]/pdf/route.ts:20` |  |
| [ ] | Text | `We could not show this part of the report. Tell us and we will fix it.` | `src/features/reports/components/report-screen.tsx:31` |  |
| [ ] | Description | `{businessName}, sent {date}` | `src/features/reports/components/report-screen.tsx:79` |  |
| [ ] | Panel error noun | `this report` | `src/features/reports/components/report-screen.tsx:87` |  |
| [ ] | Panel error noun | `your reports` | `src/features/reports/components/reports-screen.tsx:23` |  |
| [ ] | Title | `No report has been sent yet` | `src/features/reports/components/reports-table.tsx:29` | Reworded from "No preview has been sent yet." (old: components/website/preview-card.tsx:127) |
| [ ] | Description | `Your first one appears here after your first full month.` | `src/features/reports/components/reports-table.tsx:29` |  |

## Business profile (11)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Panel error noun | `your logo and photos` | `src/app/(app)/business/brand/page.tsx:21` | Reworded from "Logo and photos" (old: app/app-host/(protected)/details/page.tsx:116) |
| [ ] | Toast | `Announcement removed` | `src/features/business/components/announcement-section.tsx:55` |  |
| [ ] | Title | `Your details` | `src/features/business/components/business-details.tsx:40` |  |
| [ ] | Panel error noun | `your business details` | `src/features/business/components/business-details.tsx:41` | Reworded from "Add your business details" (mock: core.js:153) |
| [ ] | Panel error noun | `your opening hours, holidays and announcement` | `src/features/business/components/business-details.tsx:60` | Reworded from "Opening hours, holidays and the announcement" (old: lib/website/change-yourself.ts:11) |
| [ ] | Label | `Reason (optional)` | `src/features/business/components/holidays-section.tsx:130` |  |
| [ ] | Title | `No holidays coming up` | `src/features/business/components/holidays-section.tsx:79` | Reworded from "No {itemNoun}s coming up" (old: components/panel/details/closures-panel.tsx:254) |
| [ ] | Description | `The holidays you add appear here until they have passed.` | `src/features/business/components/holidays-section.tsx:79` | Reworded from "The {itemNoun}s you add appear here until they have passed." (old: components/panel/details/closures-panel.tsx:254) |
| [ ] | Text | `Remove holiday {dates}` | `src/features/business/components/holidays-section.tsx:90` |  |
| [ ] | Text | `Only the owner or an editor can change this.` | `src/features/business/rules.ts:303` |  |
| [ ] | Text | `We could not remove that. Try again.` | `src/features/business/rules.ts:305` | Reworded from "We could not save that. Try again." (old: lib/social/notices.ts:6) |

## Plan & billing (48)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Text | `Back to Plan & billing` | `src/app/(pay)/billing/charges/confirm/page.tsx:47` | Reworded from "Back to Billing" (old: app/app-host/billing/charges/confirm/page.tsx:67) |
| [ ] | Text | `Start again from the Checkout page to get a fresh one.` | `src/app/(pay)/billing/confirm/page.tsx:43` | Reworded from "Start again from the {MEMBERSHIP_NAMES[membership]} page to get a fresh one." (old: app/app-host/billing/confirm/page.tsx:74) |
| [ ] | Text | `Back to Checkout` | `src/app/(pay)/billing/confirm/page.tsx:44` |  |
| [ ] | Error or refusal | `We couldn't save your billing details just now. Please try again in a minute.` | `src/features/billing/actions.ts:105` | Reworded from "We couldn't open your payment just now. Please try again in a minute." (old: lib/keep-plan-copy.ts:7) |
| [ ] | Text | `Something went wrong on our side. Please try again in a minute.` | `src/features/billing/actions.ts:25` |  |
| [ ] | Toast | `Billing details saved.` | `src/features/billing/components/billing-details-form.tsx:18` |  |
| [ ] | Text | `No billing details are saved yet.` | `src/features/billing/components/billing-details-form.tsx:26` |  |
| [ ] | Text | `Your GST invoices are made out from these details. A change applies to invoices issued after it.` | `src/features/billing/components/billing-details-form.tsx:37` |  |
| [ ] | Text | `Go to checkout` | `src/features/billing/components/billing-screens.tsx:102` |  |
| [ ] | Panel error noun | `your plan` | `src/features/billing/components/billing-screens.tsx:114` | Case or punctuation differs from "Your plan" (old: app/app-host/(protected)/billing/page.tsx:273) |
| [ ] | Text | `We couldn't find your plan's details. Ask the team and we'll sort it out.` | `src/features/billing/components/billing-screens.tsx:120` |  |
| [ ] | Panel error noun | `your services` | `src/features/billing/components/billing-screens.tsx:154` | Case or punctuation differs from "Your services" (old: components/intake/intake-aside.tsx:28) |
| [ ] | Panel error noun | `your invoices` | `src/features/billing/components/billing-screens.tsx:180` |  |
| [ ] | Panel error noun | `your payment method` | `src/features/billing/components/billing-screens.tsx:192` |  |
| [ ] | Title | `No payment yet` | `src/features/billing/components/billing-screens.tsx:200` |  |
| [ ] | Description | `The card, UPI or account you pay with shows here after your first payment.` | `src/features/billing/components/billing-screens.tsx:200` |  |
| [ ] | Text | `Bank transfer{value}` | `src/features/billing/components/billing-screens.tsx:204` | Dynamic part built from `{method.reference === null ? "" : `, reference ${method.reference}`}` |
| [ ] | Text | `, reference {reference}` | `src/features/billing/components/billing-screens.tsx:204` |  |
| [ ] | Text | `Renews automatically through Razorpay.` | `src/features/billing/components/billing-screens.tsx:208` | Case or punctuation differs from "Your plan renews automatically through Razorpay." (old: components/panel/billing/payment-method.tsx:27) |
| [ ] | Text | `Renews automatically on {renewsOn} through Razorpay.` | `src/features/billing/components/billing-screens.tsx:209` |  |
| [ ] | Text | `We arrange each payment with you directly.` | `src/features/billing/components/billing-screens.tsx:211` |  |
| [ ] | Text | `The last payment was made with this.` | `src/features/billing/components/billing-screens.tsx:212` |  |
| [ ] | Panel error noun | `your billing details` | `src/features/billing/components/billing-screens.tsx:243` |  |
| [ ] | Text | `. If the payments keep failing, it goes offline then, and you can restart it from this page. Check that the account, card or UPI you subscribed with has enough balance and hasn't expired.` | `src/features/billing/components/billing-screens.tsx:77` |  |
| [ ] | Text | `Your plan starts when your first payment goes through.` | `src/features/billing/components/billing-screens.tsx:98` |  |
| [ ] | Description | `Each payment's invoice or receipt shows here.` | `src/features/billing/components/invoices-table.tsx:96` |  |
| [ ] | Text | `Please send me a link to change the card or UPI my plan renews from.` | `src/features/billing/components/payment-method-request.tsx:15` |  |
| [ ] | Text | `Ask for a link` | `src/features/billing/components/payment-method-request.tsx:55` |  |
| [ ] | Text | `We send you a secure Razorpay link to add a new card or UPI. Your plan keeps running while you do.` | `src/features/billing/components/payment-method-request.tsx:62` |  |
| [ ] | Text | `Chosen:` | `src/features/billing/components/reactivate-card.tsx:34` |  |
| [ ] | Text | `Not chosen:` | `src/features/billing/components/reactivate-card.tsx:34` |  |
| [ ] | Text | `Options for {name}` | `src/features/billing/components/services-panel.tsx:143` |  |
| [ ] | Text | `Cancel this service` | `src/features/billing/components/services-panel.tsx:145` |  |
| [ ] | Toast | `{name} is on.` | `src/features/billing/components/services-panel.tsx:27` |  |
| [ ] | Text | `Add and pay` | `src/features/billing/components/services-panel.tsx:47` |  |
| [ ] | Text | `Keep` | `src/features/billing/components/services-panel.tsx:72` | Case or punctuation differs from "keep" (packages/shared/src/lib/billing/add-on-state.ts:109) |
| [ ] | Toast | `Cancellation scheduled for {endsOn}` | `src/features/billing/components/services-panel.tsx:83` |  |
| [ ] | Text | `Ask the team and we'll add it for you.` | `src/features/billing/loader.ts:126` |  |
| [ ] | Description | `You pay us by bank transfer, so ask the team and we'll add it.` | `src/features/billing/loader.ts:135` |  |
| [ ] | Text | `Joins your monthly payment on {date}.` | `src/features/billing/loader.ts:156` | Reworded from "{addOn.title} is on. It joins your monthly payment from {addOnDate(entry.joinsOn)}." (old: components/panel/add-ons/add-on-row.tsx:50) |
| [ ] | Error or refusal | `Choose the service to cancel.` | `src/features/billing/rules.ts:156` |  |
| [ ] | Text | `Keep the reason to {REASON_LIMIT} characters or fewer.` | `src/features/billing/rules.ts:160` | Reworded from "Keep the note to {MAX_CALL_NOTE_LENGTH} characters or fewer." (old: lib/calls/form.ts:18) |
| [ ] | Text | `Includes {amount} GST.` | `src/features/billing/rules.ts:247` | Reworded from "includes {charge.taxRateBasisPoints / 100}% GST" (old: lib/billing/billing-months.ts:98) |
| [ ] | Text | `Monthly ad money of {amount} is added to your ads.` | `src/features/billing/rules.ts:248` |  |
| [ ] | Text | `All prices include {percent}% GST.` | `src/features/billing/rules.ts:261` |  |
| [ ] | Text | `We arrange your next payment with you directly.{gst}` | `src/features/billing/rules.ts:264` | Reworded from "We'll arrange your next payment with you directly." (old: components/panel/billing/plan-summary.tsx:48) |
| [ ] | Text | `Next payment {amount} on {date}.{gst}` | `src/features/billing/rules.ts:265` |  |
| [ ] | Text | `That service isn't part of your plan payment any more. Reload the page to see where it stands.` | `src/features/billing/server/add-ons.ts:194` | Reworded from "That add-on isn't part of your plan payment any more. Reload the page to see where it stands." (old: lib/server/add-ons.ts:200) |

## Settings (60)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Panel error noun | `what deleting your account ends` | `src/app/(app)/settings/delete/page.tsx:18` |  |
| [ ] | Panel error noun | `your notification settings` | `src/app/(app)/settings/notifications/page.tsx:18` |  |
| [ ] | Text | `Sign out of every device except this one.` | `src/app/(app)/settings/security/page.tsx:22` |  |
| [ ] | Error or refusal | `We could not close your account just now. Nothing was changed. Please try again in a moment.` | `src/features/settings/actions.ts:145` |  |
| [ ] | Text | `We could not save that. Try again in a moment.` | `src/features/settings/actions.ts:26` | Reworded from "We could not save that. Try again." (old: lib/social/notices.ts:6) |
| [ ] | Error or refusal | `That setting does not exist.` | `src/features/settings/actions.ts:88` | Reworded from "That district does not exist." (packages/db/src/queries/geo-catalog.ts:238) |
| [ ] | Toast | `Password updated` | `src/features/settings/components/change-password-form.tsx:20` |  |
| [ ] | Text | `Your password is changed, but your other devices are still signed in.` | `src/features/settings/components/change-password-form.tsx:46` | Reworded from "Your password is changed. Your other devices are signed out." (old: components/panel/change-password-form.tsx:141) |
| [ ] | Label | `Anything you'd like us to know? Optional` | `src/features/settings/components/delete-account-flow.tsx:57` | Reworded from "Anything you'd like us to know?" (old: components/panel/delete-account-flow.tsx:106) |
| [ ] | Text | `Type {DELETE_CONFIRMATION_WORD} to confirm` | `src/features/settings/components/delete-account-flow.tsx:89` |  |
| [ ] | Toast | `Nominee saved` | `src/features/settings/components/nominee-dialog.tsx:24` |  |
| [ ] | Toast | `Nominee removed` | `src/features/settings/components/nominee-dialog.tsx:33` |  |
| [ ] | Text | `Change nominee` | `src/features/settings/components/nominee-dialog.tsx:50` |  |
| [ ] | Text | `Remove nominee` | `src/features/settings/components/nominee-dialog.tsx:57` |  |
| [ ] | Label | `Email notifications` | `src/features/settings/components/notification-table.tsx:32` |  |
| [ ] | Text | `{label}: email` | `src/features/settings/components/notification-table.tsx:42` |  |
| [ ] | Description | `A copy of your account, your business's details, what you have been billed, your requests, where you signed in from and who we share your data with, as one file. It does not include your password.` | `src/features/settings/components/privacy-panels.tsx:43` | Reworded from "A copy of your account, your business's details, what you have been billed, your support requests, where you signed in from and..." (old: app/app-host/(protected)/settings/privacy/page.tsx:45) |
| [ ] | Panel error noun | `your nominee` | `src/features/settings/components/privacy-panels.tsx:52` |  |
| [ ] | Title | `Someone who can act for you` | `src/features/settings/components/privacy-panels.tsx:55` |  |
| [ ] | Title | `Your choice` | `src/features/settings/components/privacy-panels.tsx:65` |  |
| [ ] | Text | `With your yes, {MEASUREMENT_TOOLS} count visits and record how pages are used. You can turn this on or off at any time.` | `src/features/settings/components/privacy-panels.tsx:66` | Reworded from "With your yes, Google Analytics counts visits and Microsoft Clarity records how pages are used. You can turn this on or off at ..." (old: app/app-host/(protected)/settings/privacy/page.tsx:67) |
| [ ] | Title | `Send us a privacy request` | `src/features/settings/components/privacy-panels.tsx:74` |  |
| [ ] | Description | `To correct something, have your data deleted, or make a complaint, email us. We reply within 30 days.` | `src/features/settings/components/privacy-panels.tsx:75` |  |
| [ ] | Toast | `Profile saved` | `src/features/settings/components/profile-form.tsx:21` |  |
| [ ] | Text | `It is what you sign in with. To change it, email` | `src/features/settings/components/profile-form.tsx:24` |  |
| [ ] | Label | `Your role` | `src/features/settings/components/profile-form.tsx:34` |  |
| [ ] | Toast | `Signed out of other devices` | `src/features/settings/components/sign-out-other-devices.tsx:19` |  |
| [ ] | Description | `Choose a new password.` | `src/features/settings/rules/account-settings-form.ts:23` | Reworded from "Choose a new password" (old: app/app-host/reset-password/[token]/page.tsx:9) |
| [ ] | Description | `Type the new password again.` | `src/features/settings/rules/account-settings-form.ts:35` |  |
| [ ] | Error or refusal | `That invitation does not exist.` | `src/features/team/actions.ts:103` | Reworded from "That district does not exist." (packages/db/src/queries/geo-catalog.ts:238) |
| [ ] | Error or refusal | `That invitation was already used or taken back.` | `src/features/team/actions.ts:106` |  |
| [ ] | Text/Error or refusal | `We could not do that. Try again in a moment.` | `src/features/team/actions.ts:45`, `src/features/team/components/remove-member-button.tsx:17` | Reworded from "We could not save that. Try again." (old: lib/social/notices.ts:6) |
| [ ] | Toast | `Invitation sent` | `src/features/team/components/invite-dialog.tsx:18` |  |
| [ ] | Hint | `Editors can change the business profile and send requests. Viewers can only look.` | `src/features/team/components/invite-dialog.tsx:49` |  |
| [ ] | Text | `They will lose access to your dashboard straight away. You can invite them again later.` | `src/features/team/components/remove-member-button.tsx:39` |  |
| [ ] | Toast | `Invitation revoked` | `src/features/team/components/revoke-invite-button.tsx:17` |  |
| [ ] | Text | `Revoke the invitation to {email}` | `src/features/team/components/revoke-invite-button.tsx:24` |  |
| [ ] | Text | `Revoke` | `src/features/team/components/revoke-invite-button.tsx:25` |  |
| [ ] | Panel error noun | `your team` | `src/features/team/components/team-panels.tsx:21` |  |
| [ ] | Text | `Joined` | `src/features/team/components/team-panels.tsx:27` |  |
| [ ] | Text | `Actions` | `src/features/team/components/team-panels.tsx:29`, `src/features/team/components/team-panels.tsx:69` |  |
| [ ] | Title | `Waiting for a reply` | `src/features/team/components/team-panels.tsx:61` |  |
| [ ] | Panel error noun | `your invitations` | `src/features/team/components/team-panels.tsx:61` |  |
| [ ] | Label | `Invitations waiting for a reply` | `src/features/team/components/team-panels.tsx:63` |  |
| [ ] | Text | `Expires {date}` | `src/features/team/components/team-panels.tsx:78` |  |
| [ ] | Text | `Editor` | `src/features/team/rules.ts:13` | Case or punctuation differs from "editor" (packages/db/src/schema/businesses.ts:10) |
| [ ] | Text | `Owners manage billing and the team. Editors can change the business profile and send requests. Viewers can see everything but change nothing.` | `src/features/team/rules.ts:23` |  |
| [ ] | Error or refusal | `Enter an email address.` | `src/features/team/rules.ts:30`, `src/features/team/rules.ts:33` |  |
| [ ] | Error or refusal | `Choose Editor or Viewer.` | `src/features/team/rules.ts:36` |  |
| [ ] | Text | `That is your own address. You already have access.` | `src/features/team/rules.ts:39` |  |
| [ ] | Text | `That address already has an invitation. Revoke it first to send a new one.` | `src/features/team/rules.ts:40` |  |
| [ ] | Text | `We could not send the invitation. Nothing was saved. Try again in a moment.` | `src/features/team/rules.ts:41` |  |
| [ ] | Text | `That is a lot of invitations in a short time. Please wait a while and try again.` | `src/features/team/rules.ts:42` |  |
| [ ] | Text | `You can't remove yourself from your own business.` | `src/features/team/rules.ts:43` |  |
| [ ] | Text | `That person can't be removed. Reload the page to see who has access.` | `src/features/team/rules.ts:44` |  |
| [ ] | Text | `This invitation link is not valid. Ask the owner to send a new one.` | `src/features/team/rules.ts:76`, `src/features/team/rules.ts:102` |  |
| [ ] | Text | `The owner withdrew this invitation. Ask them to send a new one.` | `src/features/team/rules.ts:77` |  |
| [ ] | Text | `This invitation has expired. Ask the owner to send a new one.` | `src/features/team/rules.ts:78` |  |
| [ ] | Text | `This invitation has already been used.` | `src/features/team/rules.ts:79` |  |
| [ ] | Text | `This invitation was sent to a different email address. Sign in with that address to accept it.` | `src/features/team/rules.ts:80` |  |

## Help & calls (17)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Toast | `Call cancelled` | `src/features/calls/components/cancel-call-button.tsx:25` |  |
| [ ] | Text | `Your call on` | `src/features/calls/components/cancel-call-button.tsx:42` |  |
| [ ] | Text | `will be cancelled and taken off our calendar.` | `src/features/calls/components/cancel-call-button.tsx:42` |  |
| [ ] | Label | `Keep the call` | `src/features/calls/components/cancel-call-button.tsx:46` |  |
| [ ] | Text | `Cancel the call` | `src/features/calls/components/cancel-call-button.tsx:49` |  |
| [ ] | Title | `No past calls yet` | `src/features/calls/components/help-screens.tsx:101` | Reworded from "No calls yet" (old: components/calls/calls-view.tsx:54) |
| [ ] | Description | `What we agreed on each call shows here.` | `src/features/calls/components/help-screens.tsx:101` | Reworded from "What we agreed on each call." (old: components/calls/calls-view.tsx:50) |
| [ ] | Text | `. Video` | `src/features/calls/components/help-screens.tsx:54` |  |
| [ ] | Panel error noun | `your calls` | `src/features/calls/components/help-screens.tsx:82`, `src/features/calls/components/help-screens.tsx:98` |  |
| [ ] | Description | `Book a call when you want to talk something through.` | `src/features/calls/components/help-screens.tsx:85` |  |
| [ ] | Text | `Pick a new time` | `src/features/calls/components/kickoff-panel.tsx:132` | Reworded from ". Pick a new time." (old: components/home/kickoff-home.tsx:66) |
| [ ] | Text | `with you.` | `src/features/calls/components/kickoff-panel.tsx:135` |  |
| [ ] | Text | `Keep my time` | `src/features/calls/components/kickoff-panel.tsx:140` |  |
| [ ] | Text | `social media` | `src/features/calls/components/kickoff-panel.tsx:15` |  |
| [ ] | Text | `Only the owner or an editor can change this.` | `src/features/calls/rules.ts:233` |  |
| [ ] | Text | `Calls open after your kickoff call.` | `src/features/calls/rules.ts:235` |  |
| [ ] | Text | `Add an email address in Settings to book here.` | `src/features/calls/rules.ts:241` | Reworded from "Add an email address in Settings to book here" (old: components/calls/book-call-button.tsx:130) |

## Shell (sidebar, menus, bell, search, banners) (19)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Text | `%s \| Brandbasket` | `src/app/layout.tsx:12` |  |
| [ ] | Error or refusal | `We could not mark your notifications as read. They will show as new until you open them again.` | `src/features/shell/actions.ts:26` |  |
| [ ] | Error or refusal | `We could not sign you out. Try again.` | `src/features/shell/actions.ts:38` |  |
| [ ] | Text | `Your plan has ended.` | `src/features/shell/components/billing-banner.tsx:19` | Reworded from "Your plan has ended" (old: app/app-host/(protected)/onboarding/review/page.tsx:203) |
| [ ] | Text | `Your website and content are safe. Restart it from Plan & billing.` | `src/features/shell/components/billing-banner.tsx:19` | Reworded from "Your website and content are safe. Restart it from Billing." (packages/shared/src/lib/billing/payment-step.ts:197) |
| [ ] | Text | `See billing` | `src/features/shell/components/billing-banner.tsx:24` | Case or punctuation differs from "See Billing" (packages/shared/src/lib/billing/payment-step.ts:190) |
| [ ] | Text | `We could not take your last payment.` | `src/features/shell/components/billing-banner.tsx:25` | Reworded from "We could not take your payment of {amount}." (packages/email/src/templates/payment-failed.ts:39) |
| [ ] | Text | `We will try again. Your website stays online until` | `src/features/shell/components/billing-banner.tsx:25` |  |
| [ ] | Text | `Payment received.` | `src/features/shell/components/billing-banner.tsx:32` | Reworded from "Payment received" (old: app/app-host/(protected)/onboarding/review/page.tsx:212) |
| [ ] | Text | `, not on your plan` | `src/features/shell/components/nav-item.tsx:40`, `src/features/shell/components/tab-bar.tsx:57` | Screen reader only, added after the label |
| [ ] | Text | `Notifications, {unread} new` | `src/features/shell/components/notifications-bell.tsx:44` |  |
| [ ] | Panel error noun | `your notifications` | `src/features/shell/components/notifications-bell.tsx:48` |  |
| [ ] | Text | `, new` | `src/features/shell/components/notifications-bell.tsx:64` | Screen reader only, added after the label |
| [ ] | Screen reader | `Brandbasket, home` | `src/features/shell/components/sidebar.tsx:29` |  |
| [ ] | Text | `Editor` | `src/features/shell/components/sidebar.tsx:9` | Case or punctuation differs from "editor" (packages/db/src/schema/businesses.ts:10) |
| [ ] | Label | `Main tabs` | `src/features/shell/components/tab-bar.tsx:19` |  |
| [ ] | Label | `Breadcrumb` | `src/features/shell/components/top-bar.tsx:25` |  |
| [ ] | Title | `Waiting for you: {subject}` | `src/features/shell/rules.ts:324` | Reworded from "Waiting for you" (old: components/requests/request-list.tsx:15) |
| [ ] | Title | `New reply: {subject}` | `src/features/shell/rules.ts:336` | Reworded from "New reply" (old: components/requests/request-list.tsx:58) |

## Errors and empty states (11)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Description | `The address may be old or mistyped. Everything in your account is where you left it.` | `src/app/not-found.tsx:10` |  |
| [ ] | Text | `Go to Home` | `src/app/not-found.tsx:13` |  |
| [ ] | Title | `This page does not exist` | `src/app/not-found.tsx:9` |  |
| [ ] | Text | `We could not load` | `src/components/panel.tsx:55` |  |
| [ ] | Text | `Your data is safe. Try again, and if it keeps happening, tell us and quote this time:` | `src/components/panel.tsx:55` |  |
| [ ] | Text | `Being built` | `src/components/status-badge.tsx:37` |  |
| [ ] | Text | `In setup` | `src/components/status-badge.tsx:46` |  |
| [ ] | Text | `, done` | `src/components/steps.tsx:39`, `src/components/steps.tsx:75` | Screen reader only, added after the label |
| [ ] | Text | `the price of {name}` | `src/features/setup/components/not-bought.tsx:21` |  |
| [ ] | Text | `Check the fields marked below.` | `src/lib/form.ts:5` |  |
| [ ] | Text | `Only the owner or an editor can add images.` | `src/lib/server-media/route-guard.ts:6` |  |

## Affiliate portal (23)

| Approve | Kind | String | File:line | Replaces / note |
|---|---|---|---|---|
| [ ] | Title | `This link no longer works.` | `src/app/affiliate/setup/[token]/page.tsx:21` | Reworded from "This link no longer" (old: app/app-host/affiliate/setup/[token]/page.tsx:31) |
| [ ] | Title | `Try this link again soon.` | `src/app/affiliate/setup/[token]/page.tsx:32` | Reworded from "Try this link again" (old: app/app-host/affiliate/setup/[token]/page.tsx:48) |
| [ ] | Text | `Choose a new password.` | `src/app/affiliate/setup/[token]/page.tsx:44` | Reworded from "Choose a new password" (old: app/app-host/reset-password/[token]/page.tsx:9) |
| [ ] | Text | `Welcome to Brandbasket.` | `src/app/affiliate/setup/[token]/page.tsx:44` |  |
| [ ] | Text | `{email} already has a Brandbasket account. Enter its password to add your affiliate dashboard to it.` | `src/app/affiliate/setup/[token]/page.tsx:48` | Reworded from "{invite.email} already has a {brand.shortName} account. Enter its password to add your affiliate dashboard to it." (old: app/app-host/affiliate/setup/[token]/page.tsx:73) |
| [ ] | Text | `Cashed out` | `src/features/affiliate/components/affiliate-dashboard.tsx:111` | Case or punctuation differs from "cashed out" (old: app/app-host/affiliate/(portal)/page.tsx:158) |
| [ ] | Text | `Cancelled after a refund` | `src/features/affiliate/components/affiliate-dashboard.tsx:130` | Case or punctuation differs from "cancelled after a refund" (old: app/app-host/affiliate/(portal)/page.tsx:177) |
| [ ] | Panel error noun | `your months` | `src/features/affiliate/components/affiliate-dashboard.tsx:146` |  |
| [ ] | Text | `Members who paid` | `src/features/affiliate/components/affiliate-dashboard.tsx:158` |  |
| [ ] | Panel error noun | `your codes` | `src/features/affiliate/components/affiliate-dashboard.tsx:196` |  |
| [ ] | Title | `Your code is being set up.` | `src/features/affiliate/components/affiliate-dashboard.tsx:199` | Reworded from "Your code is being set up. It will appear here." (old: app/app-host/affiliate/(portal)/page.tsx:134) |
| [ ] | Description | `It will appear here.` | `src/features/affiliate/components/affiliate-dashboard.tsx:199` |  |
| [ ] | Panel error noun | `your earnings` | `src/features/affiliate/components/affiliate-dashboard.tsx:211` |  |
| [ ] | Title | `Nothing yet.` | `src/features/affiliate/components/affiliate-dashboard.tsx:215` |  |
| [ ] | Text | `Month paid` | `src/features/affiliate/components/affiliate-dashboard.tsx:220` |  |
| [ ] | Panel error noun | `your payouts` | `src/features/affiliate/components/affiliate-dashboard.tsx:253` |  |
| [ ] | Label | `Your codes` | `src/features/affiliate/components/affiliate-dashboard.tsx:48` |  |
| [ ] | Text | `What members get` | `src/features/affiliate/components/affiliate-dashboard.tsx:52` |  |
| [ ] | Text | `Discount given` | `src/features/affiliate/components/affiliate-dashboard.tsx:55` |  |
| [ ] | Panel error noun | `your figures` | `src/features/affiliate/components/affiliate-dashboard.tsx:90` | Case or punctuation differs from "Your figures" (old: app/app-host/affiliate/(portal)/page.tsx:144) |
| [ ] | Text | `Enter the password of the account this address already has.` | `src/features/affiliate/components/affiliate-setup-form.tsx:63` |  |
| [ ] | Text | `Could not copy. Select the code and copy it.` | `src/features/affiliate/components/copy-code-button.tsx:38` | Reworded from "Couldn't copy. Select the code and copy it." (old: components/panel/affiliate/copy-code-button.tsx:47) |
| [ ] | Text | `More than {ceiling} members: the dashboard needs a count query.` | `src/features/affiliate/rules/members.ts:13` |  |

## Errors and empty states: how the shared panels compose

- Panel failure: `We could not load {noun}.` then `Your data is safe. Try again, and if it keeps happening, tell us and quote this time: {date and time}.` (`src/components/panel.tsx:55`). The nouns are the "Panel error noun" rows in each screen above.
- Empty states are a Title plus a Description pair (rows tagged Title and Description).
