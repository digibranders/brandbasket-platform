import { z } from "zod";
import type { TokenSource } from "../ga4/service-account";
import { callGoogle } from "./http";

/*
 * The Analytics Admin API, for the few things go live needs (plan 62): find the Brandbasket clients account, make a client's
 * property and web stream, and mark the key events. Needs the write sign-in. One property per client.
 */

const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const WHAT = "Analytics Admin";

export const KEY_EVENTS = ["form_send", "call_tap", "whatsapp_tap"] as const;

export interface AnalyticsAccount {
  /** `accounts/123` */
  readonly account: string;
  readonly properties: readonly { readonly property: string; readonly displayName: string }[];
}

const summariesSchema = z.object({
  accountSummaries: z
    .array(z.object({ account: z.string(), displayName: z.string(), propertySummaries: z.array(z.object({ property: z.string(), displayName: z.string() })).default([]) }))
    .default([]),
});

export interface AnalyticsAdmin {
  /** The account with this name and the properties it holds, or null when there is none. */
  readonly findAccount: (displayName: string) => Promise<AnalyticsAccount | null>;
  /** Returns the property's id (digits). */
  readonly createProperty: (account: string, displayName: string) => Promise<string>;
  /** Returns the web stream's measurement id (`G-...`). */
  readonly createWebStream: (propertyId: string, siteUrl: string, displayName: string) => Promise<string>;
  readonly createKeyEvent: (propertyId: string, eventName: string) => Promise<void>;
}

const idOf = (name: string): string => name.slice(name.lastIndexOf("/") + 1);

export function createAnalyticsAdmin(token: TokenSource, fetchFn: typeof fetch = fetch): AnalyticsAdmin {
  return {
    async findAccount(displayName) {
      const { json } = await callGoogle(token, { method: "GET", url: `${ADMIN}/accountSummaries?pageSize=200`, what: WHAT }, fetchFn);
      const found = summariesSchema.parse(json).accountSummaries.find((summary) => summary.displayName === displayName);
      return found === undefined ? null : { account: found.account, properties: found.propertySummaries };
    },
    async createProperty(account, displayName) {
      const { json } = await callGoogle(token, { method: "POST", url: `${ADMIN}/properties`, what: WHAT, body: { parent: account, displayName, timeZone: "Asia/Kolkata", currencyCode: "INR" } }, fetchFn);
      return idOf(z.object({ name: z.string().regex(/^properties\/\d+$/) }).parse(json).name);
    },
    async createWebStream(propertyId, siteUrl, displayName) {
      const { json } = await callGoogle(token, { method: "POST", url: `${ADMIN}/properties/${propertyId}/dataStreams`, what: WHAT, body: { type: "WEB_DATA_STREAM", displayName, webStreamData: { defaultUri: siteUrl } } }, fetchFn);
      return z.object({ webStreamData: z.object({ measurementId: z.string().regex(/^G-[A-Z0-9]+$/) }) }).parse(json).webStreamData.measurementId;
    },
    async createKeyEvent(propertyId, eventName) {
      // 409: the key event is already there, which is what we wanted.
      await callGoogle(token, { method: "POST", url: `${ADMIN}/properties/${propertyId}/keyEvents`, what: WHAT, body: { eventName, countingMethod: "ONCE_PER_EVENT" }, accept: [409] }, fetchFn);
    },
  };
}

