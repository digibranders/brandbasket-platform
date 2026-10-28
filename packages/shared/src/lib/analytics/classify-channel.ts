export const CHANNELS = ["direct", "search", "social", "email", "ai", "paid", "referral"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface ChannelInput {
  /** The host of the page that sent the visitor, without www, or null. */
  readonly referrerHost: string | null;
  /** utm_medium and utm_source, already cleaned (lower case), or null. */
  readonly medium: string | null;
  readonly source: string | null;
  /** The business's own hosts, so a click from one of its own pages is not an arrival. */
  readonly ownHosts: readonly string[];
}

/** The host of an address, lower case and without a leading www, or null when there is none to read. */
export function referrerHost(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const host = new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, "");
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

const hostIs = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);
const hostIn = (host: string, domains: readonly string[]): boolean => domains.some((domain) => hostIs(host, domain));
const withoutWww = (host: string): string => host.toLowerCase().replace(/^www\./, "");

const AI_HOSTS = ["chatgpt.com", "chat.openai.com", "perplexity.ai", "gemini.google.com", "claude.ai", "copilot.microsoft.com", "you.com", "poe.com"];
const WEBMAIL_HOSTS = ["mail.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com", "mail.yahoo.com"];
const SOCIAL_HOSTS = ["facebook.com", "instagram.com", "linkedin.com", "lnkd.in", "t.co", "twitter.com", "x.com", "youtube.com", "youtu.be", "pinterest.com", "reddit.com", "t.me", "whatsapp.com"];
const SEARCH_HOSTS = ["bing.com", "duckduckgo.com", "search.yahoo.com", "search.brave.com", "ecosia.org", "startpage.com", "baidu.com"];
const GOOGLE_SEARCH = /^google\.(?:com?\.)?[a-z]{2,3}$/;
const YANDEX = /^yandex\.[a-z]{2,3}$/;

const PAID_MEDIUM = /^(?:cpc|ppc|paid|paidsearch|paid[-_ ]?social|display|cpm|ads?)$/;
const EMAIL_MEDIUM = /^(?:e-?mail|newsletter)$/;
const SOCIAL_MEDIUM = /^(?:social|social-media|sm)$/;
const SOCIAL_SOURCES = ["instagram", "facebook", "fb", "ig", "linkedin", "twitter", "x", "youtube", "whatsapp", "telegram"];
const EMAIL_SOURCES = ["newsletter", "email", "mailchimp", "brevo"];

/**
 * How a visit arrived. A campaign medium decides first, then a campaign source, then the page that sent the visitor,
 * and a visit with none of these is direct. AI assistants are checked before search engines because one of them
 * (Gemini) lives under google.com.
 */
export function classifyChannel(input: ChannelInput): Channel {
  const medium = input.medium?.trim().toLowerCase() ?? "";
  if (PAID_MEDIUM.test(medium)) return "paid";
  if (EMAIL_MEDIUM.test(medium)) return "email";
  if (SOCIAL_MEDIUM.test(medium)) return "social";
  if (medium === "organic") return "search";

  const source = input.source?.trim().toLowerCase() ?? "";
  if (SOCIAL_SOURCES.includes(source)) return "social";
  if (EMAIL_SOURCES.includes(source)) return "email";

  if (input.referrerHost === null) return "direct";
  const host = withoutWww(input.referrerHost);
  if (input.ownHosts.some((own) => hostIs(host, withoutWww(own)))) return "direct";
  if (hostIn(host, AI_HOSTS)) return "ai";
  if (hostIn(host, WEBMAIL_HOSTS)) return "email";
  if (hostIn(host, SOCIAL_HOSTS)) return "social";
  if (GOOGLE_SEARCH.test(host) || YANDEX.test(host) || hostIn(host, SEARCH_HOSTS)) return "search";
  return "referral";
}
