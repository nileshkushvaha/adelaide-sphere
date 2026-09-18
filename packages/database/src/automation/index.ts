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
export { APPROVED_TEXT_MODELS, TEXT_PROVIDER_CAPABILITIES, capabilityProblem, type CapabilityProblem, type ModelCapability } from './providers.js';
export {
  BudgetRefusal,
  approvedPrice,
  budgetStatus,
  haltPaidCalls,
  paidCallsHalt,
  readBudgetLimits,
  releaseReservation,
  reserveBudget,
  settleOperation,
  type ApprovedPrice,
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
