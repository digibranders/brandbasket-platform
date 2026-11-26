import type { ChannelLinkNetwork } from "@brandbasket/db";

/** What a link came to: the clean address and the account name, or a sentence that says what is wrong with it. */
export type ProfileLink = { readonly ok: true; readonly url: string; readonly handle: string } | { readonly ok: false; readonly message: string };

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.com", "www.fb.com"]);
/** Paths that are something other than a profile or a page. */
const INSTAGRAM_RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "legal", "web", "login", "challenge"]);
const FACEBOOK_RESERVED = new Set(["login", "share", "sharer", "sharer.php", "watch", "groups", "events", "marketplace", "photo", "photos", "reel", "reels", "story.php", "permalink.php", "policies", "help", "pages", "public", "hashtag", "dialog", "plugins", "gaming", "stories", "videos"]);
const INSTAGRAM_NAME = /^[A-Za-z0-9._]{1,30}$/;
const FACEBOOK_NAME = /^[A-Za-z0-9.\-]{5,80}$/;

const NOT_A_PROFILE = "That is a post, not a profile. Open the profile and copy the link from there.";

function parse(input: string): URL | null {
  const trimmed = input.trim();
  if (trimmed === "" || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Reads the link a customer pasted for her Instagram profile or Facebook page. Only the two networks' own addresses are accepted, a link to a
 * post, a reel or a login page is refused, and what comes back is the clean address (no tracking, no trailing slash) and the account name. Nothing is
 * fetched: the team looks at the account itself.
 */
export function readProfileLink(network: ChannelLinkNetwork, input: string): ProfileLink {
  const url = parse(input);
  const label = network === "instagram" ? "Instagram" : "Facebook";
  const hosts = network === "instagram" ? INSTAGRAM_HOSTS : FACEBOOK_HOSTS;
  if (url === null || !hosts.has(url.hostname.toLowerCase())) return { ok: false, message: `Paste the link to your ${network === "instagram" ? "Instagram profile" : "Facebook page"}, for example ${network === "instagram" ? "instagram.com/yourname" : "facebook.com/yourpage"}.` };
  const parts = url.pathname.split("/").filter((part) => part !== "");
  if (network === "facebook" && parts[0] === "profile.php") {
    const id = url.searchParams.get("id") ?? "";
    return /^\d{5,20}$/.test(id) ? { ok: true, url: `https://www.facebook.com/profile.php?id=${id}`, handle: id } : { ok: false, message: NOT_A_PROFILE };
  }
  const name = parts[0];
  if (name === undefined) return { ok: false, message: `That is the ${label} home page. Open your ${network === "instagram" ? "profile" : "page"} and copy the link from there.` };
  const reserved = network === "instagram" ? INSTAGRAM_RESERVED : FACEBOOK_RESERVED;
  if (reserved.has(name.toLowerCase()) || (network === "facebook" && parts.length > 1 && !["about", "posts", "photos", "community"].includes((parts[1] ?? "").toLowerCase()))) return { ok: false, message: NOT_A_PROFILE };
  if (network === "instagram" && parts.length > 1) return { ok: false, message: NOT_A_PROFILE };
  const valid = network === "instagram" ? INSTAGRAM_NAME.test(name) : FACEBOOK_NAME.test(name);
  if (!valid) return { ok: false, message: `That does not look like a ${label} ${network === "instagram" ? "profile" : "page"} link. Check it and try again.` };
  return network === "instagram" ? { ok: true, url: `https://www.instagram.com/${name}`, handle: name } : { ok: true, url: `https://www.facebook.com/${name}`, handle: name };
}

const PERSON_HINT = "Paste the link to your own Facebook profile, the person who manages the account, for example facebook.com/yourname.";

/**
 * The personal Facebook profile of the person who manages the account: Meta's tester list takes a person, not a Page. It is read like a
 * Facebook link, with the words for a person.
 */
export function readPersonProfileLink(input: string): ProfileLink {
  const link = readProfileLink("facebook", input);
  if (link.ok) return link;
  return { ok: false, message: link.message === NOT_A_PROFILE ? "That is a post, not a profile. Open your own profile and copy the link from there." : PERSON_HINT };
}
