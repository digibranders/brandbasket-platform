import { permanentRedirect } from "next/navigation";
import { signUpHrefForJoin, type SearchParams } from "@/features/entry/rules/account-entry";

/** The old sign-up address. Public. Links already out there keep working: they go on to /signup with their parameters. */
export default async function JoinPage({ searchParams }: { readonly searchParams: Promise<SearchParams> }): Promise<never> {
  permanentRedirect(signUpHrefForJoin(await searchParams));
}
