import "server-only";
import { cache } from "react";
import { listServiceSetups, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import type { ServiceKey } from "@/lib/first-look";
import { doneSetupKeys } from "@/lib/service-setup";
import { buildTodo, openCount, type TodoItem } from "@/lib/todo";
import { getAppDb } from "./db";
import { loadSetupServices } from "./first-look";
import { getProjectOverview } from "./onboarding";

export interface TodoData {
  readonly services: readonly ServiceKey[];
  readonly items: readonly TodoItem[];
  readonly open: number;
  /** The saved answers by item, for the forms' starting values. */
  readonly answers: Readonly<{ social: Readonly<Record<string, unknown>> | undefined; search: Readonly<Record<string, unknown>> | undefined }>;
}

/**
 * What the customer still owes us. Read once per request, keyed on the tenant object (requireCustomerAccess hands every
 * caller the same one), so the rail's count and the page agree. A failed read of the saved answers shows every Social
 * and Search item as open rather than breaking the page.
 */
export const loadTodo = cache(async (tenant: TenantContext): Promise<TodoData> => {
  const [services, overview, setups] = await Promise.all([
    loadSetupServices(tenant),
    getProjectOverview(),
    withTenantScope(getAppDb(), tenant, (tx) => listServiceSetups(tx, tenant.businessId)).catch((error: unknown) => {
      console.error("[todo] could not read the saved answers", errorLogInfo(error));
      return [];
    }),
  ]);
  const answers = { social: setups.find((row) => row.service === "social")?.answers, search: setups.find((row) => row.service === "search")?.answers };
  const items = buildTodo(services, overview.completed, doneSetupKeys(answers));
  return { services, items, open: openCount(items), answers };
});
