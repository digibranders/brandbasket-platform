import { Panel } from "@/components";
import { Icon, LinkButton } from "@/ui";
import { SETUP_CARD_ID, setupCardTitle, type SetupAsk } from "../rules";

/**
 * The one card on a service page that asks for what we cannot start without. Each question opens its item in the setup
 * checklist. Nothing is shown when nothing is needed.
 */
export function SetupCard({ asks }: { readonly asks: readonly SetupAsk[] }) {
  if (asks.length === 0) return null;
  return (
    <div id={SETUP_CARD_ID} className="scroll-mt-24">
      <Panel title={setupCardTitle(asks.length)} flush>
        <ul>
          {asks.map((ask) => (
            <li key={ask.key} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
              <Icon name="CheckCircle" className="text-ink-muted" />
              <div className="min-w-0 flex-1">
                <p className="type-body font-medium text-ink">{ask.label}</p>
                <p className="type-meta">{ask.hint}</p>
              </div>
              <LinkButton href={ask.href} size="sm">
                Add
              </LinkButton>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
