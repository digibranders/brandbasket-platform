import type { ReactElement } from "react";
import { chatbotStatus, type ChatbotForStaff } from "@brandbasket/db";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Quiet, Section } from "@/components/console/section";
import { CHATBOT_NOTICES, type ChatbotNotice } from "@/lib/chatbot-form";
import { addChatbotAction, removeChatbotAction, setChatbotOperatorKeyAction, setChatbotStatusAction } from "@/app/(protected)/clients/[businessId]/actions";

const STATUS_LABELS = { setting_up: "Setting up", live: "Live", paused: "Paused" } as const;
const ROW_BUTTON = "!px-4 !py-2";

interface ClientChatbotsProps {
  readonly businessId: string;
  readonly chatbots: readonly ChatbotForStaff[];
  readonly notice: ChatbotNotice | null;
  /** Where OyeChats sends a bot's leads: this deployment's dashboard address plus the webhook path. */
  readonly webhookUrl: string;
}

/**
 * The client's chatbots, which Brandbasket runs in OyeChats. A bot has no account the customer can use, so staff register each one
 * here with the webhook secret OyeChats made for it, keep its status current, and the customer reads both on their OyeChats
 * page. The secret is write-only: it is stored for the signature check and never shown again.
 */
export function ClientChatbots({ businessId, chatbots, notice, webhookUrl }: ClientChatbotsProps): ReactElement {
  return (
    <Section
      title="OyeChats"
      id="chatbots"
      aside={chatbots.length === 0 ? undefined : `${chatbots.length} ${chatbots.length === 1 ? "bot" : "bots"}`}
    >
      {notice === null ? null : (
        <Notice tone={CHATBOT_NOTICES[notice].ok ? "ok" : "problem"} className="mb-6">
          {CHATBOT_NOTICES[notice].text}
        </Notice>
      )}

      {chatbots.length === 0 ? (
        <Quiet>No OyeChats bot yet. Add the one you set up in OyeChats below, and the customer sees it on their OyeChats page.</Quiet>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {chatbots.map((bot) => (
            <li key={bot.id} className="py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="font-medium text-ink">{bot.name}</p>
                <p className="text-sm tabular-nums text-ink-soft">
                  OyeChats bot {bot.oyechatsBotId} · {bot.leadCount} {bot.leadCount === 1 ? "lead" : "leads"}
                </p>
              </div>
              {bot.websiteUrl === null ? null : <p className="mt-1 text-sm text-ink-soft">{bot.websiteUrl}</p>}
              <p className="mt-1 text-sm text-ink-soft">
                Conversations: {bot.hasOperatorKey ? "the customer can open a lead and read it" : "no operator key yet, so a lead cannot be opened"}
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <form action={setChatbotStatusAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="chatbotId" value={bot.id} />
                  <label className={labelClasses}>
                    Status
                    <select name="status" defaultValue={bot.status} className={`${fieldClasses} !mt-1 !w-auto !py-2`}>
                      {chatbotStatus.enumValues.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <GatedSubmitButton className={`${buttonSecondary} ${ROW_BUTTON}`}>Save status</GatedSubmitButton>
                </form>
                <details className="group open:basis-full">
                  <summary className={`${buttonSecondary} ${ROW_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                    <span className="group-open:hidden">
                      {bot.hasOperatorKey ? "Replace key" : "Add key"}
                      <span className="sr-only"> for {bot.name}</span>
                    </span>
                    <span className="hidden group-open:inline">Never mind</span>
                  </summary>
                  <form action={setChatbotOperatorKeyAction} className="mt-4 max-w-md space-y-3">
                    <input type="hidden" name="businessId" value={businessId} />
                    <input type="hidden" name="chatbotId" value={bot.id} />
                    <label className={labelClasses}>
                      Operator key from OyeChats
                      <input name="operatorKey" autoComplete="off" spellCheck={false} minLength={16} maxLength={200} className={`${fieldClasses} font-mono`} />
                      <span className={`${hintClasses} block`}>
                        The key of the OyeChats operator bound to this bot. It is stored and not shown again.
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <GatedSubmitButton className={`${buttonSecondary} ${ROW_BUTTON}`}>Save key</GatedSubmitButton>
                      {bot.hasOperatorKey ? (
                        <button type="submit" name="intent" value="clear" formNoValidate className={`${buttonDanger} ${ROW_BUTTON}`}>
                          Remove key
                        </button>
                      ) : null}
                    </div>
                  </form>
                </details>
                <details className="group open:basis-full">
                  <summary className={`${buttonSecondary} ${ROW_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                    <span className="group-open:hidden">
                      Remove<span className="sr-only"> {bot.name}</span>
                    </span>
                    <span className="hidden group-open:inline">Never mind</span>
                  </summary>
                  <form action={removeChatbotAction} className="mt-4 max-w-md space-y-3">
                    <input type="hidden" name="businessId" value={businessId} />
                    <input type="hidden" name="chatbotId" value={bot.id} />
                    <label className="flex items-start gap-3 text-sm font-medium">
                      <input type="checkbox" name="confirm" value="yes" required className={checkboxClasses} />
                      <span>
                        Remove {bot.name} and its {bot.leadCount} {bot.leadCount === 1 ? "lead" : "leads"} from the customer’s dashboard.
                        <RequiredMark />
                      </span>
                    </label>
                    <GatedSubmitButton className={`${buttonDanger} ${ROW_BUTTON}`}>Remove {bot.name}</GatedSubmitButton>
                  </form>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={addChatbotAction} className="mt-8 grid max-w-2xl gap-5 sm:grid-cols-2">
        <input type="hidden" name="businessId" value={businessId} />
        <h3 className="font-medium text-ink sm:col-span-2">Add an OyeChats bot</h3>
        <label className={labelClasses}>
          Name the customer sees
          <RequiredMark />
          <input name="name" required maxLength={80} placeholder="Website assistant" className={fieldClasses} />
        </label>
        <label className={labelClasses}>
          OyeChats bot number
          <RequiredMark />
          <input name="oyechatsBotId" required inputMode="numeric" pattern="[1-9][0-9]{0,8}" placeholder="41" className={fieldClasses} />
        </label>
        <label className={`${labelClasses} sm:col-span-2`}>
          Website it runs on
          <input name="websiteUrl" type="url" maxLength={300} placeholder="https://" className={fieldClasses} />
        </label>
        <label className={`${labelClasses} sm:col-span-2`}>
          Webhook secret from OyeChats
          <RequiredMark />
          <input name="webhookSecret" required autoComplete="off" spellCheck={false} minLength={16} maxLength={200} className={`${fieldClasses} font-mono`} />
          <span className={`${hintClasses} block`}>
            In OyeChats, add a webhook for this bot with the address below and the event “lead_captured”. Paste the secret OyeChats
            gives you here. It is not shown again.
          </span>
        </label>
        <label className={`${labelClasses} sm:col-span-2`}>
          Operator key from OyeChats
          <input name="operatorKey" autoComplete="off" spellCheck={false} minLength={16} maxLength={200} className={`${fieldClasses} font-mono`} />
          <span className={`${hintClasses} block`}>
            Optional now, needed before the customer can open a lead to read the conversation. In OyeChats, add an operator bound to this bot,
            sign that operator in once through the operator login, and paste the access token it returns. It is not shown again.
          </span>
        </label>
        <p className="rounded-2xl bg-paper-deep px-4 py-3 text-sm text-ink sm:col-span-2">
          Webhook address: <code className="break-all font-mono">{webhookUrl}</code>
        </p>
        <div className="sm:col-span-2">
          <GatedSubmitButton className={buttonPrimary}>Add bot</GatedSubmitButton>
        </div>
      </form>
    </Section>
  );
}
