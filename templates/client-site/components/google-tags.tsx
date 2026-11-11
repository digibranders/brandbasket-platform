import Script from "next/script";
import { ga4Id, gscVerificationToken } from "@/lib/google-tags";

/** Goes in the `<head>`: lets Google Search Console verify the site. Renders nothing without a valid token. */
export function GoogleSiteVerification({ token = gscVerificationToken() }: { readonly token?: string }) {
  return token ? <meta name="google-site-verification" content={token} /> : null;
}

/** Google Analytics. Renders nothing, and so loads no script and sets no cookie, until a valid id is set. The id is checked against `G-...` so it is safe inside the inline script. */
export function GoogleAnalytics({ id = ga4Id() }: { readonly id?: string }) {
  if (!id) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-config" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  );
}
