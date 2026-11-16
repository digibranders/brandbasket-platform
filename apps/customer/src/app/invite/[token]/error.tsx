"use client";

import { RouteError } from "../../route-error";

export default function InviteError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
