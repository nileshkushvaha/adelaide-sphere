/**
 * Names for the link kinds an editor can publish, shared by every screen that
 * edits or lists one. Kept apart from the icon components so both the labels
 * and the marks can be imported wherever they are needed.
 */
const LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  threads: 'Threads',
  mastodon: 'Mastodon',
  github: 'GitHub',
  website: 'Website',
  email: 'Email',
  other: 'Other',
};

/** The name for a link kind; an unknown kind keeps its own key rather than being renamed. */
export function brandLabel(kind: string): string {
  return LABELS[kind] ?? kind;
}
