/**
 * Share links (SRS BLOG 004): ordinary URLs and a copy-link control only — no
 * third-party social widgets or tracking scripts.
 */
export interface ShareTarget {
  /** Link kind, so the row can show the destination's mark alongside its name. */
  kind: 'email' | 'x' | 'facebook' | 'linkedin';
  label: string;
  href: string;
}

export function shareTargets(url: string, title: string): ShareTarget[] {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  return [
    { kind: 'email', label: 'Share by email', href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}` },
    { kind: 'x', label: 'Share on X', href: `https://x.com/intent/post?text=${encodedTitle}&url=${encodedUrl}` },
    { kind: 'facebook', label: 'Share on Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { kind: 'linkedin', label: 'Share on LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
  ];
}

const dateFormatter = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', day: 'numeric', month: 'long', year: 'numeric' });

export function formatArticleDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
