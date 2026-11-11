import { permanentRedirect } from "next/navigation";
import { newRequestHref } from "@/features/requests/rules";

/** The old New request page is now a dialog on the list. The parameters it read still start the dialog. */
export default async function NewRequestRedirect({ searchParams }: { readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }) {
  permanentRedirect(newRequestHref(await searchParams));
}
