import { deliverEnquiry, markDeliveryFailed, type DeliveryDeps } from './enquiry-delivery.js';
import { EnquiryMailerPort, PermanentDeliveryError, TransientDeliveryError, type DeliveryResult, type OutboundEnquiryMessage } from './mailer/mailer.port.js';

class RecordingMailer extends EnquiryMailerPort {
  readonly transportName = 'test';
  sent: OutboundEnquiryMessage[] = [];
  failWith: Error | null = null;
  async send(message: OutboundEnquiryMessage): Promise<DeliveryResult> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
    return { providerMessageId: 'provider-1' };
  }
}

type TestEnquiry = {
  id: string;
  businessId: string | null;
  name: string;
  emailEncrypted: string;
  phoneEncrypted: string | null;
  subject: string;
  message: string;
  deliveryStatus: string;
  createdAt: Date;
  business: { id: string; name: string; status: string; privateEnquiryEmailEncrypted: string | null } | null;
};

const baseEnquiry: TestEnquiry = {
  id: 'enq-1234567890abc',
  businessId: 'biz-1',
  name: 'Jo Visitor',
  emailEncrypted: 'enc:jo@example.com',
  phoneEncrypted: null,
  subject: 'Catering',
  message: 'Do you cater for office breakfasts? We need about twenty serves.',
  deliveryStatus: 'queued',
  createdAt: new Date('2026-09-06T02:30:00Z'),
  business: { id: 'biz-1', name: 'Carlton Corner Bakery', status: 'published', privateEnquiryEmailEncrypted: 'enc:owner@example.com' },
};

function deps(overrides: Partial<TestEnquiry> & { mailer?: RecordingMailer } = {}) {
  const { mailer = new RecordingMailer(), ...enquiryOverrides } = overrides;
  const enquiry = { ...baseEnquiry, ...enquiryOverrides };
  const updates: Record<string, unknown>[] = [];
  const deliveries: Record<string, unknown>[] = [];
  const db = {
    // The operational delivery log (SRS 1.2 MAIL 005): recorded around the
    // send, and never able to stop it.
    emailDelivery: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        deliveries.push(data);
        return { id: 'del-1' };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        deliveries.push(data);
        return { id: 'del-1' };
      },
    },
    enquiry: {
      findUnique: async () => (enquiryOverrides.id === null ? null : enquiry),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return enquiry;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { count: 1 };
      },
    },
  };
  const built = { subject: 'Enquiry: Catering', replyTo: 'jo@example.com', text: 'body', html: '<p>body</p>' };
  const dependencies = {
    db: db as never,
    mailer,
    decrypt: (stored: string) => stored.replace('enc:', ''),
    encrypt: (plaintext: string) => `enc:${plaintext}`,
    buildMail: () => built,
    fromAddress: 'no-reply@adelaidesphere.example',
    siteRecipient: 'site@adelaidesphere.example',
    now: () => new Date('2026-09-06T03:00:00Z'),
  } satisfies DeliveryDeps;
  return { dependencies, updates, deliveries, mailer, db: db as never };
}

describe('enquiry delivery (SRS ENQ 004–006)', () => {
  it('sends to the listing recipient with the visitor address only as Reply-To', async () => {
    const { dependencies, updates, mailer } = deps();
    expect(await deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, dependencies)).toBe('delivered');
    expect(mailer.sent[0]).toMatchObject({ to: 'owner@example.com', from: 'no-reply@adelaidesphere.example', replyTo: 'jo@example.com', text: 'body', html: '<p>body</p>', messageId: 'enq-1234567890abc@adelaide-sphere' });
    expect(updates.at(-1)).toMatchObject({ deliveryStatus: 'providerAccepted', providerMessageId: 'provider-1' });
  });

  it('is a no-op for an enquiry that was already accepted by the provider', async () => {
    const { dependencies, mailer } = deps({ deliveryStatus: 'providerAccepted' });
    expect(await deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, dependencies)).toBe('skipped');
    expect(mailer.sent).toHaveLength(0);
  });

  it('suppresses instead of sending when the listing is unpublished or has no recipient', async () => {
    const unpublished = deps({ business: { ...baseEnquiry.business!, status: 'draft' } });
    expect(await deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, unpublished.dependencies)).toBe('suppressed');
    expect(unpublished.updates.at(-1)).toMatchObject({ deliveryStatus: 'suppressed', suppressionReason: 'The listing is no longer published' });
    expect(unpublished.mailer.sent).toHaveLength(0);

    const noRecipient = deps({ business: { ...baseEnquiry.business!, privateEnquiryEmailEncrypted: null } });
    expect(await deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, noRecipient.dependencies)).toBe('suppressed');
    expect(noRecipient.updates.at(-1)).toMatchObject({ suppressionReason: 'The listing no longer has an enquiry recipient' });
  });

  it('routes a site enquiry to the configured recipient and suppresses when none is set', async () => {
    const site = deps({ businessId: null, business: null });
    expect(await deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, site.dependencies)).toBe('delivered');
    expect(site.mailer.sent[0]?.to).toBe('site@adelaidesphere.example');

    const none = deps({ businessId: null, business: null });
    expect(await deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, { ...none.dependencies, siteRecipient: undefined })).toBe('suppressed');
  });

  it('rethrows transient failures for retry and records permanent ones as failed', async () => {
    const transient = deps();
    transient.mailer.failWith = new TransientDeliveryError('provider 503');
    await expect(deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, transient.dependencies)).rejects.toBeInstanceOf(TransientDeliveryError);
    expect(transient.updates.at(-1)).toMatchObject({ deliveryStatus: 'retrying', lastError: 'The mail provider did not accept this message yet; it will be retried.' });

    const permanent = deps();
    permanent.mailer.failWith = new PermanentDeliveryError('invalid recipient');
    expect(await deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, permanent.dependencies)).toBe('skipped');
    expect(permanent.updates.at(-1)).toMatchObject({ deliveryStatus: 'failed', lastError: 'The mail provider refused this message.' });
  });

  it('marks exhausted deliveries failed', async () => {
    const { db, updates } = deps();
    await markDeliveryFailed(db, 'enq-1234567890abc', 'attempts exhausted');
    expect(updates.at(-1)).toMatchObject({ deliveryStatus: 'failed', lastError: 'attempts exhausted' });
  });
});

describe('delivery log records (SRS 1.2 MAIL 005/006/008)', () => {
  it('records the send with a masked and encrypted recipient, no subject and status "sent"', async () => {
    const { dependencies, deliveries } = deps();
    await deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, dependencies);

    expect(deliveries[0]).toMatchObject({
      templateKey: 'enquiry.business',
      category: 'enquiry',
      recipientMasked: 'o•••r@example.com',
      recipientEncrypted: 'enc:owner@example.com',
      // A visitor writes the subject, so it is not retained.
      subject: null,
      relatedType: 'enquiry',
      status: 'queued',
    });
    // Accepted by the provider is "sent", never "delivered".
    expect(deliveries.at(-1)).toMatchObject({ status: 'sent', providerMessageId: 'provider-1' });
  });

  it('records a failed attempt with a bounded code rather than provider text', async () => {
    const mailer = new RecordingMailer();
    mailer.failWith = new TransientDeliveryError('SMTP ECONNREFUSED: relay unreachable');
    const { dependencies, deliveries } = deps({ mailer });

    await expect(deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, dependencies)).rejects.toBeInstanceOf(TransientDeliveryError);
    expect(deliveries.at(-1)).toMatchObject({ status: 'failed', failureCode: 'transient_provider' });
  });

  it('never lets a failure to write the log stop an accepted enquiry from being delivered', async () => {
    const { dependencies, updates } = deps();
    (dependencies.db as unknown as { emailDelivery: { create: () => Promise<unknown> } }).emailDelivery.create = async () => {
      throw new Error('log unavailable');
    };
    expect(await deliverEnquiry({ eventId: 'e1', enquiryId: 'enq-1234567890abc' }, dependencies)).toBe('delivered');
    expect(updates.at(-1)).toMatchObject({ deliveryStatus: 'providerAccepted' });
  });
});
