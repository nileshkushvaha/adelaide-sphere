/**
 * Runtime constants for the admin application. Values here are public by
 * nature (they ship in the browser bundle); never add secrets.
 */
export const APP_NAME = 'Adelaide Sphere Admin';

/** Vite injects the configured `base` ('/admin/' in dev and production, '/' under Vitest). */
export const PUBLIC_BASE: string = import.meta.env.BASE_URL;

/** React Router basename derived from the public base ('/admin'). */
export const ROUTER_BASENAME: string = PUBLIC_BASE.replace(/\/+$/, '') || '/';

/** Relative API root. The browser never learns the backend origin (SRS ARC 004). */
export const API_BASE_PATH = '/api/v1';

/** Header the API uses to return its server-generated request ID. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Default upper bound for a single API request. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
