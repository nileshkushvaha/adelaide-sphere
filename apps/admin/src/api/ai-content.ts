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
};
