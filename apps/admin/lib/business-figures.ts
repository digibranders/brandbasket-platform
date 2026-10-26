import type { ClientSummary, CollectedAmount, Lead, SupportStatus } from "@brandbasket/db";
import { countPayingClients } from "@brandbasket/shared/lib/billing/client-payment";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { FigureItem } from "@/components/console/figures";
import { monthRange, todayRange } from "./team-time";
import { clientsWaitingOnUs } from "./waiting-clients";

/** The raw reads behind the figures. `ticketCounts` is null when the counts could not be read. */
export interface FigureSources {
  readonly leads: readonly Pick<Lead, "createdAt">[];
  readonly clients: readonly ClientSummary[];
  readonly collected: readonly CollectedAmount[];
  readonly ticketCounts: Readonly<Record<SupportStatus, number>> | null;
  readonly activeErrors: number;
}

/** The numbers the figures line shows, worked out from the sources. */
export interface FiguresInput {
  readonly leadsThisWeek: number;
  readonly leadsLastWeek: number;
  readonly payingClients: number;
  readonly newPayingThisMonth: number;
  readonly collected: readonly CollectedAmount[];
  readonly inBuild: number;
  readonly previewsDueToday: number;
  readonly openRequests: number;
  readonly newRequests: number;
  readonly activeErrors: number;
}

const WEEK_MS = 7 * 86_400_000;

export function figuresInput(sources: FigureSources, now: Date): FiguresInput {
  const ageOf = (lead: Pick<Lead, "createdAt">): number => now.getTime() - lead.createdAt.getTime();
  const month = monthRange(now);
  const today = todayRange(now);
  const waiting = clientsWaitingOnUs(sources.clients, now);
  const counts = sources.ticketCounts;
  return {
    leadsThisWeek: sources.leads.filter((lead) => ageOf(lead) < WEEK_MS).length,
    leadsLastWeek: sources.leads.filter((lead) => ageOf(lead) >= WEEK_MS && ageOf(lead) < 2 * WEEK_MS).length,
    payingClients: countPayingClients(sources.clients, now),
    newPayingThisMonth: sources.clients.filter((client) => {
      const paidAt = client.billing.firstPayment?.paidAt ?? null;
      return paidAt !== null && paidAt.getTime() >= month.start.getTime() && paidAt.getTime() < month.end.getTime();
    }).length,
    collected: sources.collected,
    inBuild: waiting.length,
    previewsDueToday: waiting.filter((entry) => entry.dueAt !== null && !entry.overdue && entry.dueAt.getTime() < today.end.getTime()).length,
    openRequests: counts === null ? 0 : counts.new + counts.triaged + counts.in_progress + counts.waiting_on_you,
    newRequests: counts?.new ?? 0,
    activeErrors: sources.activeErrors,
  };
}

/** Rupees first (the business is billed in India); dollars, when any came in, as the note. */
export function collectedText(collected: readonly CollectedAmount[]): { readonly value: string; readonly note: string } {
  const rupees = collected.find((row) => row.currency === "INR")?.amountCents ?? 0;
  const dollars = collected.find((row) => row.currency === "USD")?.amountCents ?? 0;
  return { value: formatMoney(rupees, "INR"), note: dollars === 0 ? "This month" : `and ${formatMoney(dollars, "USD")} in dollars` };
}

/** The six figures at the top of Today. */
export function businessFigures(input: FiguresInput): readonly FigureItem[] {
  const enquiries = input.leadsThisWeek - input.leadsLastWeek;
  const collected = collectedText(input.collected);
  return [
    {
      value: String(input.leadsThisWeek),
      label: "New enquiries, 7 days",
      note: enquiries === 0 ? "Same as last week" : `${enquiries > 0 ? "+" : ""}${enquiries} vs last week`,
      tone: enquiries >= 0 ? "good" : "warn",
    },
    {
      value: String(input.payingClients),
      label: "Paying clients",
      note: input.newPayingThisMonth === 0 ? "None new this month" : `+${input.newPayingThisMonth} this month`,
      tone: "good",
    },
    { value: collected.value, label: "Collected this month", note: collected.note, tone: "good", long: true },
    {
      value: String(input.inBuild),
      label: "In build",
      note:
        input.previewsDueToday === 0
          ? "No previews due today"
          : `${input.previewsDueToday} ${input.previewsDueToday === 1 ? "preview" : "previews"} due today`,
      tone: input.previewsDueToday === 0 ? "good" : "warn",
    },
    {
      value: String(input.openRequests),
      label: "Open requests",
      note: input.newRequests === 0 ? "All have a reply" : `${input.newRequests} with no reply yet`,
      tone: input.newRequests === 0 ? "good" : "warn",
    },
    {
      value: String(input.activeErrors),
      label: "Errors to look at",
      note: input.activeErrors === 0 ? "None open" : "New or being checked",
      tone: input.activeErrors === 0 ? "good" : "bad",
    },
  ];
}
