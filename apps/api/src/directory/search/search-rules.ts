import type { SearchSort } from '../dto/public-business.dto.js';

/** Collapses whitespace and case-folds a keyword (SRS DIR 003). Returns '' when nothing searchable remains. */
export function normaliseQuery(q: string | undefined): string {
  return (q ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Escapes LIKE metacharacters so user input never becomes a wildcard. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** DIR 004: relevance only makes sense with a keyword; otherwise name A–Z is the default. */
export function effectiveSort(sort: SearchSort | undefined, q: string): SearchSort {
  if (!sort) return q ? 'relevance' : 'name';
  if (sort === 'relevance' && !q) return 'name';
  return sort;
}

export function ratingAverage(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

/** Google Maps directions deep link from validated coordinates, else the postal address (SRS BUS 003). */
export function directionsUrl(address: { line1: string; suburb: string; postcode: string; latitude: number | null; longitude: number | null }): string {
  const destination = address.latitude !== null && address.longitude !== null ? `${address.latitude},${address.longitude}` : `${address.line1}, ${address.suburb} SA ${address.postcode}, Australia`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
