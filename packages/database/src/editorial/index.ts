/**
 * @adelaide-sphere/database/editorial — the backend-only editorial seam shared
 * by the API and the worker (AI plan §B, N2): the sanitiser, media reference
 * sync, revisions, the article material hash, the AI publication policy used
 * by both publishing paths, and the scheduled publication command. Never
 * import from browser code.
 */
export { renderSanitisedBody, sanitiseHtmlFragment, toPlainText, type BodyFormat } from './sanitise.js';
export { clearContentMedia, syncContentMedia } from './content-media.js';
export { MAX_POST_REVISIONS, recordPostRevision, type RevisionSource } from './revisions.js';
export { postMaterialHash, readPostMaterial, type MaterialPost } from './material.js';
export {
  aiPublicationDecision,
  closeAiHumanEdit,
  currentContentApproval,
  invalidateApprovals,
  lockLinkedAiItem,
  moveAiItem,
  openAiHumanEdit,
  syncAiItemWithPost,
  type AiPublicationDecision,
  type HumanEditHandle,
  type LinkedAiItem,
  type PublicationPath,
  type TransitionAudit,
} from './ai-publication.js';
export { DUE_SCHEDULED_POST_SELECT, publishDueScheduledPost, type DueScheduledPost, type ScheduledPublicationOutcome } from './scheduled-publication.js';
