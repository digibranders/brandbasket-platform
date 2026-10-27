import { CaretDown, CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT, SERVICE_DOT, SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageColumns, PageFrame } from "@/components/v2/page";
import { SERVICE_NAMES } from "@/lib/first-look";
import type { TodoData } from "@/lib/server/todo";
import { openCount, type TodoItem } from "@/lib/todo";
import { SetupItemForm } from "./setup-item-form";
import { TodoRow } from "./todo-row";

interface TodoListProps {
  readonly items: readonly TodoItem[];
  readonly answers: TodoData["answers"];
  /** The item to open, from `?focus=`. Without it the first open form item starts open. */
  readonly focus?: string | undefined;
  /** What happens next, drawn beside the list: where the website's build stands, or the steps from the kickoff call. Null leaves the list the full width. */
  readonly buildCard?: ReactNode;
}

const ROW = "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-3";

function RowText({ item }: { readonly item: TodoItem }): ReactElement {
  return (
    <>
      <span>
        {item.done ? (
          <CheckCircle size={18} weight="fill" aria-hidden="true" className="text-sage" />
        ) : (
          <Circle size={18} aria-hidden="true" className="text-ink-2" />
        )}
        <span className="sr-only">{item.done ? "Done" : "To do"}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[0.84375rem] font-semibold text-ink">{item.label}</span>
        <span className="block text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-[7px] rounded-[2px]", SERVICE_DOT[item.service])} />
            {SERVICE_NAMES[item.service]}
          </span>{" "}
          · {item.hint}
        </span>
      </span>
    </>
  );
}

/** The To do page body: what the customer still owes us, open items first, in the one raised list. */
export function TodoList({ items, answers, focus, buildCard = null }: TodoListProps): ReactElement {
  const open = openCount(items);
  const sorted = [...items.filter((item) => !item.done), ...items.filter((item) => item.done)];
  const firstOpenForm = sorted.find((item) => item.kind === "form" && !item.done)?.key;
  const opened = focus !== undefined && items.some((item) => item.kind === "form" && item.key === focus) ? focus : firstOpenForm;
  return (
    <PageFrame title="What we still need from you" lede="From your kickoff call. Each answer is saved when you press Save.">
      {items.length === 0 ? (
        <EmptyState icon={CheckCircle} title="Nothing to do right now." text="If we need anything from you after your kickoff call, it appears here." />
      ) : (
        <PageColumns
          main={
            <>
              <ul className={LIFT}>
                {open > 0 ? null : (
                  <li className="p-5">
                    <EmptyState compact icon={CheckCircle} title="All set. Thank you." text="If we need anything else from you, it appears here." />
                  </li>
                )}
                {sorted.map((item) => (
                  <li key={item.key} id={item.key} className="border-t border-line first:border-t-0">
                    {item.kind === "link" ? (
                      <div className={ROW}>
                        <RowText item={item} />
                        <Link href={item.href} aria-label={`${item.done ? "Edit" : "Open"} ${item.label}`} className={SOFT_BUTTON}>
                          {item.done ? "Edit" : "Open"}
                        </Link>
                      </div>
                    ) : (
                      <TodoRow initiallyOpen={item.key === opened} className="group">
                        <summary className={cn(ROW, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                          <RowText item={item} />
                          <span className={SOFT_BUTTON}>
                            {item.done ? "Edit" : "Open"}
                            <CaretDown size={14} aria-hidden="true" className="transition-transform duration-200 group-open:rotate-180" />
                          </span>
                        </summary>
                        <SetupItemForm setup={item.setup} saved={item.setup === "areas" ? answers.search : answers.social} />
                      </TodoRow>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[0.8125rem] text-ink-2">
                Anything you cannot find? Bring it to a call or write to us in{" "}
                <Link href="/requests" className="font-semibold text-ink underline underline-offset-[3px]">
                  Requests
                </Link>
                .
              </p>
            </>
          }
          aside={buildCard}
        />
      )}
    </PageFrame>
  );
}
