import { AI_ITEM_STATUSES, type AiItemStatus } from "@adelaide-sphere/domain/ai-content";
import { httpClient } from "./http-client";
/** The SRS lifecycle (AI-160–169), shared with the API. */
export type TopicStatus = AiItemStatus;
export const TOPIC_STATUSES = AI_ITEM_STATUSES;
export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  queued: "Queued",
  paused: "Paused",
  researching: "Researching",
  generating: "Generating",
  needs_fact_review: "Needs fact review",
  ready_for_review: "Ready for review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};
export interface AiTopic {
  id: string;
  title: string;
  brief: string | null;
  priority: number;
  source: "manual" | "discovery";
  status: TopicStatus;
  reason: string | null;
  createdByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** The one canonical article, once a draft exists. */
  postId: string | null;
  /** First human change to that article; automation never applies over it. */
  humanModifiedAt: string | null;
  failureStage: string | null;
  failureCode: string | null;
  selectionReason: string | null;
  noveltyStatus: NoveltyStatus;
  noveltyCheckedAt: string | null;
  noveltyDetail: NoveltyMatch[] | null;
  researchUrls: ResearchUrl[] | null;
  topicApprovedAt: string | null;
  topicApprovedByAdminId: string | null;
  followUpOfPostId: string | null;
  followUpReason: string | null;
  categoryId: string | null;
  /** Per-article image mode; null follows AI Settings. */
  imageMode: "manual" | "hybrid" | null;
}
export type NoveltyStatus = "unchecked" | "clear" | "review" | "duplicate";
export interface NoveltyMatch {
  kind: "post" | "item";
  id: string;
  title: string;
  status: string;
  score: number;
  reason: string;
  verdict: "review" | "duplicate";
}
export type SourceTier = "official_government" | "official_business" | "institutional" | "publication" | "unclassified";
export const SOURCE_TIER_LABELS: Record<SourceTier, string> = {
  official_government: "Official: government or council",
  official_business: "Official: business, venue or organiser",
  institutional: "Institutional or industry",
  publication: "Publication (discovery and corroboration)",
  unclassified: "Unclassified",
};
export interface ResearchUrl {
  url: string;
  tier?: SourceTier | null;
}
export interface Evidence {
  id: string;
  url: string;
  finalUrl: string | null;
  host: string;
  tier: SourceTier;
  fetchStatus: string;
  httpStatus: number | null;
  contentHash: string | null;
  title: string | null;
  sourceDate: string | null;
  fetchedAt: string;
  textPreview: string | null;
  textLength: number;
}
export type ClaimStatus = "verified" | "unresolved" | "conflicting" | "stale" | "excluded";
export interface Claim {
  id: string;
  kind: string;
  subject: string;
  value: string;
  material: boolean;
  origin: "extracted" | "editor";
  status: ClaimStatus;
  reason: string | null;
  validUntil: string | null;
  freshUntil: string | null;
  excluded: boolean;
  accepted: boolean;
  resolutionNote: string | null;
  version: number;
  sources: { evidenceId: string; excerpt: string; location: string | null }[];
}
export type PacketStatus = "collecting" | "verified" | "needs_fact_review" | "failed";
export interface ResearchPacket {
  id: string;
  version: number;
  status: PacketStatus;
  reasons: string[] | null;
  changes: { kind: string; subject: string; value: string }[] | null;
  freshUntil: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  context: { id: string; title: string; slug: string }[] | null;
  evidence: Evidence[];
  claims: Claim[];
}
export interface ResearchView {
  packets: { id: string; version: number; status: PacketStatus; createdAt: string }[];
  packet: ResearchPacket | null;
}
export const CLAIM_KINDS = [
  "business_identity",
  "address",
  "phone",
  "website",
  "opening_hours",
  "price",
  "availability",
  "event_datetime",
  "event_location",
  "geography",
  "background",
] as const;
export interface ResearchSource {
  id: string;
  host: string;
  label: string;
  tier: Exclude<SourceTier, "unclassified">;
  feedUrl: string | null;
  active: boolean;
  version: number;
}
export type CostState = "none" | "reserved" | "settled" | "released" | "uncertain";
export interface GenerationRun {
  id: string;
  generationVersion: number;
  status: "pending" | "applied" | "proposal" | "failed";
  proposalReason: string | null;
  scope: "full" | "metadata";
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  promptHash: string | null;
  schemaVersion: string | null;
  researchPacketId: string | null;
  disclosureText: string | null;
  factCheck: "pending" | "passed" | "failed";
  coverage: { field: string; token: string; reason: string }[] | null;
  imageBriefs: { placement: string; prompt: string; aspectRatio: string; altDraft: string; captionDraft: string }[] | null;
  internalLinks: { postId: string; anchor: string; path: string; reason: string }[] | null;
  artifact: Record<string, unknown>;
  appliedPostVersion: number | null;
  createdAt: string;
}
export interface GenerationOperation {
  id: string;
  kind: "generate" | "apply";
  scope: string | null;
  state: string;
  attempts: number;
  provider: string | null;
  model: string | null;
  providerPhase: string | null;
  resultCode: string | null;
  errorClass: string | null;
  estimatedMaxMicros: number | null;
  reservedMicros: number;
  settledMicros: number | null;
  costState: CostState;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  resolutionNote: string | null;
  createdAt: string;
  priceSchedule: { version: string; currency: string } | null;
}
export interface GenerationHistory {
  runs: GenerationRun[];
  operations: GenerationOperation[];
  approvals: { id: string; kind: "content" | "facts"; postVersion: number; adminId: string | null; reason: string | null; createdAt: string; invalidatedAt: string | null; invalidationReason: string | null }[];
  post: { id: string; version: number; title: string; excerpt: string; seoTitle: string | null; seoDescription: string | null; seoKeywords: string | null; status: string; firstPublishedAt: string | null } | null;
  /** The automatic screen of the article as it stands: violations block; flags are for the person confirming facts. */
  factReview: { violations: { field: string; token: string; reason: string }[]; flags: { field: string; token: string; reason: "possible_name" }[] } | null;
}
export interface BudgetStatus {
  enabled: boolean;
  currency: string;
  warningPercent: number;
  workflowLimitMicros: number;
  day: { period: string; reservedMicros: number; settledMicros: number; limitMicros: number; warning: boolean };
  month: { period: string; reservedMicros: number; settledMicros: number; limitMicros: number; warning: boolean };
  imageDay: { period: string; reservedMicros: number; settledMicros: number; limitMicros: number; warning: boolean };
  imageMonth: { period: string; reservedMicros: number; settledMicros: number; limitMicros: number; warning: boolean };
  uncertainOperations: number;
  uncertainMicros: number;
  outcomeUnknownOperations: number;
  paidCallsHaltedAt: string | null;
  paidHaltReason: string | null;
}
export interface PriceSchedule {
  id: string;
  version: string;
  provider: string;
  model: string;
  serviceTier: string;
  currency: string;
  inputMicrosPerMTok: number;
  cachedInputMicrosPerMTok: number;
  outputMicrosPerMTok: number;
  longContextThresholdTokens: number;
  /** Image models only. */
  imageSize?: string | null;
  imageQuality?: string | null;
  maxOutputTokens?: number | null;
  sourceUrl: string;
  effectiveFrom: string;
  status: "proposed" | "approved" | "retired";
  approvedAt: string | null;
}
export type ImageJobStatus = "requested" | "stored" | "approved" | "rejected" | "failed" | "outcome_unknown" | "superseded";
export interface ImageJob {
  id: string;
  imageVersion: number;
  status: ImageJobStatus;
  prompt: string;
  model: string;
  size: string;
  quality: string;
  width: number | null;
  height: number | null;
  disclosureText: string;
  approvedAt: string | null;
  reviewNote: string | null;
  failureCode: string | null;
  createdAt: string;
  operationId: string;
  operation: { state: string; costState: CostState; reservedMicros: number; settledMicros: number | null; errorClass: string | null; priceSchedule: { version: string; currency: string } | null };
  media: { id: string; status: "quarantined" | "ready" | "rejected"; rejectionReason: string | null; previewUrl: string | null } | null;
  isFeatured: boolean;
}
export interface TopicImages {
  globalMode: "manual" | "hybrid";
  override: "manual" | "hybrid" | null;
  brief: { prompt: string; altDraft: string } | null;
  size: string;
  quality: string;
  disclosureText: string;
  post: { id: string; version: number; coverMediaId: string | null; coverAlt: string | null } | null;
  jobs: ImageJob[];
}
/** Micro-units of a currency, shown to the cent (rounded up, so cost is never understated). */
export const money = (micros: number | null | undefined, currency = "USD") =>
  micros === null || micros === undefined ? "—" : `${currency} ${(Math.ceil(micros / 10_000) / 100).toFixed(2)}`;
export interface DiscoveryRun {
  id: string;
  state: string;
  attempts: number;
  resultCode: string | null;
}
export interface TopicInput {
  title: string;
  brief?: string;
  priority: number;
}
export const aiContentApi = {
  overview: () =>
    httpClient
      .request<{
        data: {
          enabled: boolean;
          executionActive: boolean;
          generationAvailable: false;
          counts: Record<TopicStatus, number>;
        };
      }>("/admin/ai-content/overview")
      .then((r) => r.data.data),
  list: (
    query: { page: number; pageSize: number; status?: TopicStatus; q?: string },
    signal?: AbortSignal,
  ) =>
    httpClient
      .request<{
        data: AiTopic[];
        meta: { total: number; page: number; pageSize: number };
      }>("/admin/ai-content/topics", { query, signal })
      .then((r) => r.data),
  detail: (id: string) =>
    httpClient
      .request<{ data: AiTopic }>(`/admin/ai-content/topics/${id}`)
      .then((r) => r.data.data),
  create: (input: TopicInput, key: string) =>
    httpClient
      .request<{ data: AiTopic }>("/admin/ai-content/topics", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: input,
      })
      .then((r) => r.data.data),
  action: (
    topic: AiTopic,
    action: "pause" | "resume" | "cancel" | "reject",
    reason?: string,
  ) =>
    httpClient
      .request<{ data: AiTopic }>(
        `/admin/ai-content/topics/${topic.id}/actions`,
        {
          method: "POST",
          body: {
            expectedVersion: topic.version,
            action,
            ...(reason ? { reason } : {}),
          },
        },
      )
      .then((r) => r.data.data),
  priority: (topic: AiTopic, priority: number) =>
    httpClient
      .request<{ data: AiTopic }>(
        `/admin/ai-content/topics/${topic.id}/priority`,
        { method: "PUT", body: { expectedVersion: topic.version, priority } },
      )
      .then((r) => r.data.data),
  research: (id: string) =>
    httpClient
      .request<{ data: ResearchView }>(`/admin/ai-content/topics/${id}/research`)
      .then((r) => r.data.data),
  checkNovelty: (id: string) =>
    httpClient
      .request<{ data: AiTopic }>(`/admin/ai-content/topics/${id}/novelty`, { method: "POST", body: {} })
      .then((r) => r.data.data),
  setSources: (topic: AiTopic, sources: ResearchUrl[]) =>
    httpClient
      .request<{ data: AiTopic }>(`/admin/ai-content/topics/${topic.id}/sources`, {
        method: "PUT",
        body: { expectedVersion: topic.version, sources },
      })
      .then((r) => r.data.data),
  researchAction: (
    topic: AiTopic,
    action: "approve" | "refresh",
    followUp?: { followUpOfPostId: string; followUpReason: string },
  ) =>
    httpClient
      .request<{ data: AiTopic }>(`/admin/ai-content/topics/${topic.id}/research`, {
        method: "POST",
        body: { expectedVersion: topic.version, action, ...(followUp ?? {}) },
      })
      .then((r) => r.data.data),
  resolveClaim: (claim: Claim, action: "accept" | "exclude" | "reopen", note?: string) =>
    httpClient
      .request<{ data: { status: PacketStatus } }>(`/admin/ai-content/claims/${claim.id}/resolve`, {
        method: "POST",
        body: { expectedVersion: claim.version, action, ...(note ? { note } : {}) },
      })
      .then((r) => r.data.data),
  addClaim: (
    packetId: string,
    input: { evidenceId: string; kind: string; subject: string; value: string; excerpt: string; material: boolean },
  ) =>
    httpClient
      .request<{ data: { status: PacketStatus } }>(`/admin/ai-content/packets/${packetId}/claims`, { method: "POST", body: input })
      .then((r) => r.data.data),
  discover: (key: string) =>
    httpClient
      .request<{ data: DiscoveryRun }>("/admin/ai-content/discovery", { method: "POST", headers: { "Idempotency-Key": key }, body: {} })
      .then((r) => r.data.data),
  discovery: (id: string) =>
    httpClient
      .request<{ data: DiscoveryRun }>(`/admin/ai-content/discovery/${id}`)
      .then((r) => r.data.data),
  sources: () =>
    httpClient
      .request<{ data: ResearchSource[] }>("/admin/ai-content/sources")
      .then((r) => r.data.data),
  createSource: (input: { host: string; label: string; tier: ResearchSource["tier"]; feedUrl?: string | null }) =>
    httpClient
      .request<{ data: ResearchSource }>("/admin/ai-content/sources", { method: "POST", body: input })
      .then((r) => r.data.data),
  updateSource: (source: ResearchSource, input: Partial<Pick<ResearchSource, "label" | "tier" | "feedUrl" | "active">>) =>
    httpClient
      .request<{ data: ResearchSource }>(`/admin/ai-content/sources/${source.id}`, {
        method: "PATCH",
        body: { expectedVersion: source.version, ...input },
      })
      .then((r) => r.data.data),
  setArticleSettings: (topic: AiTopic, input: { categoryId?: string | null; imageMode?: "manual" | "hybrid" | null }) =>
    httpClient
      .request<{ data: AiTopic }>(`/admin/ai-content/topics/${topic.id}/article`, { method: "PUT", body: { expectedVersion: topic.version, ...input } })
      .then((r) => r.data.data),
  images: (id: string) => httpClient.request<{ data: TopicImages }>(`/admin/ai-content/topics/${id}/images`).then((r) => r.data.data),
  generateImage: (topic: AiTopic, key: string, prompt?: string) =>
    httpClient
      .request<{ data: { operationId: string; jobId: string; created: boolean } }>(`/admin/ai-content/topics/${topic.id}/images`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: { expectedVersion: topic.version, ...(prompt ? { prompt } : {}) },
      })
      .then((r) => r.data.data),
  approveImage: (jobId: string, expectedPostVersion: number, altText: string, note?: string) =>
    httpClient
      .request<{ data: { postId: string; postVersion: number } }>(`/admin/ai-content/images/${jobId}/approve`, {
        method: "POST",
        body: { expectedPostVersion, altText, altWrittenFromImage: true, ...(note ? { note } : {}) },
      })
      .then((r) => r.data.data),
  rejectImage: (jobId: string, note: string) =>
    httpClient.request<{ data: { rejected: true } }>(`/admin/ai-content/images/${jobId}/reject`, { method: "POST", body: { note } }).then((r) => r.data.data),
  generate: (topic: AiTopic, scope: "full" | "metadata", key: string) =>
    httpClient
      .request<{ data: { operationId: string; created: boolean; topic: AiTopic } }>(`/admin/ai-content/topics/${topic.id}/generate`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: { expectedVersion: topic.version, scope },
      })
      .then((r) => r.data.data),
  generation: (id: string) =>
    httpClient.request<{ data: GenerationHistory }>(`/admin/ai-content/topics/${id}/generation`).then((r) => r.data.data),
  approve: (topic: AiTopic, postVersion: number, note?: string) =>
    httpClient
      .request<{ data: AiTopic }>(`/admin/ai-content/topics/${topic.id}/approve`, { method: "POST", body: { expectedVersion: topic.version, postVersion, ...(note ? { note } : {}) } })
      .then((r) => r.data.data),
  confirmFacts: (topic: AiTopic, postVersion: number, note: string) =>
    httpClient
      .request<{ data: { status: TopicStatus } }>(`/admin/ai-content/topics/${topic.id}/confirm-facts`, { method: "POST", body: { expectedVersion: topic.version, postVersion, note } })
      .then((r) => r.data.data),
  recheckFacts: (topic: AiTopic) =>
    httpClient
      .request<{ data: { status: TopicStatus; violations: { field: string; token: string; reason: string }[]; confirmed: boolean } }>(`/admin/ai-content/topics/${topic.id}/recheck-facts`, { method: "POST", body: { expectedVersion: topic.version } })
      .then((r) => r.data.data),
  applyProposal: (runId: string, expectedPostVersion: number) =>
    httpClient
      .request<{ data: { status: TopicStatus } }>(`/admin/ai-content/runs/${runId}/apply`, { method: "POST", body: { expectedPostVersion } })
      .then((r) => r.data.data),
  resolveOperation: (operationId: string, action: "reconcile" | "abandon", note: string) =>
    httpClient.request(`/admin/ai-content/operations/${operationId}/resolve`, { method: "POST", body: { action, note } }).then(() => undefined),
  budget: () => httpClient.request<{ data: BudgetStatus }>("/admin/ai-content/budget").then((r) => r.data.data),
  resumePaidCalls: (note: string) =>
    httpClient.request<{ data: BudgetStatus }>("/admin/ai-content/budget/resume", { method: "POST", body: { note } }).then((r) => r.data.data),
  prices: () => httpClient.request<{ data: PriceSchedule[] }>("/admin/ai-content/prices").then((r) => r.data.data),
  proposePrice: (input: Omit<PriceSchedule, "id" | "serviceTier" | "status" | "approvedAt">) =>
    httpClient.request<{ data: PriceSchedule }>("/admin/ai-content/prices", { method: "POST", body: input }).then((r) => r.data.data),
  approvePrice: (id: string) =>
    httpClient.request<{ data: PriceSchedule }>(`/admin/ai-content/prices/${id}/approve`, { method: "POST", body: {} }).then((r) => r.data.data),
};
