"use client";

import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { BRANDS, type Brand } from "@/lib/brand";

const BrandContext = createContext<Brand>(BRANDS.firstfold);

/** Hands the brand the request's host is sold under to the client components below it (the layout reads it from the host). */
export function BrandProvider({ brand, children }: { readonly brand: Brand; readonly children: ReactNode }): ReactElement {
  return <BrandContext value={brand}>{children}</BrandContext>;
}

/** The brand the dashboard is sold under: Firstfold's wherever no provider is above (a test, a page outside the dashboard). */
export function useBrand(): Brand {
  return useContext(BrandContext);
}
