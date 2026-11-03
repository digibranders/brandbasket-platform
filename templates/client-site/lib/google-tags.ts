const VERIFICATION_TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
const GA4_ID = /^G-[A-Z0-9]{4,20}$/;

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The Search Console meta tag token from NEXT_PUBLIC_GSC_VERIFICATION, which `google:provision` sets on the client's
 * Vercel project. Undefined when unset or malformed, so a typo in a setting renders nothing instead of a broken tag.
 */
export function gscVerificationToken(env: Env = process.env): string | undefined {
  const token = env.NEXT_PUBLIC_GSC_VERIFICATION?.trim();
  return token && VERIFICATION_TOKEN.test(token) ? token : undefined;
}

/** The Analytics measurement id from NEXT_PUBLIC_GA4_ID (`G-...`). Undefined when unset or malformed: the site then loads no Google script and sets no cookie. */
export function ga4Id(env: Env = process.env): string | undefined {
  const id = env.NEXT_PUBLIC_GA4_ID?.trim();
  return id && GA4_ID.test(id) ? id : undefined;
}
