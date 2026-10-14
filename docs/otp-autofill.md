# Browser SMS OTP autofill operations

Domain-bound delivery is **off by default**. The existing `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, and `SMS_PROVIDER` settings continue to work. This change neither registers templates nor updates deployment settings. Real SMS delivery and device autofill require the acceptance steps below.

## Trusted origins and independent template pairs

Set both values in a surface's pair only after its exact fixed-host template is approved:

| Surface | Trusted origin | Approved MSG91 Flow template |
| --- | --- | --- |
| Account creation, phone password recovery, business verification | `SMS_OTP_APP_ORIGIN` | `MSG91_OTP_APP_TEMPLATE_ID` |
| Public directory reviews and comments | `SMS_OTP_WEBSITE_ORIGIN` | `MSG91_OTP_WEBSITE_TEMPLATE_ID` |

Either surface can be enabled while the other pair remains blank. Blank/unset pairs use the legacy message. Each pair must be complete; partial pairs are configuration errors. The sender validates all configured pairs before dispatching a MSG91 message, so an invalid pair must be corrected even if another surface is being used. Both pairs must use distinct hosts to avoid ambiguous provider template selection. The legacy, app and website IDs must also be distinct: one fixed-host template cannot render both hosts or the legacy message.

Origins must be exact canonical HTTPS origins with lowercase ASCII DNS hosts, for example `https://app.firstfold.io` and `https://www.firstfold.io`. One trailing `/` is allowed. Schemes other than HTTPS, IP addresses, localhost, credentials, ports (including explicit `:443`), non-root paths, queries, fragments, whitespace, and noncanonical hosts are refused. Use ASCII punycode for approved internationalized names. Confirm the actual deployed browser hostname after canonical redirects before choosing the values. Do not copy these examples into production without that check.

These values are server deployment configuration. Neither request headers nor client-supplied hosts can choose the SMS binding. The template stores a literal host; no domain variable is sent to MSG91. `APP_ORIGIN` and API request hosts do not implicitly enable binding.

Client-site appointment booking retains the existing legacy template regardless of these pairs. Its customer input implementations and approved tenant-host mapping are outside this rollout. Add support only after both are available; pending or owner-supplied tenant domains are insufficient.

## Exact provider templates

The existing legacy MSG91 Flow template remains:

```text
##code## is your Firstfold code. It expires in 10 minutes. Do not share it.
```

Register an independent app template, using the confirmed app host literally:

```text
##code## is your Firstfold code. It expires in 10 minutes. Do not share it.

@app.firstfold.io ###binding_code## Firstfold
```

Register an independent website template, using the confirmed website host literally:

```text
##code## is your Firstfold code. It expires in 10 minutes. Do not share it.

@www.firstfold.io ###binding_code## Firstfold
```

`###binding_code##` is the literal `#` marker followed immediately by MSG91's `##binding_code##` variable. The Flow API recipient carries **both** `code` and `binding_code`, each containing the same six ASCII digits. Keep leading zeros. Use MSG91 variable names exactly as shown; the configured IDs are the MSG91 Flow template IDs, with the approved DLT content templates associated in MSG91.

For DLT registration, represent each code occurrence with the operator's `{#var#}` placeholder; keep the literal `#` preceding the second placeholder. For example, the app content is:

```text
{#var#} is your Firstfold code. It expires in 10 minutes. Do not share it.

@app.firstfold.io #{#var#} Firstfold
```

Ask MSG91/operator support to confirm both placeholder mappings, the literal marker, and the exact line breaks. Do not reuse the legacy template ID for a new binding template. The parser refuses changed wording, unknown hosts, extra lines, extra suffixes, or different codes in the two positions before making a provider request.

The fixed `Firstfold` suffix keeps the final word static, addressing MSG91's published restriction on templates ending with a variable. Approval is still required. [MSG91 DLT template FAQ](https://msg91.com/help/dlt-registration-in-india/dlt-content-template-faqs/).

The browser format permits trailing text on the same binding line. Keep `@host #code Firstfold` as the **last** line; do not append a separate brand/footer line or a trailing newline. This suffix choice still needs real-device verification. [Origin-bound SMS specification](https://wicg.github.io/sms-one-time-codes/#authoring).

## Rollout and rollback

1. Confirm each surface's deployed canonical HTTPS hostname and register its exact DLT/MSG91 content. Verify that the template uses two code variables and no host variable.
2. Obtain approval and confirm MSG91's mapping to the approved DLT template. Preserve the current legacy template and its configured ID.
3. Keep `SIGNUP_OTP_BYPASS`, `VERIFY_OTP_BYPASS`, and `BOOKING_OTP_BYPASS` off for real-device testing. The booking bypass also skips directory review/comment SMS. Local outbox messages prove formatting only.
4. Test the approved template in a controlled HTTPS environment with an authorized real number. Inspect the delivered SMS for unchanged wording, preserved leading zero, identical codes, exact literal hostname, one blank line, and the final static suffix. Obtain delivery/operator evidence; mock tests cannot provide it.
5. Test Android Chrome consent and iPhone Safari suggestions. Filling must leave the normal confirmation button required. Also test manual typing/paste, partial manual entry, very fast delivery, denied consent, timeout, failed sends, resend with a delayed old SMS, changed number/details, hidden/closed comment forms, multiple forms/tabs, navigation, expired codes, and incomplete recovery password fields.
6. Enable the app pair first if desired, then the website pair independently after acceptance. A pair activates all listed flows on that surface. Continue existing attempt limits, expiry, phone/purpose checks, and single-use server verification; domain binding does not identify a challenge or phone number.
7. Roll back a surface by clearing **both** values in its pair together and redeploying/restarting the server as required. It resumes the unchanged legacy message/template. Keep the other surface's approved pair if it passed acceptance.

This rollout covers top-level FirstFold pages. Embedded cross-origin OTP forms need separate permission and browser-format design. Unsupported browsers and in-app webviews must retain manual entry. Browser-native hints, WebOTP capability and SMS template approval are separate prerequisites; successful automated tests alone do not establish mobile autofill.

## Local verification

From `apps/platform`:

```sh
npm test -- lib/server/sms lib/server/account-otp.test.ts lib/server/directory-reviews.test.ts lib/server/directory-review-actions.test.ts lib/server/booking-otp.test.ts lib/server/booking-confirm.test.ts
npm run lint
npx tsc --noEmit
npm run build
```

Tests exercise legacy compatibility, independent pairs, strict origin/host/code parsing, identical duplicated substitutions, approved template selection, rejected unknown bindings, and provider failures without sending SMS. Run website receiver/form checks separately for its browser implementation.
