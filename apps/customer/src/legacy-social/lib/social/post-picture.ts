/*
 * The picture of a post on the calendar is a public address on the posting service (https://social.example.com/publisher/posts/...). The
 * browser does not ask for it there, because the page's security rules name the posting service only when the build knew its address: it
 * asks this app, which fetches the picture and hands it on from its own address, so it shows wherever the app is built.
 */

export const POST_PICTURE_PATH = "/api/social-post-picture";

/** The same-origin address the browser asks for a post's picture at. */
export const postPictureSrc = (imageUrl: string): string => `${POST_PICTURE_PATH}?src=${encodeURIComponent(imageUrl)}`;

const PICTURE = /^\/posts\/[A-Za-z0-9._/-]{1,200}\.(?:jpe?g|png)$/i;

/**
 * Whether `src` is a poster picture of the posting service at `baseUrl` (its address with any path it is served under): the same origin, and
 * under `<path>/posts/` with a picture's name. Anything else is refused, so the route cannot be made to fetch another site.
 */
export function isPostingServicePicture(src: string, baseUrl: string): boolean {
  let picture: URL;
  let base: URL;
  try {
    picture = new URL(src);
    base = new URL(baseUrl);
  } catch {
    return false;
  }
  if (picture.origin !== base.origin || picture.search !== "" || picture.hash !== "" || picture.username !== "" || picture.password !== "") return false;
  const root = base.pathname.replace(/\/+$/, "");
  if (!picture.pathname.startsWith(`${root}/`)) return false;
  return PICTURE.test(picture.pathname.slice(root.length)) && !picture.pathname.includes("..");
}
