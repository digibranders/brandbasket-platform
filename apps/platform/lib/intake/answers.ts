import { questionFor, type IntakeAnswers, type IntakeQuestion } from "@brandbasket/shared/lib/intake/questions";

/** The columns a save sets: only the ones named are written. */
export type IntakePatch = Partial<IntakeAnswers>;

export type ParsedAnswer = { readonly ok: true; readonly patch: IntakePatch } | { readonly ok: false; readonly message: string };

const MAX_URL_LENGTH = 300;

/** A website address as typed ("sharmadental.in", "http://x.in/") to the https form stored, or null when it is not an address. */
export function normalizeWebsiteUrl(raw: string): string | null {
  const text = raw.trim();
  if (text === "" || /\s/.test(text)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.username !== "" || url.password !== "") return null;
    const clean = `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
    return clean.length <= MAX_URL_LENGTH ? clean : null;
  } catch {
    return null;
  }
}

function parseUrl(raw: readonly string[]): ParsedAnswer {
  const text = (raw[0] ?? "").trim();
  // An empty address passes the question over: the answer is cleared.
  if (text === "") return { ok: true, patch: { existingWebsiteUrl: null } };
  const url = normalizeWebsiteUrl(text);
  return url === null ? { ok: false, message: "That does not look like a website address. Try something like sharmadental.in." } : { ok: true, patch: { existingWebsiteUrl: url } };
}

function parseChoice(question: IntakeQuestion, raw: readonly string[], answers: IntakeAnswers): ParsedAnswer {
  const allowed = new Set(question.options(answers).map((option) => option.value));
  const chosen = [...new Set(raw)].filter((value) => value !== "");
  if (question.kind === "single") {
    const value = chosen[0];
    if (chosen.length !== 1 || value === undefined || !allowed.has(value)) return { ok: false, message: "Choose one of the options." };
    return { ok: true, patch: { [question.field]: value } };
  }
  if (chosen.length === 0 || chosen.some((value) => !allowed.has(value))) return { ok: false, message: "Choose at least one of the options." };
  // "Let BrandBasket recommend" is the whole answer: it does not combine with a channel.
  return { ok: true, patch: { [question.field]: chosen.includes("recommend") ? ["recommend"] : chosen } };
}

/**
 * Checks one posted answer against the question's own options and works out what the save writes. Answers that other
 * answers decide are reset with it: a new kind of business forgets the kind of practice, and "no website yet" forgets
 * the address. Nothing is trusted from the form beyond the question's name and the values.
 */
export function parseIntakeAnswer(field: string, raw: readonly string[], answers: IntakeAnswers): ParsedAnswer {
  const question = questionFor(field);
  if (question === undefined) return { ok: false, message: "We could not tell which question that was. Reload the page and try again." };
  const parsed = question.kind === "url" ? parseUrl(raw) : parseChoice(question, raw, answers);
  if (!parsed.ok) return parsed;
  if (question.field === "businessType" && parsed.patch.businessType !== answers.businessType) return { ok: true, patch: { ...parsed.patch, businessSubtype: null } };
  if (question.field === "websiteState" && parsed.patch.websiteState === "no_site") return { ok: true, patch: { ...parsed.patch, existingWebsiteUrl: null } };
  return parsed;
}
