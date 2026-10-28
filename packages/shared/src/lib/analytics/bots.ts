/** Named crawlers, link-preview fetchers and AI scrapers, then the words and tools that give a script away. */
const BOT_MARKERS =
  /googlebot|bingbot|yandexbot|baiduspider|duckduckbot|applebot|ahrefsbot|semrushbot|petalbot|mj12bot|dotbot|bytespider|gptbot|claudebot|ccbot|amazonbot|facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot|whatsapp|bot\/|crawler|spider|headless|lighthouse|pagespeed|gtmetrix|phantomjs|curl\/|wget\/|python-|httpclient|go-http|java\/|node-fetch|axios|uptime|monitor/i;

/** True for traffic that is not a person: no user agent at all, or one of the markers above. Such a hit is dropped, not counted. */
export function isBot(userAgent: string): boolean {
  const text = userAgent.trim();
  return text === "" || BOT_MARKERS.test(text);
}
