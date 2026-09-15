/**
 * Turns a name into the address the server would generate from it.
 *
 * This is a preview, not a decision: the API derives the real address when one
 * is not supplied (`apps/api/src/common/slug.ts`), and it is the authority. The
 * admin needs the same shape only so the permalink row can show what the
 * address is about to become before the record is saved.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
