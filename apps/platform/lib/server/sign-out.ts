"use server";
// This is a "use server" module: every exported function becomes a public action endpoint,
// callable directly over the network regardless of which components import it. Only actions
// belong in this file.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

export async function signOut(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}
