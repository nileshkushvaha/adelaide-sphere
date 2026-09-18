/**
 * The editorial sanitiser (SRS BLOG 001, SEC 001) lives in the backend-only
 * database package so the API and the worker render article bodies with one
 * implementation (AI plan §B, N2). This module keeps the API's import path.
 */
export { renderSanitisedBody, sanitiseHtmlFragment, toPlainText, type BodyFormat } from '@adelaide-sphere/database/editorial';
