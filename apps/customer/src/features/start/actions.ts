"use server";

import { readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { questionAfter, type IntakeField } from "@brandbasket/shared/lib/intake/questions";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionFail, type ActionResult } from "@/lib/action-result";
import { parseForm } from "@/lib/form";
import { requireCustomer } from "@/lib/guards";
import { membershipHrefWithServices, readSelectedServices, servicesAfterToggle } from "../checkout/rules/membership";
import { INTAKE_SUMMARY_STEP, SERVICE_KEY_OF, startHref } from "./rules";
import { completeIntake, loadIntake, saveIntakeAnswer, saveIntakeServices } from "./server";

/*
 * The questions' actions, ported from apps/platform app/app-host/(protected)/personalize/actions.ts. Open to the signed-in
 * member of a business, like the old page's actions; the business is the session's, never the form's. Answers are upserts, so
 * a repeated submit is harmless.
 */

const MAX_BASKET = 200;
const values = z.union([z.string().max(MAX_BASKET), z.array(z.string().max(MAX_BASKET)).max(20)]).optional();
const basket = z.string().max(MAX_BASKET).default("");

const AnswerForm = z.object({ field: z.string().min(1).max(40), services: basket, value: values });
const ToggleForm = z.object({ services: basket, toggle: z.string().max(40) });
const BasketForm = z.object({ services: basket });

/** The basket posted with the form: only catalogue ids survive, the website alone when none is named. */
const basketOf = (services: string) => readSelectedServices({ services });

/**
 * Saves one answer and moves on to the next question that applies, or to the summary after the last. The answer is checked
 * against the question's own options; a refused answer comes back as a message beside the question and writes nothing.
 */
export async function saveAnswerAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { tenant } = await requireCustomer();
  const parsed = parseForm(AnswerForm, formData);
  if (!parsed.ok) return parsed;
  const services = basketOf(parsed.data.services);
  const raw = parsed.data.value;
  const outcome = await saveIntakeAnswer(tenant, {
    field: parsed.data.field,
    values: raw === undefined ? [] : Array.isArray(raw) ? raw : [raw],
    services,
    now: new Date(),
  });
  if (outcome.kind === "refused") return actionFail(outcome.message);
  const { answers } = await loadIntake(tenant);
  const next = questionAfter(services.map((id) => SERVICE_KEY_OF[id]), answers, parsed.data.field as IntakeField);
  redirect(startHref(services, next === null ? INTAKE_SUMMARY_STEP : next.field));
}

/** Adds a service to the basket, or takes it out (never the last one), and stays on the summary: new questions appear there. */
export async function toggleServiceAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { tenant } = await requireCustomer();
  const parsed = parseForm(ToggleForm, formData);
  if (!parsed.ok) return parsed;
  const services = basketOf(parsed.data.services);
  const [toggled] = readBundleSelection([parsed.data.toggle]);
  const next = toggled === undefined ? services : servicesAfterToggle(services, toggled);
  await saveIntakeServices(tenant, next, new Date());
  redirect(startHref(next, INTAKE_SUMMARY_STEP));
}

/**
 * Continue to checkout from the summary, and Skip for now from any question: the questions are done, answered or not, and the
 * checkout opens on this basket. The kickoff call covers what was left.
 */
export async function continueToCheckoutAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { tenant } = await requireCustomer();
  const parsed = parseForm(BasketForm, formData);
  if (!parsed.ok) return parsed;
  const services = basketOf(parsed.data.services);
  const now = new Date();
  await saveIntakeServices(tenant, services, now);
  await completeIntake(tenant, now);
  redirect(membershipHrefWithServices("managed", services));
}
