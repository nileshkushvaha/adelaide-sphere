export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'rate_limited'
  | 'server'
  | 'unavailable'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'unexpected';

export type FieldErrors = Record<string, string[]>;

/** Shape of the API's error envelope (SRS API 002). */
export interface ErrorEnvelope {
  error: { code: string; message: string; fields: FieldErrors; requestId: string };
}

export interface ApiErrorInit {
  kind: ApiErrorKind;
  status: number | null;
  code: string | null;
  /** Safe, user-facing message. */
  userMessage: string;
  fields?: FieldErrors;
  requestId?: string | null;
  retryAfterSeconds?: number | null;
  cause?: unknown;
}

/**
 * Normalised API failure. `userMessage` is safe to display; `code`, `status`,
 * `fields` and `requestId` are structured diagnostics for support and forms.
 * The response body, request body and headers are never retained here.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly userMessage: string;
  readonly fields: FieldErrors;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(init: ApiErrorInit) {
    super(init.userMessage, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.userMessage = init.userMessage;
    this.fields = init.fields ?? {};
    this.requestId = init.requestId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  /** Short reference for support conversations, e.g. "NOT_FOUND · request 2f1c…". */
  get reference(): string {
    const parts = [this.code ?? this.kind.toUpperCase()];
    if (this.requestId) parts.push(`request ${this.requestId}`);
    return parts.join(' · ');
  }
}

export function kindForStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 413) return 'payload_too_large';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  if (status >= 500) return 'server';
  return 'unexpected';
}

/** Default user-safe messages when the response carries none we can trust. */
export const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  validation: 'Some of the information provided is not valid.',
  unauthorized: 'You need to sign in to continue.',
  forbidden: 'You do not have permission to do that.',
  not_found: 'The requested item could not be found.',
  conflict: 'This item was changed by someone else. Reload and try again.',
  payload_too_large: 'The submitted content is too large.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  server: 'The server encountered an unexpected problem.',
  unavailable: 'The service is temporarily unavailable. Please try again shortly.',
  network: 'The server could not be reached. Check your connection and try again.',
  timeout: 'The request took too long. Please try again.',
  aborted: 'The request was cancelled.',
  unexpected: 'Something went wrong. Please try again.',
};

/** Type guard for the API error envelope; tolerates partially formed bodies. */
export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Record<string, unknown>;
  return typeof e.code === 'string' && typeof e.message === 'string';
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
