import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailLogsPage } from '@/pages/system/EmailLogsPage';
import { renderWithProviders, providerWithPermissions } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const delivery = {
  id: 'del-1',
  provider: 'resend',
  providerMessageId: 'prov-1',
  templateKey: 'enquiry.business',
  category: 'enquiry',
  recipient: 'o••••r@example.com',
  subject: null,
  relatedType: 'enquiry',
  relatedId: 'enq-1',
  status: 'failed',
  attempts: 1,
  failureCode: 'transient_provider',
  failureSummary: 'Resend responded 503',
  requestId: 'req-1',
  createdAt: '2026-09-07T10:00:00.000Z',
  sentAt: null,
  deliveredAt: null,
  failedAt: '2026-09-07T10:00:01.000Z',
};

const list = { data: [delivery], meta: { page: 1, pageSize: 25, total: 1, pageCount: 1 } };

/**
 * The log is a read-only screen whose sensitive actions are separately
 * permissioned (SRS 1.2 MAIL 005/009/010, RBAC 010). The API refuses either
 * way; these prove the interface does not offer an action that will be refused,
 * and does not display an address it was not given.
 */
describe('EmailLogsPage', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/email-logs/del-1/recipient')) return jsonResponse(200, { data: { recipient: 'owner@example.com' } });
      if (url.includes('/admin/email-logs')) return jsonResponse(200, list);
      return jsonResponse(200, { data: [] });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows the masked recipient and offers neither reveal nor resend to a viewer', async () => {
    renderWithProviders(<EmailLogsPage />, { initialEntries: ['/admin/system/email-logs'], authProvider: providerWithPermissions(['system.email_logs.view']) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Email logs' })).toBeInTheDocument();
    expect(await screen.findByText('o••••r@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^resend$/i })).not.toBeInTheDocument();
  });

  it('offers reveal only with the recipient permission, and shows the address it is given', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmailLogsPage />, {
      initialEntries: ['/admin/system/email-logs'],
      authProvider: providerWithPermissions(['system.email_logs.view', 'system.email_logs.recipients.view']),
    });

    await user.click(await screen.findByRole('button', { name: /reveal/i }));
    // Revealing an address is recorded, and the reader is told so before it is.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/recorded in the activity log/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Show the address' }));
    expect(await screen.findByText('owner@example.com')).toBeInTheDocument();
  });

  it('offers resend with the resend permission, and confirms before acting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmailLogsPage />, {
      initialEntries: ['/admin/system/email-logs'],
      authProvider: providerWithPermissions(['system.email_logs.view', 'system.email_logs.resend']),
    });

    await user.click(await screen.findByRole('button', { name: /^resend$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/may receive the message twice/i)).toBeInTheDocument();
  });

  it('does not offer resend for a delivered message, which the server refuses anyway', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { ...list, data: [{ ...delivery, status: 'delivered' }] })) as typeof fetch;
    renderWithProviders(<EmailLogsPage />, {
      initialEntries: ['/admin/system/email-logs'],
      authProvider: providerWithPermissions(['system.email_logs.view', 'system.email_logs.resend']),
    });

    expect(await screen.findByText('delivered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^resend$/i })).not.toBeInTheDocument();
  });
});
