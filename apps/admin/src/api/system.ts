import { httpClient, type HttpClient } from './http-client';

export interface CacheNamespaceStatus {
  key: string;
  label: string;
  description: string;
  ttlSeconds: number;
  /** Approximate and capped; never presented as exact (SRS 1.2 CMGR 001). */
  entries: number | null;
  approximate: boolean;
  lastClearedAt: string | null;
}

export interface CacheTagStatus {
  key: string;
  label: string;
  description: string;
  lastClearedAt: string | null;
}

export interface CacheStatus {
  redis: { available: boolean; detail: string };
  namespaces: CacheNamespaceStatus[];
  tags: CacheTagStatus[];
}

export const cacheApi = {
  status(client: HttpClient = httpClient) {
    return client.request<{ data: CacheStatus }>('/admin/system/cache').then((r) => r.data.data);
  },
  /** `key` is always a registered name from `status()`; nothing accepts a pattern. */
  clear(kind: 'namespace' | 'tag', key: string, client: HttpClient = httpClient) {
    return client.request<{ data: { cleared?: number; accepted: boolean } }>('/admin/system/cache/clear', { method: 'POST', body: { kind, key } }).then((r) => r.data.data);
  },
};

export type QueueJobState = 'waiting' | 'active' | 'delayed' | 'failed' | 'completed';

export interface QueueSummary {
  name: string;
  label: string;
  purpose: string;
  pausable: boolean;
  /** What stops happening while the queue is paused; shown before confirming. */
  pauseConsequence: string;
  paused: boolean;
  counts: Record<QueueJobState, number> | null;
  oldestWaitingSeconds: number | null;
  workers: { count: number; estimated: boolean; detail: string };
  available: boolean;
  detail: string;
  jobs: { name: string; label: string; purpose: string }[];
}

export interface QueueJob {
  id: string;
  name: string;
  label: string;
  state: QueueJobState;
  attemptsMade: number;
  createdAt: string;
  processedAt: string | null;
  finishedAt: string | null;
  failedReason: string | null;
  progress: number | null;
  /** Allowlisted payload summary; the server never sends the payload itself. */
  data: { fields: { label: string; value: string }[]; unrecognised: boolean };
  canRetry: boolean;
  canRemove: boolean;
}

export interface QueueBulkResult {
  requested: number;
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
}

/** Queue monitor (SRS 1.2 QMON 001–005). Every action names an existing job; none creates one. */
/** Worker liveness (QMON 005): the four states an operator has to tell apart. */
export interface WorkerLiveness {
  healthy: boolean;
  detail: string;
  workers: { instanceId: string; version: string; startedAt: string; lastBeatAt: string; ageSeconds: number; queues: string[]; processed: number; failed: number }[];
  oldestHeartbeatAgeSeconds: number | null;
  scheduler: { healthy: boolean; detail: string; stale: { code: string; label: string; lastSuccessAt: string | null; staleAfterMinutes: number }[] };
}

export const queuesApi = {
  workers(client: HttpClient = httpClient) {
    return client.request<{ data: WorkerLiveness }>('/admin/system/queues/workers').then((r) => r.data.data);
  },
  overview(client: HttpClient = httpClient) {
    return client.request<{ data: QueueSummary[] }>('/admin/system/queues').then((r) => r.data.data);
  },
  jobs(name: string, query: { state: QueueJobState; page: number; pageSize: number }, client: HttpClient = httpClient) {
    const search = new URLSearchParams({ state: query.state, page: String(query.page), pageSize: String(query.pageSize) });
    return client.request<Paged<QueueJob>>(`/admin/system/queues/${encodeURIComponent(name)}/jobs?${search}`).then((r) => r.data);
  },
  retry(name: string, jobIds: string[], client: HttpClient = httpClient) {
    return client.request<{ data: QueueBulkResult }>(`/admin/system/queues/${encodeURIComponent(name)}/retry`, { method: 'POST', body: { jobIds } }).then((r) => r.data.data);
  },
  remove(name: string, jobIds: string[], client: HttpClient = httpClient) {
    return client.request<{ data: QueueBulkResult }>(`/admin/system/queues/${encodeURIComponent(name)}/remove`, { method: 'POST', body: { jobIds } }).then((r) => r.data.data);
  },
  setPaused(name: string, paused: boolean, client: HttpClient = httpClient) {
    return client.request<{ data: { paused: boolean } }>(`/admin/system/queues/${encodeURIComponent(name)}/pause`, { method: 'POST', body: { paused } }).then((r) => r.data.data);
  },
  clean(name: string, state: 'completed' | 'failed', olderThanHours: number, client: HttpClient = httpClient) {
    return client
      .request<{ data: { removed: number } }>(`/admin/system/queues/${encodeURIComponent(name)}/clean`, { method: 'POST', body: { state, olderThanHours } })
      .then((r) => r.data.data);
  },
};

export interface ScheduledTask {
  code: string;
  label: string;
  description: string;
  scheduleLabel: string;
  timezone: string;
  missedRunPolicy: string;
  timeoutMs: number;
  retries: number;
  manualRunAllowed: boolean;
  /** Publishes or deletes something; the interface asks twice (SRS 1.2 TASK 005). */
  highImpact: boolean;
  /** Cannot be switched off from here (TASK 006). */
  requiredForCorrectness: boolean;
  safeToOverlap: boolean;
  enabled: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastOutcome: string | null;
  lastDurationMs: number | null;
  lastDetail: string | null;
  running: boolean;
}

export interface ScheduledRun {
  id: string;
  taskCode: string;
  trigger: string;
  outcome: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  detail: string | null;
  actorAdminId: string | null;
  runnerId: string | null;
}

/** Scheduled tasks (SRS 1.2 TASK 001–006). Every call names a registry code and nothing else. */
export const schedulesApi = {
  list(client: HttpClient = httpClient) {
    return client.request<{ data: ScheduledTask[] }>('/admin/system/schedules').then((r) => r.data.data);
  },
  runs(code: string, page: number, pageSize = 20, client: HttpClient = httpClient) {
    return client.request<Paged<ScheduledRun>>(`/admin/system/schedules/${encodeURIComponent(code)}/runs?page=${page}&pageSize=${pageSize}`).then((r) => r.data);
  },
  run(code: string, client: HttpClient = httpClient) {
    return client.request<{ data: { dispatched: true } }>(`/admin/system/schedules/${encodeURIComponent(code)}/run`, { method: 'POST', body: {} }).then((r) => r.data.data);
  },
  setEnabled(code: string, enabled: boolean, client: HttpClient = httpClient) {
    return client.request<{ data: { enabled: boolean } }>(`/admin/system/schedules/${encodeURIComponent(code)}/enabled`, { method: 'POST', body: { enabled } }).then((r) => r.data.data);
  },
};
