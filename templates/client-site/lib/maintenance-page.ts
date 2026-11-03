/** What the notice can say about the business. All optional: the platform sends nothing once a plan has ended, so these come from the site's own hosting settings. */
export interface MaintenanceDetails {
  readonly businessName?: string;
  /** The business's public phone number, shown as a call link. */
  readonly phone?: string;
  /** The business's public email address, shown as a mail link. */
  readonly email?: string;
}

const EMAIL_SHAPE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const MIN_PHONE_DIGITS = 6;

/** Escapes text for HTML: these values come from the site's own settings, but it is cheap to be safe. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Reads the notice's details from the site's hosting settings: SITE_BUSINESS_NAME, SITE_CONTACT_PHONE, SITE_CONTACT_EMAIL.
 * A value that is empty or does not look like a phone number or an email address is left out, so a typo in a setting
 * hides a link instead of showing a broken one.
 */
export function maintenanceDetails(env: Readonly<Record<string, string | undefined>> = process.env): MaintenanceDetails {
  const name = env.SITE_BUSINESS_NAME?.trim();
  const phone = env.SITE_CONTACT_PHONE?.trim();
  const email = env.SITE_CONTACT_EMAIL?.trim();
  return {
    ...(name ? { businessName: name } : {}),
    ...(phone && phone.replace(/\D/g, "").length >= MIN_PHONE_DIGITS ? { phone } : {}),
    ...(email && EMAIL_SHAPE.test(email) ? { email } : {}),
  };
}

const CSS = `
body:has(.mt){margin:0}
.mt{--ink:#0f172a;--soft:#475569;--faint:#64748b;--line:#d7dce3;--bg:#f4f5f7;--amber:#e0a100;--amber-ink:#7c5200;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.mt *{box-sizing:border-box}
.mt-tape{height:6px;background:repeating-linear-gradient(-45deg,var(--amber) 0 12px,var(--ink) 12px 24px)}
.mt-head,.mt-main,.mt-foot{width:100%;max-width:62rem;margin:0 auto;padding-inline:clamp(1.25rem,5vw,2.5rem)}
.mt-head{padding-block:1.5rem;border-bottom:1px solid var(--line);font-size:.9375rem;font-weight:600;letter-spacing:.01em}
.mt-main{flex:1;padding-block:clamp(3rem,9vh,6rem)}
.mt-label{margin:0;font-size:.9375rem;font-weight:600;color:var(--amber-ink)}
.mt-h1{margin:1rem 0 0;max-width:15ch;font-size:clamp(2.25rem,6vw,4rem);line-height:1.04;letter-spacing:-.03em;font-weight:650;text-wrap:balance}
.mt-lead{margin:1.5rem 0 0;max-width:46ch;font-size:1.125rem;line-height:1.65;color:var(--soft)}
.mt-facts{margin:clamp(2.5rem,7vh,4rem) 0 0;padding:0;max-width:36rem;border-top:1px solid var(--line)}
.mt-facts>div{display:grid;grid-template-columns:7rem 1fr;gap:1rem;align-items:baseline;padding-block:1rem;border-bottom:1px solid var(--line)}
.mt-facts dt{font-size:.875rem;color:var(--faint)}
.mt-facts dd{margin:0;font-size:1rem;font-weight:500;overflow-wrap:anywhere}
.mt-facts a{color:var(--ink);text-decoration:underline;text-decoration-color:var(--line);text-decoration-thickness:2px;text-underline-offset:.3em}
.mt-facts a:hover{text-decoration-color:var(--ink)}
.mt-facts a:focus-visible{outline:3px solid var(--amber);outline-offset:3px;border-radius:2px}
.mt-foot{padding-block:1.5rem;font-size:.8125rem;color:var(--faint)}
`;

/**
 * The notice as HTML: a stylesheet and the page body, all classes under `.mt` so it cannot clash with a site's own styles.
 * One source for both places that show it: the layout (through components/maintenance.tsx) and the proxy (through
 * lib/maintenance-response.ts, which cannot render React). Nothing here says why the site is paused: visitors are the
 * business's customers.
 */
export function maintenanceMarkup(details: MaintenanceDetails = {}): string {
  const name = details.businessName === undefined ? undefined : escapeHtml(details.businessName);
  const lead = name === undefined ? "This website" : `${name}&rsquo;s website`;
  const rows = [
    ["Status", "Temporarily unavailable"],
    ["Expected", "Back shortly"],
    ...(details.phone === undefined ? [] : [["Phone", `<a href="tel:${escapeHtml(details.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(details.phone)}</a>`]]),
    ...(details.email === undefined ? [] : [["Email", `<a href="mailto:${escapeHtml(details.email)}">${escapeHtml(details.email)}</a>`]]),
  ];
  const facts = rows.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join("");
  const head = name === undefined ? "" : `<header class="mt-head">${name}</header>`;
  const foot = name === undefined ? "" : `<footer class="mt-foot">&copy; ${new Date().getFullYear()} ${name}</footer>`;
  return `<style>${CSS}</style><div class="mt"><div class="mt-tape" aria-hidden="true"></div>${head}<main class="mt-main"><p class="mt-label">Under maintenance</p><h1 class="mt-h1">We&rsquo;re updating our website.</h1><p class="mt-lead">${lead} is temporarily unavailable while we carry out maintenance. We expect to be back shortly.</p><dl class="mt-facts">${facts}</dl></main>${foot}</div>`;
}
