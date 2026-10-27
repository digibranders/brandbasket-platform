"use server";

import { saveServiceSetup, withTenantScope } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { loadSetupServices } from "@/lib/server/first-look";
import { isSetupKey, parseSetupItem, SETUP_FIELDS, SETUP_SERVICE, type SetupFormState } from "@/lib/service-setup";

/**
 * Saves one To do item's answers for the signed-in customer. The business comes from the session, never from the form;
 * only the item's own fields are read from the form. Answers are never logged.
 */
export async function saveSetupItemAction(_previous: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const { tenant, billing } = await requireCustomerAccess();
  const key = String(formData.get("key") ?? "");
  if (!isSetupKey(key)) throw new Error("Unknown To do item.");

  const values: Record<string, string> = {};
  for (const field of SETUP_FIELDS[key]) values[field.name] = String(formData.get(field.name) ?? "");

  // To do is for paid accounts: a page opened before access lapsed must not save.
  if (!billing.hasAccess) return { status: "error", key, field: "", message: "We could not save that. Please try again.", values };

  const parsed = parseSetupItem(key, values);
  if (!parsed.success) return { status: "error", key, field: parsed.field, message: parsed.message, values };

  const service = SETUP_SERVICE[key];
  const bought = await loadSetupServices(tenant);
  if (bought === null) return { status: "error", key, field: "", message: "We could not save that. Please try again.", values };
  if (!bought.includes(service)) return { status: "error", key, field: "", message: "That item is not part of your plan.", values };

  try {
    await withTenantScope(getAppDb(), tenant, (tx) =>
      saveServiceSetup(tx, { businessId: tenant.businessId, service, answers: parsed.answers, now: new Date() }),
    );
  } catch (error) {
    console.error("[todo] could not save an answer", errorLogInfo(error));
    return { status: "error", key, field: "", message: "We could not save that. Please try again.", values };
  }
  revalidatePath("/todo");
  revalidatePath("/");
  return { status: "saved", key };
}
