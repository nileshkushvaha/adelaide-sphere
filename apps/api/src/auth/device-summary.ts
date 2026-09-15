/**
 * A coarse description of where a session is signed in (SRS 1.2 SECS 005).
 *
 * Deliberately vague: browser family and platform, nothing more. It exists so
 * an administrator can recognise their own laptop in a list, not so anyone can
 * identify a device. It is derived from the user agent the browser volunteered
 * and is never presented as device identification — the SRS is explicit that no
 * fingerprinting claim is made, and this cannot support one.
 */
export function deviceSummary(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent.slice(0, 255);

  const platform = /Windows NT/i.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Android/i.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : null;

  // Order matters: several browsers include "Safari" or "Chrome" in their own
  // user agent, so the more specific families are matched first.
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : null;

  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? 'Unknown device';
}
