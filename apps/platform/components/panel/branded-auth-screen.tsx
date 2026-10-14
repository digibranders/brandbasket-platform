import type { ComponentProps, ReactElement } from "react";
import { AuthScreen } from "@firstfold/shared/ui/panel/auth-screen";
import { logoOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";

/** The shared AuthScreen with the logo of the brand the request's host is sold under (Fynix's, on its host). */
export async function BrandedAuthScreen(props: Omit<ComponentProps<typeof AuthScreen>, "brand">): Promise<ReactElement> {
  return <AuthScreen {...props} brand={logoOf(await requestBrand())} />;
}
