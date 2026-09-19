/**
 * @adelaide-sphere/database/automation — durable AI work (AI plan §E, N2):
 * the control epoch, leased and fenced operations, recovery, and applying a
 * generation run to its one canonical article. Backend only; no network calls.
 */
export { AI_CONTROL_ID, advanceControlEpoch, readAutomationControl, type AutomationControl } from './control.js';
export {
  DEFAULT_LEASE_MS,
  MAX_OPERATION_ATTEMPTS,
  REDELIVERY_AFTER_MS,
  StaleLeaseError,
  assertLease,
  cancelItemOperations,
  claimOperation,
  enqueueOperationDelivery,
  extendLease,
  finishOperation,
  operationKey,
  recordGenerationForApply,
  recoverOperations,
  releaseForRetry,
  type OperationLease,
  type RecoveryResult,
} from './operations.js';
export { ARTIFACT_LIMITS, applyOperation, artifactHash, artifactProblems, type ApplyResult, type ArticleArtifact } from './apply.js';
export {
  assessNovelty,
  bumpInventoryEpoch,
  configuredLocation,
  fingerprintTopic,
  lockInventory,
  noveltyDetailJson,
  readInventoryEpoch,
  type NoveltyAssessment,
  type StoredFingerprint,
} from './novelty.js';
export {
  MAX_RESEARCH_URLS,
  ResearchCommandError,
  addEditorClaim,
  admitTopic,
  startSlotResearch,
  claimKey,
  completeResearch,
  evaluatePacket,
  normalizeResearchUrl,
  parseResearchUrls,
  readResearchSettings,
  recordEvidence,
  refreshResearch,
  researchFreshnessBlocker,
  researchUrlHash,
  resolveClaim,
  type AdmissionInput,
  type ClaimCandidate,
  type EvidenceInput,
  type ResearchUrl,
} from './research.js';
export { MAX_DISCOVERY_CANDIDATES, recordDiscoveryCandidates, requestDiscovery, type DiscoveryResult, type DiscoverySignal } from './discovery.js';
export { APPROVED_TEXT_MODELS, IMAGE_MODELS, TEXT_PROVIDER_CAPABILITIES, capabilityProblem, imageCapabilityProblem, imageModelCapability, nativeImageSize, type CapabilityProblem, type ImageCapabilityProblem, type ImageModelCapability, type ImageProviderId, type ModelCapability } from './providers.js';
export {
  BudgetRefusal,
  approvedPrice,
  budgetStatus,
  haltPaidCalls,
  imagePriceOf,
  paidCallsHalt,
  readBudgetLimits,
  releaseReservation,
  reserveBudget,
  settleOperation,
  type ApprovedPrice,
  type BudgetCategory,
  type BudgetLimits,
  type SettlementInput,
} from './budget.js';
export {
  GenerationCommandError,
  beginSend,
  completeGeneration,
  loadGenerationRequest,
  readGenerationSettings,
  recordAccepted,
  recordRejected,
  recordUnknown,
  requestBytes,
  requestGeneration,
  verifiedClaims,
  type ProviderResult,
  type TextRequest,
} from './generation.js';
export { applyProposal, approveContent, approvePrice, confirmFacts, currentFactConfirmation, postCoverage, postFactReview, proposePrice, recheckFacts, resolveUnknownOperation, resumePaidCalls, type PriceInput } from './review.js';
export {
  approveImage,
  beginImageSend,
  completeImage,
  featuredBrief,
  loadImageRequest,
  MAX_COMPARISON_CANDIDATES,
  modelSubstituted,
  quoteImageComparison,
  readImageSettings,
  recordImageRejected,
  recordImageUnknown,
  rejectImage,
  requestImage,
  requestImageComparison,
  type ComparisonCandidate,
  type ImageRequest,
  type ImageResult,
  type ImageResultCommon,
  type ImageSettings,
} from './images.js';
export { SLOT_STRATEGY, planSlots, readScheduleSettings, reviewMissedSlot, scheduleStatus, type PlanResult, type ScheduleSettings } from './schedule.js';
export { aiAttention, type AiAttention } from './attention.js';
export { DEFAULT_RETENTION_DAYS, PURGED_MARKER, purgeExpiredAiData, readRetentionDays, type RetentionResult } from './retention.js';
