import { httpClient, type HttpClient } from './http-client';

export interface LivenessResponse {
  data: { status: 'ok' };
}

export interface LivenessResult {
  status: 'ok';
  requestId: string | null;
}

/** GET /api/v1/health — liveness only; it says nothing about the database. */
export async function getLiveness(signal?: AbortSignal, client: HttpClient = httpClient): Promise<LivenessResult> {
  const response = await client.request<LivenessResponse>('/health', { signal, timeoutMs: 5_000 });
  if (response.data?.data?.status !== 'ok') {
    throw new Error('Unexpected liveness response shape');
  }
  return { status: 'ok', requestId: response.requestId };
}
