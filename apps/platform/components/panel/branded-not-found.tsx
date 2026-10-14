import type { ReactElement } from "react";
import { PanelNotFound } from "@firstfold/shared/ui/panel/panel-not-found";
import { logoOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";

/** The dashboard's 404 with the logo of the brand the request's host is sold under. */
export async function BrandedNotFound(): Promise<ReactElement> {
  return <PanelNotFound brand={logoOf(await requestBrand())} />;
}
