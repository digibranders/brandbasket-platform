const SITE_KEY = /^bbk_[A-Za-z0-9]{16,40}$/;

/**
 * The one line a customer's website adds to track visits, taps and form sends (plan 56). `serverForms` marks a site whose
 * own server counts its form sends, so the script must not count them too. The key is checked first, so a value that is
 * not a site key can never be pasted into a page.
 */
export function trackingSnippet(input: { readonly appOrigin: string; readonly key: string; readonly serverForms?: boolean }): string {
  if (!SITE_KEY.test(input.key)) throw new RangeError("A site key looks like bbk_ followed by 16 to 40 letters and digits");
  const origin = input.appOrigin.replace(/\/+$/, "");
  const forms = input.serverForms === true ? ' data-bb-forms="server"' : "";
  return `<script defer src="${origin}/t/v1.js" data-key="${input.key}"${forms}></script>`;
}
