import { ConflictException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SubmitEnquiryDto } from './dto/enquiry.dto.js';
import { EnquiriesService } from './enquiries.service.js';

/** Thrown by the stubbed guard so a test stops before the transaction it does not need. */
const STOP = new Error('stopped after the public-write guard');

const input = (over: Partial<SubmitEnquiryDto> = {}): SubmitEnquiryDto => ({
  name: 'Sarah Wilson',
  email: 'sarah@example.com',
  subject: 'Correct a published listing',
  message: 'The opening hours on the Carlton bakery listing are out of date.',
  acknowledged: true,
  captchaToken: 'token',
  ...over,
});

const ctx = { ip: '203.0.113.9', requestId: 'req-1' };

function serviceWith({ siteRecipient, business }: { siteRecipient?: string; business?: { id: string; name: string; privateEnquiryEmailEncrypted: string | null } | null }) {
  const guardPublicWrite = vi.fn().mockRejectedValue(STOP);
  const client = { business: { findFirst: vi.fn().mockResolvedValue(business ?? null) } };
  const settings: Record<string, string | undefined> = { APP_SECRET_KEY: 'unit-test-secret-key-unit-test-secret', SUBMISSION_TERMS_VERSION: '2026-09', SITE_ENQUIRY_RECIPIENT: siteRecipient };
  const service = new EnquiriesService(
    { client: async () => client } as never,
    {} as never,
    {} as never,
    {} as never,
    { guardPublicWrite } as never,
    { get: (key: string) => settings[key] } as never,
  );
  return { service, guardPublicWrite };
}

describe('EnquiriesService.submit — public-write guard (SRS ENQ 002, SEC 002)', () => {
  it('verifies a site contact token against the contact form’s own action', async () => {
    const { service, guardPublicWrite } = serviceWith({ siteRecipient: 'editors@example.com' });
    await expect(service.submit(null, input(), ctx)).rejects.toBe(STOP);
    expect(guardPublicWrite).toHaveBeenCalledWith(expect.objectContaining({ action: 'contact', captchaToken: 'token' }), ctx);
  });

  it('verifies a listing enquiry token against the enquiry action', async () => {
    const { service, guardPublicWrite } = serviceWith({ business: { id: 'b1', name: 'Carlton Bakery', privateEnquiryEmailEncrypted: 'sealed' } });
    await expect(service.submit('b1', input(), ctx)).rejects.toBe(STOP);
    expect(guardPublicWrite).toHaveBeenCalledWith(expect.objectContaining({ action: 'enquiry' }), ctx);
  });

  it('refuses a contact message without the acknowledgement before spending a rate-limit slot or a token', async () => {
    const { service, guardPublicWrite } = serviceWith({ siteRecipient: 'editors@example.com' });
    const error = await service.submit(null, input({ acknowledged: false }), ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(400);
    expect((error as HttpException).getResponse()).toMatchObject({ fields: { acknowledged: ['Acceptance is required'] } });
    expect(guardPublicWrite).not.toHaveBeenCalled();
  });

  it('refuses a contact message when no site recipient is configured, rather than accepting one it cannot route', async () => {
    const { service, guardPublicWrite } = serviceWith({});
    const error = await service.submit(null, input(), ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'NO_ENQUIRY_ROUTE' });
    expect(guardPublicWrite).not.toHaveBeenCalled();
  });
});
