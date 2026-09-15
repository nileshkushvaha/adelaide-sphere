import { describe, expect, it } from 'vitest';
import { CACHE_INVALIDATE_JOB, ENQUIRY_EMAIL_JOB, QUEUE_NAME } from '@adelaide-sphere/domain';
import { MIN_CLEAN_AGE_HOURS, QUEUES, queueDescriptor, redactJobData } from './queue-registry.js';

const queue = queueDescriptor(QUEUE_NAME)!;

/** Redaction is the whole security story of this screen (SRS 1.2 QMON 002). */
describe('queue registry', () => {
  it('registers the one queue the application actually uses, with every job it dispatches', () => {
    expect(QUEUES).toHaveLength(1);
    expect(queue.jobs.map((job) => job.name)).toEqual(['enquiry.email', 'media.process', 'cache.invalidate']);
    expect(queueDescriptor('anything-else')).toBeUndefined();
  });

  it('shows only allowlisted fields, and never the visitor’s own words or address', () => {
    const { fields, unrecognised } = redactJobData(queue, ENQUIRY_EMAIL_JOB, {
      enquiryId: 'enq-1',
      businessId: 'biz-1',
      attempt: 2,
      // None of these are declared, so none of them can appear.
      name: 'Jo Nguyen',
      email: 'jo@example.com',
      message: 'Do you open on Sundays?',
      resetToken: 'secret-token',
      authorization: 'Bearer abc',
      renderedHtml: '<p>hello</p>',
    });
    expect(unrecognised).toBe(false);
    expect(fields).toEqual([
      { label: 'Enquiry', value: 'enq-1' },
      { label: 'Listing', value: 'biz-1' },
      { label: 'Attempt', value: '2' },
    ]);
    const rendered = JSON.stringify(fields);
    for (const secret of ['Jo Nguyen', 'jo@example.com', 'Sundays', 'secret-token', 'Bearer', 'hello']) {
      expect(rendered).not.toContain(secret);
    }
  });

  it('summarises a list as a count rather than printing it', () => {
    const { fields } = redactJobData(queue, CACHE_INVALIDATE_JOB, { resourceType: 'business', resourceId: 'b1', tags: ['businesses', 'business:x'], urgent: true });
    expect(fields).toEqual([
      { label: 'Resource', value: 'business' },
      { label: 'Record', value: 'b1' },
      { label: 'Tags', value: '2' },
      { label: 'Urgent', value: 'Yes' },
    ]);
  });

  it('degrades to a placeholder for a job or payload it does not recognise', () => {
    expect(redactJobData(queue, 'something.new', { token: 'secret' })).toEqual({ fields: [], unrecognised: true });
    expect(redactJobData(queue, ENQUIRY_EMAIL_JOB, 'not-an-object')).toEqual({ fields: [], unrecognised: true });
    expect(redactJobData(queue, ENQUIRY_EMAIL_JOB, null)).toEqual({ fields: [], unrecognised: true });
  });

  it('bounds a text field so a long value cannot become a payload dump', () => {
    const { fields } = redactJobData(queue, 'media.process', { mediaId: 'm1', originalKey: 'k'.repeat(500) });
    expect(fields.find((field) => field.label === 'Source object')!.value).toHaveLength(120);
  });

  it('keeps a day of finished-job evidence out of reach of the cleaner', () => {
    expect(MIN_CLEAN_AGE_HOURS).toBeGreaterThanOrEqual(24);
  });

  it('states what stops working before a queue can be paused', () => {
    expect(queue.pauseConsequence).toMatch(/enquir/i);
    expect(queue.pauseConsequence).toMatch(/nothing is lost|waits/i);
  });
});
