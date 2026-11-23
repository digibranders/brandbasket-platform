import { NextResponse } from "next/server";
import { readUnsubscribeLink, unsubscribeAddress } from "@/platform/lib/server/unsubscribe";

export const dynamic = "force-dynamic";

function linkOf(request: Request): ReturnType<typeof readUnsubscribeLink> {
  const { searchParams } = new URL(request.url);
  return readUnsubscribeLink({ e: searchParams.get("e"), t: searchParams.get("t") });
}

/** The one-click unsubscribe a mail client sends (RFC 8058: POST with `List-Unsubscribe=One-Click`). */
export async function POST(request: Request): Promise<Response> {
  const address = linkOf(request);
  if (address === null) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  await unsubscribeAddress(address);
  return NextResponse.json({ unsubscribed: true });
}

/** A person who opens the link lands on the confirmation page; nothing changes until they press the button. */
export function GET(request: Request): Response {
  const { search } = new URL(request.url);
  return new Response(null, { status: 303, headers: { location: `/unsubscribe${search}` } });
}
