"use client";

import { RouteError } from "../route-error";

export default function GroupError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
