import { AI_OPERATION_JOB, AI_QUEUE_NAME, CACHE_INVALIDATE_JOB, ENQUIRY_EMAIL_JOB, MEDIA_PROCESS_JOB, QUEUE_NAME } from '@adelaide-sphere/domain';

/**
 * What the queue monitor is allowed to know about (SRS 1.2 QMON 001–002).
 *
 * Two registries, both closed:
 *
 *  - the queues an administrator may look at and act on, and whether pausing
 *    one is operationally acceptable at all;
 *  - per job name, the *only* payload fields that may be displayed.
 *
 * The redaction rule is an allowlist rather than a deny-list on purpose. A
 * deny-list has to be updated every time a job gains a field, and the failure
 * mode of forgetting is that a token or an email address appears on screen. An
 * allowlist's failure mode is that a new field is not shown until someone adds
 * it here deliberately, which is the direction an operations screen should fail
 * in.
 */
export interface QueueJobDescriptor {
  name: string;
  label: string;
  purpose: string;
  /**
   * Payload fields that may be displayed, with how each is rendered. `id`
   * values are identifiers already visible elsewhere in the admin; `count` and
   * `flag` are summaries, never the value itself.
   */
  displayFields: { field: string; label: string; render: 'id' | 'text' | 'count' | 'flag' }[];
}

export interface QueueDescriptor {
  name: string;
  label: string;
  purpose: string;
  /**
   * Whether pausing is permitted at all. Pausing the only queue stops enquiry
   * delivery and cache invalidation, so it is allowed but never silently: the
   * consequence is stated to the administrator before they confirm.
   */
  pausable: boolean;
  pauseConsequence: string;
  jobs: QueueJobDescriptor[];
}

export const QUEUES: QueueDescriptor[] = [
  {
    name: QUEUE_NAME,
    label: 'Adelaide Sphere',
    purpose: 'Every background job: enquiry delivery, media processing and public cache invalidation.',
    pausable: true,
    pauseConsequence:
      'While this queue is paused, enquiries are still accepted and stored but not delivered, uploaded images are not processed, and public pages keep serving cached content until their own lifetime expires. Nothing is lost; everything waits.',
    jobs: [
      {
        name: ENQUIRY_EMAIL_JOB,
        label: 'Enquiry delivery',
        purpose: 'Sends an accepted enquiry to the recipient recorded on the listing, or to the configured site recipient.',
        // Never the visitor's name, address, message or the rendered mail.
        displayFields: [
          { field: 'enquiryId', label: 'Enquiry', render: 'id' },
          { field: 'businessId', label: 'Listing', render: 'id' },
          { field: 'attempt', label: 'Attempt', render: 'count' },
        ],
      },
      {
        name: MEDIA_PROCESS_JOB,
        label: 'Media processing',
        purpose: 'Derives the stored variants of an uploaded image.',
        displayFields: [
          { field: 'mediaId', label: 'Asset', render: 'id' },
          { field: 'originalKey', label: 'Source object', render: 'text' },
        ],
      },
      {
        name: CACHE_INVALIDATE_JOB,
        label: 'Cache invalidation',
        purpose: 'Asks the public site to drop the pages affected by a publication change.',
        displayFields: [
          { field: 'resourceType', label: 'Resource', render: 'text' },
          { field: 'resourceId', label: 'Record', render: 'id' },
          { field: 'tags', label: 'Tags', render: 'count' },
          { field: 'urgent', label: 'Urgent', render: 'flag' },
        ],
      },
    ],
  },
  {
    name: AI_QUEUE_NAME,
    label: 'AI content',
    purpose: 'AI content operations (research, drafts, images, apply) on their own small consumer, so they never hold up the main queue.',
    pausable: true,
    pauseConsequence:
      'While this queue is paused, AI research, drafts and images wait. Every operation stays recorded in the database and continues when resumed; paid requests are never repeated because of a pause.',
    jobs: [
      {
        name: AI_OPERATION_JOB,
        label: 'AI operation',
        purpose: 'Runs one recorded AI operation; the database row decides what it does, so a repeat delivery does nothing.',
        displayFields: [{ field: 'operationId', label: 'Operation', render: 'id' }],
      },
    ],
  },
];

export function queueDescriptor(name: string): QueueDescriptor | undefined {
  return QUEUES.find((queue) => queue.name === name);
}

export function jobDescriptor(queue: QueueDescriptor, jobName: string): QueueJobDescriptor | undefined {
  return queue.jobs.find((job) => job.name === jobName);
}

/** Longest string shown for a text field; a summary, not the payload. */
const MAX_TEXT = 120;

export interface RedactedField {
  label: string;
  value: string;
}

/**
 * Summarises a job payload for display (QMON 002).
 *
 * Only allowlisted fields survive, each is rendered by its declared kind, and
 * an unrecognised job name produces a placeholder rather than the payload — so
 * a job added to the worker without being registered here is visible as work,
 * but its data is not printed.
 */
export function redactJobData(queue: QueueDescriptor, jobName: string, data: unknown): { fields: RedactedField[]; unrecognised: boolean } {
  const descriptor = jobDescriptor(queue, jobName);
  if (!descriptor) return { fields: [], unrecognised: true };
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { fields: [], unrecognised: true };
  const payload = data as Record<string, unknown>;

  const fields: RedactedField[] = [];
  for (const { field, label, render } of descriptor.displayFields) {
    const value = payload[field];
    if (value === undefined || value === null) continue;
    if (render === 'count') {
      const count = Array.isArray(value) ? value.length : typeof value === 'number' ? value : null;
      if (count !== null) fields.push({ label, value: String(count) });
      continue;
    }
    if (render === 'flag') {
      fields.push({ label, value: value === true ? 'Yes' : 'No' });
      continue;
    }
    // `id` and `text` are both rendered as bounded plain text; nothing is
    // parsed, evaluated or reassembled into an object for display.
    if (typeof value === 'string' || typeof value === 'number') {
      fields.push({ label, value: String(value).slice(0, MAX_TEXT) });
    }
  }
  return { fields, unrecognised: false };
}

/** Upper bound on any single listing or bulk action (QMON 004). */
export const MAX_JOBS_PER_PAGE = 50;
export const MAX_BULK_ITEMS = 25;

/** Job states an administrator may list. `completed` is included for evidence, not for action. */
export const LISTABLE_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;
export type ListableState = (typeof LISTABLE_STATES)[number];

/** Retry applies to failed jobs only; removal to work that has not run yet. */
export const RETRYABLE_STATES: ListableState[] = ['failed'];
export const REMOVABLE_STATES: ListableState[] = ['waiting', 'delayed', 'failed'];

/**
 * Cleaning removes *metadata* for finished jobs, never work still to be done,
 * and never anything younger than this — an operator cannot erase the evidence
 * of a failure that has just happened.
 */
export const MIN_CLEAN_AGE_HOURS = 24;
export const MAX_CLEAN_JOBS = 1_000;
export const CLEANABLE_STATES = ['completed', 'failed'] as const;
export type CleanableState = (typeof CLEANABLE_STATES)[number];
