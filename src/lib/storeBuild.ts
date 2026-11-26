/** The Play AAB sets VITE_STORE_BUILD=play. The website and the sideload APK do not. */
export function isPlayStoreBuild(value: string | undefined = import.meta.env.VITE_STORE_BUILD): boolean {
  return value === 'play';
}

const BOOKMAKER_URL = /https?:\/\/(?:www\.)?(?:sportybet\.com|football\.com|msport\.com|betika\.com|betpawa\.com(?:\.gh)?)(?:\/[^\s]*)?/gi;

/** Play share text keeps the code and drops any bookmaker link. */
export function withoutBookmakerUrls(text: string): string {
  return text.replace(BOOKMAKER_URL, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
