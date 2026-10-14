import type { MetadataRoute } from "next";

/** The customer app and staff admin are private, so nothing on either host should be crawled. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
