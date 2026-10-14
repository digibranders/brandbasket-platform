import type { ClientSummary } from "@fynix/db";
import { PROJECT_STATUSES_WAITING_ON_US } from "@fynix/shared/lib/project-status";

export interface WaitingClient {
  readonly client: ClientSummary;
  /** When the first preview was promised, if the build has a deadline. */
  readonly dueAt: Date | null;
  readonly overdue: boolean;
}

/**
 * The clients whose next move is ours, most urgent first: the earliest deadline leads, overdue ones included, and
 * anything without a deadline follows, newest client first.
 */
export function clientsWaitingOnUs(clients: readonly ClientSummary[], now: Date): WaitingClient[] {
  return clients
    .flatMap((client): WaitingClient[] => {
      if (client.project === null || !PROJECT_STATUSES_WAITING_ON_US.includes(client.project.status)) return [];
      const dueAt = client.project.slaDueAt;
      return [{ client, dueAt, overdue: dueAt !== null && dueAt.getTime() < now.getTime() }];
    })
    .sort((a, b) => {
      if (a.dueAt === null && b.dueAt === null) return b.client.createdAt.getTime() - a.client.createdAt.getTime();
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      return a.dueAt.getTime() - b.dueAt.getTime();
    });
}
