/** An empty answer for an image request, never cached: a visitor or an id that gets nothing learns nothing. */
export function bareStatus(status: 401 | 404): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}
