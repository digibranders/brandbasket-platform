import { deploymentBrandId } from "@firstfold/shared/lib/deployment-brand";
import "server-only";
import {
  getSupportTicket,
  listConsents,
  listExportedSessions,
  listSupportTickets,
  readExportedAccount,
  readExportedBusiness,
  type Database,
} from "@firstfold/db";
import { DATA_RECIPIENTS } from "@firstfold/shared/lib/privacy/recipients";

/**
 * The file an owner downloads from Settings, Privacy (DPDP Act s.11: a summary of the personal data held, and who it has
 * been shared with). Plain JSON, readable and complete enough to move elsewhere. The account and business come from the
 * session's own ids, never from the request; support requests are read under the owner's own scope.
 */

export const ACCOUNT_EXPORT_FORMAT = "firstfold-account-export/1";

/** The format name the file carries: Firstfold's above, or "fynix-account-export/1" on a Fynix server. */
export function accountExportFormat(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return `${deploymentBrandId(env)}-account-export/1`;
}

/** What the download is saved as: "fynix-my-data-2026-11-01.json". */
export function accountExportFilename(day: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  return `${deploymentBrandId(env)}-my-data-${day}.json`;
}
/** The support list's own page size limit is 25; the export pages through it up to this many requests. */
const SUPPORT_PAGE_SIZE = 25;
const MAX_SUPPORT_TICKETS = 100;

/** The ids of the user's support requests, newest first, up to the cap. */
async function listSupportTicketIds(db: Database, userId: string): Promise<readonly string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  while (ids.length < MAX_SUPPORT_TICKETS) {
    const page = await listSupportTickets(db, userId, { limit: SUPPORT_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) });
    ids.push(...page.items.map((ticket) => ticket.id));
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  return ids.slice(0, MAX_SUPPORT_TICKETS);
}

/** What a download leaves out, and why, so the file does not read as everything there is. */
export const ACCOUNT_EXPORT_NOT_INCLUDED = [
  "Password and sign-in tokens: these are secrets, not information about you.",
  "The people your business deals with (enquiries, leads, patients, bookings, reviews of your business). They are other people's details, which your business holds for itself and can see in your dashboard.",
  "Pictures, videos and files you uploaded: download them from the pages where you added them.",
  "Tax invoices are listed here with the details printed on them. The PDFs are on the Billing page.",
] as const;

export interface AccountExportInput {
  readonly userId: string;
  readonly businessId: string;
  readonly now: Date;
}

export interface AccountExportDatabases {
  /** The customer connection, for what is read under the user's own scope. */
  readonly app: Database;
  /** The staff connection, for rows read by ids that come from the session. */
  readonly staff: Database;
}

export async function buildAccountExport(dbs: AccountExportDatabases, input: AccountExportInput) {
  const { userId, businessId, now } = input;
  const [account, sessions, businessRecords, consents, ticketIds] = await Promise.all([
    readExportedAccount(dbs.staff, userId),
    listExportedSessions(dbs.staff, userId),
    readExportedBusiness(dbs.staff, businessId),
    listConsents(dbs.staff, { type: "user", ref: userId }),
    listSupportTicketIds(dbs.app, userId),
  ]);
  const supportRequests = (await Promise.all(ticketIds.map((id) => getSupportTicket(dbs.app, userId, id)))).filter(
    (detail) => detail !== null,
  );

  return {
    format: accountExportFormat(),
    generatedAt: now.toISOString(),
    account:
      account === null
        ? null
        : {
            name: account.name,
            // An account opened with a number holds only a placeholder address, which is nothing about the person.
            ...(account.phoneNumber === null ? { email: account.email, emailConfirmed: account.emailVerified } : {}),
            mobileNumber: account.phoneNumber,
            mobileNumberConfirmed: account.phoneNumberVerified,
            createdAt: account.createdAt,
          },
    signIns: sessions,
    business: businessRecords,
    supportRequests: supportRequests.map((detail) => ({
      reference: detail.ticket.displayRef,
      category: detail.ticket.category,
      subject: detail.ticket.subject,
      status: detail.ticket.status,
      createdAt: detail.ticket.createdAt,
      messages: detail.messages.map((message) => ({ sentAt: message.createdAt, body: message.body })),
      screenshots: detail.attachments.length,
    })),
    consents: consents.map((consent) => ({
      purpose: consent.purpose,
      event: consent.event,
      noticeVersion: consent.noticeVersion,
      channel: consent.channel,
      recordedAt: consent.createdAt,
    })),
    sharedWith: DATA_RECIPIENTS,
    notIncluded: ACCOUNT_EXPORT_NOT_INCLUDED,
  };
}
