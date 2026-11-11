/**
 * Whether the AI side of the Social media page (write posts from a website, check the facts, keep or drop, approve the pictures) is on.
 * Off unless SOCIAL_AUTO_AI is "1", so a server whose social-auto does not have those calls yet shows the page as it was.
 */
export const socialAiEnabled = (env: Readonly<Record<string, string | undefined>> = process.env): boolean => env.SOCIAL_AUTO_AI?.trim() === "1";
