import type { Poster } from "./ai";
import { toCalendarPost, type AutoPost } from "./auto";

/**
 * The day and time a picture goes out are the plan's, written when the post was; a customer who moves the post in the calendar changes it in the
 * posting schedule only. This puts the schedule's own day and time on each picture, so the Posts pages say the same thing as the calendar. A picture
 * with no scheduled post (not released yet, or already gone) keeps what the plan said.
 */
export function withScheduledMoments(posters: readonly Poster[], scheduled: readonly AutoPost[]): Poster[] {
  const moments = new Map<string, { day: string; time: string }>();
  for (const post of scheduled) {
    const calendar = toCalendarPost(post);
    if (calendar !== null) moments.set(post.id, { day: calendar.day, time: calendar.time });
  }
  if (moments.size === 0) return [...posters];
  return posters.map((poster) => {
    // A scheduled post is named `<workspace brand>-<post id>`; the post id is what the picture knows. A network with a time of its own is a post of its own,
    // `<workspace brand>-<post id>~<network>`: that is the time of the picture of that network, the post's own is for the networks still on it.
    const found = [...moments].find(([id]) => id.endsWith(`-${poster.postId}~${poster.network}`)) ?? [...moments].find(([id]) => id.endsWith(`-${poster.postId}`));
    if (found === undefined) return poster;
    const [, moment] = found;
    return poster.date === moment.day && poster.time === moment.time ? poster : { ...poster, date: moment.day, time: moment.time };
  });
}
