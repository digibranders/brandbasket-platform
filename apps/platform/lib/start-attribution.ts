import type { NewSignupAttribution } from "@brandbasket/db";
import { START_FIELD } from "@/lib/join-form";
import { openStart, type Attribution } from "@/lib/start-token";

/** The ad in the database's words; a value the visitor did not have is null. */
function toSignupAttribution({ values, consentMeasurement, consentAdvertising }: Attribution): NewSignupAttribution {
  return {
    utmSource: values.utm_source ?? null,
    utmMedium: values.utm_medium ?? null,
    utmCampaign: values.utm_campaign ?? null,
    utmTerm: values.utm_term ?? null,
    utmContent: values.utm_content ?? null,
    gclid: values.gclid ?? null,
    fbclid: values.fbclid ?? null,
    fbp: values.fbp ?? null,
    fbc: values.fbc ?? null,
    gaClientId: values.ga_client_id ?? null,
    gaSessionId: values.ga_session_id ?? null,
    landingPath: values.landing_path ?? null,
    referrerHost: values.referrer_host ?? null,
    consentMeasurement,
    consentAdvertising,
  };
}

/**
 * The ad an account came from (plan 59), read from the sealed field the sign-up link carried. Null when there is no field, no
 * secret, a token that is not ours or has run out (it is good for an hour), or none that names an ad. Never throws.
 */
export function attributionFromStart(formData: FormData, secret: string | null, now: number = Date.now()): NewSignupAttribution | null {
  const token = formData.get(START_FIELD);
  if (secret === null || typeof token !== "string") return null;
  const attr = openStart(token, secret, now)?.attr;
  return attr === undefined ? null : toSignupAttribution(attr);
}
