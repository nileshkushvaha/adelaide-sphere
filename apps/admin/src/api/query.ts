import type { QueryValue } from './http-client';

/**
 * Turns a query object into the parameters to send, dropping the values that
 * mean "not asked for".
 *
 * This existed nine times, in three subtly different versions, which is how the
 * differences stopped being decisions and became accidents. There are two real
 * behaviours and they are now named:
 *
 *  * `queryParams` drops `undefined`, `null` and `''`. A `false` is sent,
 *    because for some filters it is an answer — the redirects screen asks for
 *    the rules that are switched *off*.
 *  * `enabledFilters` also drops `false`, for screens where an unticked box
 *    means "do not narrow the list" rather than "show me the false ones".
 *
 * Values are passed through rather than stringified; the HTTP client already
 * knows how to serialise each type.
 */
export function queryParams(query: object): Record<string, QueryValue> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

/** As `queryParams`, but an unticked filter is also left out. */
export function enabledFilters(query: object): Record<string, QueryValue> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false));
}
