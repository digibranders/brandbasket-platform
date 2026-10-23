# OyeChats on the customer dashboard: production setup

OyeChats is included in the Care plan. Brandbasket staff build and look after each customer's assistant inside OyeChats; the customer's
dashboard (app.brandbasket.in) is only a window onto it. This page is how to connect one customer's assistant, once, in production.

What the customer gets, under **OyeChats** in their menu:

- **Leads**: the people who left their details in the assistant, ten to a page, with a serial number, their name and how many
  messages they exchanged. Selecting a row opens the conversation in a pop-up.
- **Chatbot name**: each assistant with its status and a Rename button (the name is the customer's own label on their dashboard).

## What connects the two

| Piece | Direction | What it does | Where it comes from |
|---|---|---|---|
| Webhook | OyeChats to Brandbasket | Tells the dashboard a visitor left their details (and, optionally, how warm they are). Signed, so only OyeChats can send it. | A webhook you create for the bot in OyeChats. Its secret is shown **once**, when it is created. |
| Operator key | Brandbasket to OyeChats | Lets the dashboard read that one bot's message counts and conversations when the customer looks. Brandbasket stores no conversations. | An OyeChats operator bound to that bot (see step 3). |
| `OYECHATS_API_URL` | Brandbasket to OyeChats | Where the OyeChats API lives. One setting for the whole server. | The OyeChats API address. |

Neither the secret nor the key is ever sent to a browser or shown again after saving. Both live in a table only the staff connection can
read. An operator key can only see its own bot: OyeChats refuses it anything else.

## One-time setup for the server

1. Add the OyeChats API address to the **platform** env file on the VPS (the dashboard reads the conversations, the console does not):

   ```bash
   ssh root@<the VPS>     # access: docs/vps/ACCESS.md in firstfold-platform
   nano /srv/brandbasket/shared/platform.env.local     # add:  OYECHATS_API_URL=https://<your OyeChats API address>
   ```

   It is an origin only (`https://host`, no path). The `brandbasket` user owns the file (mode 600).

2. Ship this change the way you ship any other. The four new migrations (0176 to 0179) run by themselves in the deploy's
   migration step, before the new release goes live. Restart is part of the deploy; if you only changed the env file, restart the app:

   ```bash
   systemctl restart brandbasket-app
   ```

   Check it with `pnpm env:check --platform /srv/brandbasket/shared/platform.env.local --admin /srv/brandbasket/shared/admin.env.local`
   as in the VPS runbook (`docs/deployment/brandbasket-vps.md`). The new setting is optional, so it never fails the check.

## For each customer's assistant

Do these in the OyeChats dashboard for the assistant (bot) you built for the customer, then in the Brandbasket staff console.

### 1. Note the bot number

The bot's own number in OyeChats (its id). You will type it into the console in step 4.

### 2. Create the webhook, and keep the secret

In OyeChats, add a webhook **for that bot**:

- Address: `https://app.brandbasket.in/api/webhooks/oyechats`
- Events: `lead_captured` (adds the lead). Add `tier_transition` too if you want the rating stored; the dashboard does not show it today.
- Copy the **secret** the moment it is shown. OyeChats masks it afterwards; if you lose it, delete the webhook and make a new one.

The webhook feature depends on the OyeChats plan of the workspace the bot lives in. An unknown bot, a missing signature and a wrong
signature are all refused with the same 401, so a mistyped secret simply makes every delivery fail (see Troubleshooting).

### 3. Create the operator and take its key

This is what lets the customer open a conversation.

1. In OyeChats, add an operator **bound to that bot**, with the plainest role (`operator`), and a mailbox you control. Give it an obvious
   name such as "Brandbasket dashboard".
2. Sign that operator in once through the operator login. The `access_token` in the answer is the operator key:

   ```bash
   curl -s -X POST https://<your OyeChats API address>/auth/operator-login \
     -H "Content-Type: application/json" \
     -d '{"email":"<operator email>","password":"<operator password>"}'
   ```

3. Copy the `access_token`. Do not paste it anywhere except the console field in step 4.

Seats: OyeChats counts this operator against the bot's operator limit (3 on Professional, 1 on Starter). If creating it answers
`limit_reached`, buy a seat or free one. Without this operator the customer still sees their leads, with a dash for messages.

### 4. Register it in the Brandbasket staff console

`https://console.brandbasket.in` > **Clients** > the customer > **OyeChats** > **Add an OyeChats bot**:

- Name the customer sees: for example "Website assistant" (the customer can rename it later).
- OyeChats bot number: from step 1.
- Website it runs on: the customer's site, with `https://`.
- Webhook secret from OyeChats: from step 2.
- Operator key from OyeChats: from step 3. It is optional at this point; add it later with **Add key**, and replace or remove it any time
  with **Replace key** / **Remove key**.

Set the **Status** when it is ready: *Setting up* (the customer sees the team is building it), *Live*, or *Paused*. The line under the bot in the
console says whether conversations are available ("the customer can open a lead and read it" or "no operator key yet").

### 5. Check it end to end

1. Open the customer's site with the assistant on it and chat. Leave a name and an email when the assistant asks.
2. In the console, the bot's line shows `1 lead` within a few seconds.
3. Sign in to the dashboard as that customer (or ask them): **OyeChats > Leads** shows the visitor with a message count. Select the row and the conversation opens.

## Troubleshooting

| What you see | Likely cause |
|---|---|
| No lead appears, and OyeChats shows the webhook delivery failing with 401 | The secret in the console is not the one OyeChats made for that bot, or the bot number is wrong. The console cannot change a stored secret yet, so the fix is to remove the bot (this also deletes the leads stored for it) and add it again with the right secret. Check both carefully when you first add a bot. |
| Webhook delivery fails to connect | The address is wrong, or the server is down. OyeChats retries (after 30 s, 2 min, 10 min, 1 h, 4 h), so a short outage loses nothing. |
| Leads show, messages show a dash, and the pop-up says it is not available | No operator key saved (the console line says so), `OYECHATS_API_URL` is unset or wrong, the operator is bound to a different bot or was deactivated (OyeChats answers 403), or OyeChats is down. The server log has a line starting "OyeChats refused a read" or "OyeChats could not be reached", with the status and never the key. |
| The pop-up says "You have opened a lot of conversations" | One business may open 60 conversations a minute. It clears itself. |
| Counts look a minute old | They are kept for a minute so a busy page does not call OyeChats each time. A failed read is retried after 15 seconds. |

## What is kept, and for how long

Brandbasket keeps the visitor's name, email, phone and company that OyeChats reports, per lead, and nothing of the conversation. Deleting a bot in the
console removes its leads, its secret and its key; closing and erasing a customer's account removes them too (`docs/account-erasure.md`).
The conversations themselves stay in OyeChats and follow OyeChats' own retention.
