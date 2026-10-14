/*
 * Based on the page file Payload's own installer generates for the admin panel's catch-all — see
 * ../../layout.tsx for why it was hand-adapted here rather than generated in place. Only deviation: imports
 * `@/payload.config` instead of the installer's own `@payload-config` alias, matching this repo's existing `@/*`
 * alias rather than adding a second one.
 */
import type { Metadata } from "next";
import config from "@/payload.config";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import { importMap } from "../importMap.js";

type Args = {
  params: Promise<{
    segments: string[];
  }>;
  searchParams: Promise<{
    [key: string]: string | string[];
  }>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

const Page = ({ params, searchParams }: Args) => RootPage({ config, params, searchParams, importMap });

export default Page;
