/**
 * What a customer tells us for Social and Search after the kickoff call (plan 30). Pure and browser-safe: the page draws
 * a form from SETUP_FIELDS, the action checks the answers with parseSetupItem, and doneSetupKeys says which items are
 * done. We never ask for a password: the accounts item asks for page links and whether we were added as an admin.
 * Saved answers are shown back in form fields only; never render them as HTML.
 */

export const SETUP_KEYS = ["accounts", "offers", "budget", "areas"] as const;
export type SetupKey = (typeof SETUP_KEYS)[number];

/** Which service's saved answers each item lives in (service_setup.service). */
export const SETUP_SERVICE: Readonly<Record<SetupKey, "social" | "search">> = {
  accounts: "social",
  offers: "social",
  budget: "social",
  areas: "search",
};

export interface SetupField {
  readonly name: string;
  readonly label: string;
  readonly kind: "text" | "textarea" | "select";
  readonly hint?: string;
  readonly placeholder?: string;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

export const SETUP_FIELDS: Readonly<Record<SetupKey, readonly SetupField[]>> = {
  accounts: [
    { name: "instagramUrl", label: "Instagram page", kind: "text", placeholder: "instagram.com/yourclinic" },
    { name: "facebookUrl", label: "Facebook page", kind: "text", placeholder: "facebook.com/yourclinic" },
    {
      name: "adminAccess",
      label: "Have you added us as an admin?",
      kind: "select",
      hint: "We never need your password.",
      options: [
        { value: "not_yet", label: "Not yet" },
        { value: "added", label: "Yes, added" },
        { value: "need_help", label: "I need help" },
      ],
    },
  ],
  offers: [{ name: "offers", label: "What do you want to promote this month?", kind: "textarea", placeholder: "A free check-up in December" }],
  budget: [
    { name: "adBudgetRupees", label: "Monthly ad budget in rupees", kind: "text", placeholder: "10000" },
    { name: "adArea", label: "How far from you should ads reach?", kind: "text", placeholder: "4 km around the clinic" },
  ],
  areas: [
    { name: "areas", label: "Where do you want to be found?", kind: "textarea", placeholder: "Naupada and Thane West" },
    { name: "competitors", label: "Who ranks above you today? (optional)", kind: "textarea" },
    { name: "googleBusinessUrl", label: "Your Google Business Profile link (optional)", kind: "text", placeholder: "https://g.page/..." },
  ],
};

export type SetupParse =
  | { readonly success: true; readonly answers: Readonly<Record<string, string | number>> }
  | { readonly success: false; readonly field: string; readonly message: string };

const fail = (field: string, message: string): SetupParse => ({ success: false, field, message });

const ADMIN_ANSWERS = ["added", "not_yet", "need_help"] as const;
const OFFERS_MAX = 500;
const AREA_MAX = 120;
const TEXT_MAX = 300;
const BUDGET_MAX = 1_000_000;

const LINK_MAX = 200;

/** Whether `hostname` is one of `hosts` or a subdomain of one (a leading www. is ignored). */
function onHost(hostname: string, hosts: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** A page link on one of `hosts`, or "" when blank, or null when it is not one. Adds https:// when it is missing; keeps host and path only. */
function pageLink(raw: string, hosts: readonly string[]): string | null {
  const text = raw.trim();
  if (text === "") return "";
  if (text.length > LINK_MAX) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (url.pathname === "" || url.pathname === "/") return null;
  return onHost(url.hostname, hosts) ? `https://${url.hostname}${url.pathname}` : null;
}

const GOOGLE_HOSTS = ["google.com", "g.page", "goo.gl", "share.google"] as const;

/** Checks one item's form. `input` is the form's text values, untrimmed. */
export function parseSetupItem(key: SetupKey, input: Readonly<Record<string, string>>): SetupParse {
  const value = (name: string): string => (input[name] ?? "").trim();
  switch (key) {
    case "accounts": {
      const instagram = pageLink(value("instagramUrl"), ["instagram.com"]);
      if (instagram === null) return fail("instagramUrl", "That does not look like an Instagram link. Paste the address of your page.");
      const facebook = pageLink(value("facebookUrl"), ["facebook.com", "fb.com"]);
      if (facebook === null) return fail("facebookUrl", "That does not look like a Facebook link. Paste the address of your page.");
      if (instagram === "" && facebook === "") return fail("instagramUrl", "Add at least one of your Instagram or Facebook pages.");
      const admin = value("adminAccess") === "" ? "not_yet" : value("adminAccess");
      if (!(ADMIN_ANSWERS as readonly string[]).includes(admin)) return fail("adminAccess", "Choose one of the answers.");
      return { success: true, answers: { instagramUrl: instagram, facebookUrl: facebook, adminAccess: admin } };
    }
    case "offers": {
      const offers = value("offers");
      if (offers === "") return fail("offers", "Write a line about what you want to promote, or tell us on the call.");
      if (offers.length > OFFERS_MAX) return fail("offers", `Keep it to ${OFFERS_MAX} characters or fewer.`);
      return { success: true, answers: { offers } };
    }
    case "budget": {
      const digits = value("adBudgetRupees").replace(/[₹,\s]/g, "");
      if (!/^\d{1,7}$/.test(digits) || Number(digits) < 1 || Number(digits) > BUDGET_MAX) {
        return fail("adBudgetRupees", "Enter the monthly amount in rupees, for example 10000.");
      }
      const area = value("adArea");
      if (area.length < 2) return fail("adArea", "Say how far from you the ads should reach, for example 4 km around the clinic.");
      if (area.length > AREA_MAX) return fail("adArea", `Keep it to ${AREA_MAX} characters or fewer.`);
      return { success: true, answers: { adBudgetRupees: Number(digits), adArea: area } };
    }
    case "areas": {
      const areas = value("areas");
      if (areas.length < 2) return fail("areas", "Say where you want to be found, for example Naupada and Thane West.");
      if (areas.length > TEXT_MAX) return fail("areas", `Keep it to ${TEXT_MAX} characters or fewer.`);
      const competitors = value("competitors");
      if (competitors.length > TEXT_MAX) return fail("competitors", `Keep it to ${TEXT_MAX} characters or fewer.`);
      let google = value("googleBusinessUrl");
      if (google !== "") {
        let url: URL | null = null;
        try {
          url = new URL(google);
        } catch {
          url = null;
        }
        const bad = "Paste the full link, starting with https://.";
        if (url === null || url.protocol !== "https:" || google.length > TEXT_MAX) return fail("googleBusinessUrl", bad);
        if (url.username !== "" || url.password !== "" || !onHost(url.hostname, GOOGLE_HOSTS)) return fail("googleBusinessUrl", bad);
        google = url.toString();
      }
      return { success: true, answers: { areas, competitors, googleBusinessUrl: google } };
    }
  }
}

type Answers = Readonly<Record<string, unknown>> | undefined;

const filled = (answers: Answers, name: string): boolean => typeof answers?.[name] === "string" && (answers[name] as string).trim() !== "";

/** Which items are done, read from the saved answers of each service. */
export function doneSetupKeys(saved: { readonly social: Answers; readonly search: Answers }): SetupKey[] {
  const done: SetupKey[] = [];
  if (filled(saved.social, "instagramUrl") || filled(saved.social, "facebookUrl")) done.push("accounts");
  if (filled(saved.social, "offers")) done.push("offers");
  const budget = saved.social?.["adBudgetRupees"];
  if (typeof budget === "number" && budget > 0 && filled(saved.social, "adArea")) done.push("budget");
  if (filled(saved.search, "areas")) done.push("areas");
  return done;
}

/** What the form state carries back to the page. */
export type SetupFormState =
  | { readonly status: "idle" }
  | { readonly status: "saved"; readonly key: SetupKey }
  | { readonly status: "error"; readonly key: SetupKey; readonly field: string; readonly message: string; readonly values: Readonly<Record<string, string>> };

export const initialSetupFormState: SetupFormState = { status: "idle" };

export function isSetupKey(value: string): value is SetupKey {
  return (SETUP_KEYS as readonly string[]).includes(value);
}
