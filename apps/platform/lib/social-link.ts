/**
 * A social profile on the Business profile's Identity tab: Instagram, Facebook or LinkedIn, pasted as a link
 * ("instagram.com/sunrisebakery", "https://www.facebook.com/sunrisebakery"). Browser-safe and pure. Only the network's
 * own addresses are taken, stored as https, which is what the database accepts (directory_business_profiles_social_check).
 */

export const SOCIAL_NETWORKS = ["instagram", "facebook", "linkedin"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export const SOCIAL_LABELS: Readonly<Record<SocialNetwork, string>> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

/** The database keeps links up to this length. */
export const SOCIAL_LINK_MAX_LENGTH = 300;

const HOSTS: Readonly<Record<SocialNetwork, readonly string[]>> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  linkedin: ["linkedin.com"],
};

export type SocialLinkResult =
  | { readonly ok: true; /** Null clears the link. */ readonly url: string | null }
  | { readonly ok: false; readonly message: string };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function belongsTo(network: SocialNetwork, hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^(www|m|web|mobile)\./, "");
  return HOSTS[network].some((own) => host === own);
}

export function parseSocialLink(network: SocialNetwork, typed: string): SocialLinkResult {
  const invalid: SocialLinkResult = { ok: false, message: `Paste your ${SOCIAL_LABELS[network]} profile's link.` };
  const value = typed.trim();
  if (value === "") return { ok: true, url: null };
  if (/\s/.test(value)) return invalid;

  let parsed: URL;
  try {
    parsed = new URL(HAS_SCHEME.test(value) ? value : `https://${value}`);
  } catch {
    return invalid;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return invalid;
  if (parsed.username !== "" || parsed.password !== "") return invalid;
  if (!belongsTo(network, parsed.hostname)) return invalid;
  // A profile has a name in its path; the bare site is not a profile.
  if (parsed.pathname.replace(/\//g, "") === "") return invalid;
  parsed.protocol = "https:";
  parsed.hash = "";
  if (parsed.href.length > SOCIAL_LINK_MAX_LENGTH) return { ok: false, message: "That link is too long." };
  return { ok: true, url: parsed.href };
}
