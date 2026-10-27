import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { nextStep } from "@brandbasket/shared/lib/next-step";
import { NextSteps } from "@/components/first-look/next-steps";
import { NextStepCard } from "@/components/panel/next-step-card";
import { TodoList } from "@/components/todo/todo-list";
import { projectStageIndex } from "@/lib/project-stages";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { getSetupCallState } from "@/lib/server/setup-call";
import { loadTodo } from "@/lib/server/todo";

export const metadata: Metadata = { title: "To do" };

interface TodoPageProps {
  readonly searchParams: Promise<{ readonly focus?: string | readonly string[] }>;
}

export default async function TodoPage({ searchParams }: TodoPageProps): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  // To do is for paid accounts; the home page tells the rest what is next.
  if (!billing.hasAccess) redirect("/");
  const [{ items, answers }, { focus }, { project, completed }, liveWebsite, callState] = await Promise.all([
    loadTodo(tenant),
    searchParams,
    getProjectOverview(),
    getLiveWebsite(),
    getSetupCallState(tenant),
  ]);
  // Beside the list: the card Overview shows while the website is being built (where it stands and what comes next), and before that the steps from the kickoff call.
  const step = nextStep({ project, completedSteps: completed, liveWebsite });
  const showsBuildCard = step.kind === "building" || step.kind === "on-hold" || step.kind === "review" || step.kind === "approved" || step.kind === "live";
  // Going live closes the project, so the live site is the only thing that still knows the status (see Overview).
  const status = liveWebsite === null ? (project?.status ?? null) : "live";
  const buildStageIndex = status === null ? 0 : projectStageIndex({ status, onboardingSubmittedAt: project?.onboardingSubmittedAt ?? null });
  return (
    <TodoList
      items={items}
      answers={answers}
      focus={typeof focus === "string" ? focus : undefined}
      buildCard={
        showsBuildCard ? (
          <NextStepCard step={step} buildStageIndex={buildStageIndex} />
        ) : (
          <NextSteps
            hasWebsite={billing.hasWebsite}
            callStartIso={callState.booking?.startsAtIso ?? null}
            booked={callState.booking !== null}
            held={callState.booking?.heldAtIso != null}
          />
        )
      }
    />
  );
}
