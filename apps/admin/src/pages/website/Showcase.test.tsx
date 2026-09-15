import { screen } from '@testing-library/react';
import { TestimonialsPage } from '@/pages/website/TestimonialsPage';
import { PartnersPage } from '@/pages/website/PartnersPage';
import { renderWithProviders, providerWithPermissions } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const testimonial = {
  id: 't-1',
  displayName: 'Jo Nguyen',
  relationship: 'Owner, Carlton Corner Bakery',
  quote: 'Being listed brought us regulars from three suburbs away.',
  businessId: null,
  mediaId: null,
  approvedAt: null,
  approvedByAdminId: null,
  approvalNote: null,
  displayOrder: 0,
  status: 'draft',
  publishedAt: null,
  version: 1,
  updatedAt: '2026-09-07T10:00:00.000Z',
};

const partner = {
  id: 'p-1',
  name: 'City of Melbourne',
  relationshipLabel: 'Community partner',
  mediaId: null,
  logoAlt: null,
  websiteUrl: null,
  authorisedAt: null,
  authorisedByAdminId: null,
  authorisationNote: null,
  displayOrder: 0,
  status: 'draft',
  publishedAt: null,
  version: 1,
  updatedAt: '2026-09-07T10:00:00.000Z',
};

const meta = { page: 1, pageSize: 20, total: 1, pageCount: 1 };

/**
 * Partners still may not be published without a logo (SRS 1.2 PTNR 003), and
 * the server refuses either way; that test proves the interface does not offer
 * an action that will be refused, and says what is missing.
 *
 * Testimonials no longer carry an approval at all: they are entered by
 * administrators who hold the permission to enter them, and status alone
 * decides whether a quote is on the site (TSTM 002, amended at the client's
 * instruction). What is tested here is that the screen says so in the words the
 * client uses — active and inactive — and offers nothing about consent.
 */
describe('Testimonials and partners screens', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('offers nothing about consent, and calls the two states active and inactive', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: [testimonial], meta })) as typeof fetch;
    renderWithProviders(<TestimonialsPage />, {
      initialEntries: ['/admin/website/testimonials'],
      authProvider: providerWithPermissions(['website.testimonials.view', 'website.testimonials.publish']),
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Testimonials' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Make active' })).toBeEnabled();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /consent|approv/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/consent|approv/i)).not.toBeInTheDocument();
  });

  it('shows no publishing controls without the permission', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: [testimonial], meta })) as typeof fetch;
    renderWithProviders(<TestimonialsPage />, {
      initialEntries: ['/admin/website/testimonials'],
      authProvider: providerWithPermissions(['website.testimonials.view']),
    });

    await screen.findByRole('heading', { level: 1, name: 'Testimonials' });
    expect(screen.queryByRole('button', { name: /Make (in)?active/ })).not.toBeInTheDocument();
  });

  it('will not offer to publish a partner without a logo, and says why', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: [partner], meta })) as typeof fetch;
    renderWithProviders(<PartnersPage />, {
      initialEntries: ['/admin/website/partners'],
      authProvider: providerWithPermissions(['website.clients.view', 'website.clients.publish', 'website.clients.approve']),
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Clients and partners' })).toBeInTheDocument();
    // Waited for rather than read immediately: the action buttons appear once
    // the server's effective permissions have loaded (RBAC 010).
    expect(await screen.findByRole('button', { name: /^publish$/i })).toBeDisabled();
    // Permission cannot be recorded before there is a mark it refers to.
    expect(screen.getByRole('button', { name: /record permission/i })).toBeDisabled();
  });

  it('still refuses to publish a partner whose logo has no alternative text', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: [{ ...partner, mediaId: 'media-1' }], meta })) as typeof fetch;
    renderWithProviders(<PartnersPage />, {
      initialEntries: ['/admin/website/partners'],
      authProvider: providerWithPermissions(['website.clients.view', 'website.clients.publish']),
    });

    expect(await screen.findByRole('button', { name: /^publish$/i })).toBeDisabled();
  });

  it('publishes a partner once it has both a logo and alternative text', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: [{ ...partner, mediaId: 'media-1', logoAlt: 'City of Melbourne' }], meta })) as typeof fetch;
    renderWithProviders(<PartnersPage />, {
      initialEntries: ['/admin/website/partners'],
      authProvider: providerWithPermissions(['website.clients.view', 'website.clients.publish']),
    });

    expect(await screen.findByRole('button', { name: /^publish$/i })).toBeEnabled();
  });
});
