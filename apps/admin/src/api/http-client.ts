import { API_BASE_PATH, DEFAULT_REQUEST_TIMEOUT_MS, REQUEST_ID_HEADER } from '@/config/app-config';
import { ApiError, DEFAULT_MESSAGES, isErrorEnvelope, kindForStatus, type FieldErrors } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions {
  method?: HttpMethod;
  /** Serialised as JSON. Never logged. */
  body?: unknown;
  /** Appended as a query string; undefined/null entries are skipped. */
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Overall request budget. Defaults to DEFAULT_REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  /** Parsed JSON body, or `undefined` for empty responses (204, no content). */
  data: T;
  status: number;
  requestId: string | null;
  headers: Headers;
}

export interface HttpClient {
  request<T = unknown>(path: string, options?: ApiRequestOptions): Promise<ApiResponse<T>>;
}

export interface HttpClientDependencies {
  fetch?: typeof fetch;
  basePath?: string;
}

/**
 * Builds the typed transport used by every admin API call. Paths are relative
 * to /api/v1 and requests are same-origin, so the backend origin is never part
 * of the client. Authentication headers are deliberately absent in this phase.
 */
export function createHttpClient(deps: HttpClientDependencies = {}): HttpClient {
  const fetchImpl = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const basePath = (deps.basePath ?? API_BASE_PATH).replace(/\/+$/, '');

  return {
    async request<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
      const url = buildUrl(basePath, path, options.query);
      const method = options.method ?? 'GET';
      const headers = new Headers({ Accept: 'application/json', ...options.headers });
      let body: string | undefined;
      if (options.body !== undefined) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
      }

      const { signal, cleanup, timedOut } = combineSignals(options.signal, options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetchImpl(url, { method, headers, body, signal, credentials: 'same-origin' });
      } catch (cause) {
        cleanup();
        if (timedOut()) throw new ApiError({ kind: 'timeout', status: null, code: null, userMessage: DEFAULT_MESSAGES.timeout, cause });
        if (options.signal?.aborted) throw new ApiError({ kind: 'aborted', status: null, code: null, userMessage: DEFAULT_MESSAGES.aborted, cause });
        throw new ApiError({ kind: 'network', status: null, code: null, userMessage: DEFAULT_MESSAGES.network, cause });
      }

      const requestId = response.headers.get(REQUEST_ID_HEADER);
      let parsed: unknown;
      try {
        parsed = await readBody(response);
      } catch (cause) {
        cleanup();
        if (timedOut()) throw new ApiError({ kind: 'timeout', status: response.status, code: null, userMessage: DEFAULT_MESSAGES.timeout, requestId, cause });
        if (response.ok) throw new ApiError({ kind: 'unexpected', status: response.status, code: null, userMessage: DEFAULT_MESSAGES.unexpected, requestId, cause });
        parsed = undefined; // a failed response with an unreadable body is still classified by status
      }
      cleanup();

      if (!response.ok) throw toApiError(response, parsed, requestId);
      return { data: parsed as T, status: response.status, requestId, headers: response.headers };
    },
  };
}

export function buildUrl(basePath: string, path: string, query?: Record<string, QueryValue>): string {
  const normalisedPath = path.startsWith('/') ? path : `/${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return `${basePath}${normalisedPath}${qs ? `?${qs}` : ''}`;
}

/** Reads JSON when present; empty bodies (204, content-length 0) resolve to undefined. */
async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205 || response.headers.get('content-length') === '0') {
    return undefined;
  }
  const text = await response.text();
  if (text.length === 0) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (!/\bjson\b/i.test(contentType)) {
    // Non-JSON body (e.g. a proxy's plain-text 502). Do not retain the text.
    if (response.ok) throw new Error('Expected a JSON response');
    return undefined;
  }
  return JSON.parse(text) as unknown;
}

function toApiError(response: Response, parsed: unknown, requestIdHeader: string | null): ApiError {
  const kind = kindForStatus(response.status);
  const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
  if (isErrorEnvelope(parsed)) {
    const { code, message, fields, requestId } = parsed.error;
    return new ApiError({
      kind,
      status: response.status,
      code,
      // 4xx messages are authored server-side for display (SRS API 002) and never
      // echo private input. A server or availability failure always gets the
      // client's own sentence, whatever the response said.
      userMessage: kind === 'server' || kind === 'unavailable' ? DEFAULT_MESSAGES[kind] : message || DEFAULT_MESSAGES[kind],
      fields: sanitiseFields(fields),
      requestId: requestIdHeader ?? (typeof requestId === 'string' ? requestId : null),
      retryAfterSeconds: retryAfter,
    });
  }
  return new ApiError({
    kind,
    status: response.status,
    code: null,
    userMessage: DEFAULT_MESSAGES[kind],
    requestId: requestIdHeader,
    retryAfterSeconds: retryAfter,
  });
}

function sanitiseFields(fields: unknown): FieldErrors {
  if (typeof fields !== 'object' || fields === null) return {};
  const out: FieldErrors = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (Array.isArray(value)) out[key] = value.filter((v): v is string => typeof v === 'string');
    else if (typeof value === 'string') out[key] = [value];
  }
  return out;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/** Merges the caller's signal with a timeout; `timedOut()` tells the two apart. */
function combineSignals(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/** Shared instance for the running application. Tests construct their own with a fake fetch. */
export const httpClient: HttpClient = createHttpClient();
