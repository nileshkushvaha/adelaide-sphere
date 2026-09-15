/**
 * Makes a failure message safe to show an administrator (SRS MON 001).
 *
 * Operational screens — email logs, the queue monitor — show why something
 * failed, and the only honest source for that is the underlying error. But a
 * transport or driver error routinely carries things that must not be put on a
 * screen or kept in a row: the recipient's address, an SMTP host and port, a
 * connection string with credentials, a signed URL, a path on the server.
 *
 * Both call sites documented the summary as "already redacted" while passing
 * the raw message through, so this is the redaction those comments described.
 * It runs where the value is stored, not where it is displayed: a value that
 * was never written cannot leak from some later screen that forgets to filter.
 *
 * It removes what it recognises rather than trying to prove the remainder is
 * safe, so it is a reduction in exposure, not a guarantee — which is why the
 * result is also length-capped by the caller.
 */

const PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Credentials inside a URL must go before the URL rule itself.
  { pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/gi, replacement: '[credentials]@' },
  { pattern: /\b[\w.!#$%&'*+/=?^`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, replacement: '[address]' },
  { pattern: /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, replacement: '[url]' },
  // Bare host:port, e.g. "ECONNREFUSED 127.0.0.1:1025".
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, replacement: '[host]' },
  { pattern: /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})\b/gi, replacement: '[host]' },
  // Absolute paths on the server, POSIX or Windows.
  { pattern: /(?:^|\s)(?:\/[\w.-]+){2,}\/?/g, replacement: ' [path]' },
  { pattern: /\b[a-z]:\\[\\\w.-]+/gi, replacement: '[path]' },
  // Long opaque strings: tokens, keys and signatures.
  { pattern: /\b[A-Za-z0-9_-]{32,}\b/g, replacement: '[token]' },
];

/**
 * @param value the error's own message
 * @param limit how much of it to keep; the column is 300 characters
 */
export function redactFailureSummary(value: string | null | undefined, limit = 300): string {
  if (!value) return 'The attempt failed without a reported reason.';
  // Only the first line: a stack trace begins on the second.
  let safe = value.split('\n')[0] ?? '';
  for (const { pattern, replacement } of PATTERNS) safe = safe.replace(pattern, replacement);
  safe = safe.replace(/\s{2,}/g, ' ').trim();
  return (safe.length > limit ? `${safe.slice(0, limit - 1)}…` : safe) || 'The attempt failed without a reportable reason.';
}
