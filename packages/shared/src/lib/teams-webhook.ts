/**
 * Alerts to Microsoft Teams (docs/plans/27-teams-alerts.md in the BrandBasket workspace). A Teams "Workflows" webhook posts
 * to exactly one channel, so staff keep one address per kind of alert in the console's Settings: new enquiries, support
 * requests (bugs, feedback and replies) and system problems. Pure and browser-safe: the address check, the names and the card.
 */

/** The channels an alert can go to, one webhook address each. */
export const TEAMS_DESTINATIONS = ["enquiries", "payments", "support", "system"] as const;
export type TeamsDestination = (typeof TEAMS_DESTINATIONS)[number];

export const TEAMS_DESTINATION_INFO: Readonly<Record<TeamsDestination, { readonly label: string; readonly posts: string }>> = {
  enquiries: { label: "Website enquiries", posts: "Every new enquiry from the website's forms." },
  payments: { label: "Payments", posts: "Every payment received (first payment, renewal, reactivation, add-on, one-off charge or one recorded by hand), with the customer's details, and a payment that needs attention or a plan that stops billing." },
  support: { label: "Support, bugs and feedback", posts: "New support requests, bug reports, feedback and suggestions, and a customer's replies." },
  system: { label: "System errors", posts: "Automatic error reports from the dashboard and the console, at most one per error every 5 minutes." },
};

export function isTeamsDestination(value: unknown): value is TeamsDestination {
  return typeof value === "string" && (TEAMS_DESTINATIONS as readonly string[]).includes(value);
}

/** The name a destination's address is stored under (site_settings.key). The value is sealed, never the plain address. */
export function teamsSettingKey(destination: TeamsDestination): string {
  return `teams_webhook_${destination}`;
}

/** The names of the boxes the console's Settings forms post. */
export const TEAMS_URL_FIELD = "teamsUrl";
export const TEAMS_DESTINATION_FIELD = "teamsDestination";

export const MAX_TEAMS_URL_LENGTH = 1_000;

/** Where a Teams webhook can live: Workflows (Power Automate) and the older Office connector. Nothing else is posted to. */
const TEAMS_HOST_SUFFIXES = [".logic.azure.com", ".api.powerplatform.com", ".webhook.office.com"] as const;

export type TeamsUrlProblem = "teams-not-a-web-address" | "teams-not-secure" | "teams-too-long" | "teams-has-a-login" | "teams-not-a-teams-address";

export type TeamsUrlReading = { readonly ok: true; readonly url: string | null } | { readonly ok: false; readonly problem: TeamsUrlProblem };

/**
 * Reads the text staff pasted. Nothing typed means "no address". An address is kept only if it is https and on a host a
 * Teams webhook really lives on: the platform posts to whatever is saved here, so an arbitrary address would let a staff
 * member point the server at any other site or at an internal one.
 */
export function readTeamsWebhookUrl(input: string): TeamsUrlReading {
  const text = input.trim();
  if (text === "") return { ok: true, url: null };
  if (text.length > MAX_TEAMS_URL_LENGTH) return { ok: false, problem: "teams-too-long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, problem: "teams-not-a-web-address" };
  }
  if (url.protocol !== "https:") return { ok: false, problem: url.protocol === "http:" ? "teams-not-secure" : "teams-not-a-web-address" };
  if (url.username !== "" || url.password !== "") return { ok: false, problem: "teams-has-a-login" };
  const host = url.hostname.toLowerCase();
  if (!TEAMS_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return { ok: false, problem: "teams-not-a-teams-address" };
  return { ok: true, url: url.toString() };
}

export const TEAMS_URL_PROBLEMS: Readonly<Record<TeamsUrlProblem, string>> = {
  "teams-not-a-web-address": "That isn't a web address. Paste the full webhook URL from Teams, starting with https://.",
  "teams-not-secure": "Use the secure address, starting with https://, not http://.",
  "teams-too-long": `That address is too long. Keep it under ${MAX_TEAMS_URL_LENGTH} characters.`,
  "teams-has-a-login": "Take the user name and password out of the address. A Teams webhook never needs them.",
  "teams-not-a-teams-address": "That is not a Teams webhook address. Copy it from the Workflows flow's \"When a Teams webhook request is received\" step.",
};

/** "26 Oct 2026, 5:54 pm IST": staff read Teams in India, so every time on a card is in Indian time. */
export function formatIstTime(date: Date): string {
  return `${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date)} IST`;
}

/** What one alert says. Everything optional is left out of the card when empty. */
export interface TeamsCardInput {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly facts?: readonly { readonly name: string; readonly value: string | null | undefined }[];
  /** A longer text, such as an enquiry's message. */
  readonly text?: string | null;
  readonly open?: { readonly label: string; readonly url: string } | null;
}

const MAX_TITLE = 200;
const MAX_FACT = 300;
const MAX_TEXT = 1_500;

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** The message a Workflows webhook expects: a Teams message carrying one Adaptive Card. */
export interface TeamsMessage {
  readonly type: "message";
  readonly attachments: readonly [
    {
      readonly contentType: "application/vnd.microsoft.card.adaptive";
      readonly contentUrl: null;
      readonly content: Readonly<Record<string, unknown>>;
    },
  ];
}

export function teamsCard(input: TeamsCardInput): TeamsMessage {
  const facts = (input.facts ?? []).flatMap((fact) => {
    const value = fact.value?.trim() ?? "";
    return value === "" ? [] : [{ title: fact.name, value: clip(value, MAX_FACT) }];
  });
  const text = input.text?.trim() ?? "";
  const body: Record<string, unknown>[] = [{ type: "TextBlock", text: clip(input.title, MAX_TITLE), weight: "Bolder", size: "Medium", wrap: true }];
  if (input.subtitle) body.push({ type: "TextBlock", text: clip(input.subtitle, MAX_TITLE), isSubtle: true, spacing: "None", wrap: true });
  if (facts.length > 0) body.push({ type: "FactSet", facts });
  if (text !== "") body.push({ type: "TextBlock", text: clip(text, MAX_TEXT), wrap: true });
  const content: Record<string, unknown> = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body,
  };
  if (input.open) content.actions = [{ type: "Action.OpenUrl", title: input.open.label, url: input.open.url }];
  return { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content }] };
}
