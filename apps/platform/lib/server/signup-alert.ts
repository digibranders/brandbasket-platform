import "server-only";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { serverEnv } from "./env";
import { alertTeams } from "./teams";
import { signupTeamsCard } from "./teams-cards";

export interface SignupAlert {
  readonly leadId: string;
  readonly name: string;
  readonly businessName: string;
  readonly email: string;
  /** E.164, or null. */
  readonly phone: string | null;
  /** The plan chosen on the form, by name; null when none. */
  readonly plan: string | null;
}

/** Tells the Teams enquiries channel that someone opened an account. Best effort: never throws and never waits on Teams. */
export function alertSignupLead(signup: SignupAlert): void {
  try {
    const leadUrl = new URL(`/leads/${signup.leadId}`, serverEnv().ADMIN_ORIGIN).toString();
    void alertTeams(
      "enquiries",
      signupTeamsCard({
        name: signup.name,
        businessName: signup.businessName,
        email: signup.email,
        phone: signup.phone === null ? null : displayPhone(signup.phone).text,
        plan: signup.plan,
        leadUrl,
      }),
    );
  } catch (error) {
    console.error("A sign-up was saved but Teams could not be told about it.", errorLogInfo(error));
  }
}
