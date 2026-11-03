import { PageHeader, Panel, PanelError } from "@/components";
import type { CustomerContext } from "@/lib/guards";
import { load } from "@/lib/loaded";
import { Icon, LinkButton, SERVICE_NAMES } from "@/ui";
import { loadNotBought } from "../loader";
import type { SetupService } from "../rules";

/**
 * Service not bought (plan 61, section 4): what it does in two sentences, what is included, the price with the package
 * discount, and Add to plan. No preview of a dashboard that would have nothing in it. Viewers read it; only others get the button.
 */
export async function NotBought({ service, customer }: { readonly service: SetupService; readonly customer: CustomerContext }) {
  const name = SERVICE_NAMES[service];
  const view = await load("setup.not-bought", () => loadNotBought(customer, service));
  const canAdd = customer.role !== "viewer";
  if (!view.ok) {
    return (
      <>
        <PageHeader title={name} />
        <Panel>
          <PanelError failure={view.error} what={`the price of ${name}`} />
        </Panel>
      </>
    );
  }
  const { lead, includes, price, listPrice, offer, note, addHref } = view.data;
  return (
    <>
      <PageHeader title={name} />
      <Panel>
        <div className="flex max-w-reading flex-col gap-4">
          <p className="type-body text-ink">{lead}</p>
          <ul className="flex flex-col gap-2">
            {includes.map((item) => (
              <li key={item} className="flex items-start gap-2 type-body text-ink">
                <Icon name="Check" size="sm" className="mt-0.5 text-pos-text" />
                {item}
              </li>
            ))}
          </ul>
          <div>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="type-metric">{price}</span>
              {listPrice === null ? null : <span className="type-meta line-through">{listPrice}</span>}
            </p>
            {offer === null ? null : <p className="type-meta">{offer}</p>}
            <p className="type-meta">{note}</p>
          </div>
          {canAdd ? (
            <div>
              <LinkButton href={addHref} variant="primary">
                Add to plan
              </LinkButton>
            </div>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
