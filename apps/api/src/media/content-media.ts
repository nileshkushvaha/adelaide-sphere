/**
 * Content media reference tracking (SRS MED 004, DAT 003) lives in the
 * backend-only database package, shared by the API and the worker's editorial
 * commands (AI plan §B, N2). This module keeps the API's import path.
 */
export { clearContentMedia, syncContentMedia } from '@adelaide-sphere/database/editorial';
