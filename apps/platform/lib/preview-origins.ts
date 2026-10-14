/**
 * The website's address is often served twice: firstfold.io sends visitors on to www.firstfold.io. The dashboard frames
 * the preview at the address it is configured with, so the frame ends up on the other one, and both must be allowed
 * (the dashboard's frame-src, and the windows its preview messages are exchanged with). Only a bare domain and its
 * `www.` form pair up; `localhost`, addresses and deeper subdomains stand alone.
 */
export function previewOrigins(origin: string): readonly string[] {
  const url = new URL(origin);
  const labels = url.hostname.split(".");
  const standsAlone = url.hostname === "localhost" || labels.length < 2 || labels.at(-1) === "localhost" || labels.every((label) => /^\d+$/.test(label));
  if (standsAlone) return [url.origin];
  const twin = labels[0] === "www" ? labels.slice(1) : labels.length === 2 ? ["www", ...labels] : null;
  if (twin === null) return [url.origin];
  const port = url.port === "" ? "" : `:${url.port}`;
  const other = `${url.protocol}//${twin.join(".")}${port}`;
  return [url.origin, other];
}
