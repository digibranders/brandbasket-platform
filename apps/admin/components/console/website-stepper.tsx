import { Stepper } from "@brandbasket/shared/ui/patterns";
import type { ReactElement } from "react";
import { stepperIndex, WEBSITE_STEPS, type WebsiteStage } from "@/lib/website-stage";

/**
 * The five stages of a website build. Done steps are sage, the current step is gold. On hold or cancelled no step is current,
 * because the stage the build stopped at is not recorded; the line under the steps says so in words.
 */
export function WebsiteStepper({ stage }: { readonly stage: WebsiteStage }): ReactElement {
  const index = stepperIndex(stage);
  return (
    <div className="mb-6">
      <Stepper steps={WEBSITE_STEPS} activeIndex={index ?? -1} />
      {index === null ? (
        <p className="mt-2 text-sm text-ink-2">{stage === "hold" ? "On hold. No stage is current until the build resumes." : "Cancelled. No stage is current."}</p>
      ) : null}
    </div>
  );
}
