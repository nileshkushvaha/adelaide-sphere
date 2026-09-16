import { screen, waitFor, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders, providerWithPermissions, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const meta = { page: 1, pageSize: 20, total: 1, pageCount: 1 };
const now = '2026-09-06T00:00:00.000Z';
const term = (id: string, name: string) => ({ id, name, slug: name.toLowerCase(), active: true, version: 1, sortOrder: 0, createdAt: now, updatedAt: now });
const business = {
  id: 'b1', name: 'Peel Street Espresso', slug: 'peel-street-espresso', description: 'A neighbourhood espresso bar serving single-origin coffee and toasties.', status: 'draft',
  primaryCategoryId: 'c1', secondaryCategoryIds: [], serviceIds: [], localAreaId: 'l1', publicPhone: '03 9000 1234', publicEmail: null, publicUrl: null, addressVisibility: 'full',
  address: { line1: '12 Peel St', line2: null, suburb: 'Adelaide', postcode: '5000', latitude: null, longitude: null }, privateEnquiryEmail: 'owner@example.com', hasPrivateEnquiryEmail: true,
  eligibilitySource: 'council list', eligibilityVerifiedAt: now, contentRightsReviewedAt: null, contentRightsNote: null, duplicateOverrideReason: null,
  telHref: 'tel:+61390001234', links: [{ kind: 'instagram', url: 'https://instagram.com/lce', label: null }], hoursMode: 'scheduled',
  publicationBlockers: ['Content rights must be reviewed'], duplicateWarnings: [], firstPublishedAt: null, publishedAt: null, archivedAt: null, version: 3, createdAt: now, updatedAt: now,
};
const listItem = { id: 'b1', name: business.name, slug: business.slug, status: 'draft', primaryCategoryId: 'c1', primaryCategoryName: 'Cafes', localAreaId: 'l1', localAreaName: 'Adelaide CBD', publishable: false, duplicateFlagged: true, publishedAt: null, updatedAt: now, createdAt: now };

describe('businesses pages', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  let publishAttempts = 0;
  let hoursPuts = 0;
  const hours = { mode: 'scheduled', weekly: { monday: { state: 'intervals', intervals: [{ start: '09:00', end: '17:00', endNextDay: false }] }, tuesday: { state: 'closed' }, wednesday: { state: 'closed' }, thursday: { state: 'closed' }, friday: { state: 'open24' }, saturday: { state: 'intervals', intervals: [{ start: '18:00', end: '24:00', endNextDay: false }] }, sunday: { state: 'closed' } }, exceptions: [{ date: '2026-12-25', kind: 'closed', note: 'Christmas Day' }], status: { state: 'closed', until: '2026-09-07T23:00:00.000Z', source: 'weekly' }, evaluatedAt: now, version: 3 };
  beforeEach(() => {
    calls.length = 0;
    publishAttempts = 0;
    hoursPuts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.startsWith('/api/v1/admin/categories')) return jsonResponse(200, { data: [term('c1', 'Cafes')], meta });
      if (url.startsWith('/api/v1/admin/services')) return jsonResponse(200, { data: [term('s1', 'Coffee')], meta });
      if (url.startsWith('/api/v1/admin/areas')) return jsonResponse(200, { data: [term('l1', 'Adelaide CBD')], meta });
      if (url.startsWith('/api/v1/admin/businesses?') && method === 'GET') return jsonResponse(200, { data: [listItem], meta });
      if (url === '/api/v1/admin/businesses/b-published' && method === 'GET') {
        return jsonResponse(200, { data: { ...business, id: 'b-published', status: 'published', firstPublishedAt: now, publishedAt: now, publicationBlockers: [] } });
      }
      if (url.endsWith('/slug') && method === 'POST') return jsonResponse(200, { data: { ...business, id: 'b-published', slug: 'moved-espresso', version: 4 } });
      if (url === '/api/v1/admin/businesses' && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        if (body.publicUrl === 'nope') return jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields: { publicUrl: ['Website must be an http(s) URL'], 'address.postcode': ['Enter a South Australian postcode'] }, requestId: 'r' } });
        return jsonResponse(201, { data: { ...business, id: 'b2', name: body.name, version: 1 } });
      }
      if (url.endsWith('/gallery') && method === 'GET') return jsonResponse(200, { data: [] });
      if (url.endsWith('/gallery') && method === 'PUT') return jsonResponse(200, { data: [] });
      if (url === '/api/v1/admin/businesses/b1/hours' && method === 'GET') return jsonResponse(200, { data: hours });
      if (url === '/api/v1/admin/businesses/b1/hours' && method === 'PUT') {
        hoursPuts += 1;
        if (hoursPuts === 1) return jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Hours are invalid', fields: { 'weekly.monday.intervals.0.end': ['Closing time must be after the opening time (tick "closes next day" for overnight hours)'] }, requestId: 'r' } });
        return jsonResponse(200, { data: { ...hours, version: 4 } });
      }
      if (url === '/api/v1/admin/businesses/b2/hours') return jsonResponse(200, { data: { ...hours, mode: 'unknown', weekly: {}, exceptions: [], status: { state: 'unknown', until: null, source: null }, version: 1 } });
      if (url === '/api/v1/admin/businesses/b-published/hours') return jsonResponse(200, { data: hours });
      if (url === '/api/v1/admin/businesses/b1' && method === 'GET') return jsonResponse(200, { data: business });
      if (url === '/api/v1/admin/businesses/b2' && method === 'GET') return jsonResponse(200, { data: { ...business, id: 'b2', name: 'Fresh Cafe', version: 1 } });
      if (url === '/api/v1/admin/businesses/b1' && method === 'PATCH' && init?.headers && new Headers(init.headers).get('x-test-expired') === '1') return jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue', fields: {}, requestId: 'r' } });
      if (url === '/api/v1/admin/businesses/b1' && method === 'PATCH') return jsonResponse(409, { error: { code: 'STALE_VERSION', message: 'changed', fields: {}, requestId: 'r' } });
      if (url === '/api/v1/admin/businesses/b1/publish') {
        publishAttempts += 1;
        if (publishAttempts === 1) return jsonResponse(409, { error: { code: 'PUBLICATION_BLOCKED', message: 'blocked', fields: { publication: ['Content rights must be reviewed'] }, requestId: 'r' } });
        if (publishAttempts === 2) return jsonResponse(409, { error: { code: 'DUPLICATE_SUSPECTED', message: 'dup', fields: { duplicateOverrideReason: ['Other (other): name'] }, requestId: 'r' } });
        return jsonResponse(200, { data: { ...business, status: 'published', version: 4, publishedAt: now, firstPublishedAt: now } });
      }
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists businesses through the data provider with URL-driven filters and flags', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses?status=draft&q=espresso&sort=name&order=asc&categoryId=c1'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Businesses' })).toBeInTheDocument();
    const row = (await screen.findByRole('link', { name: 'Peel Street Espresso' })).closest('tr')!;
    expect(within(row).getByText('draft')).toBeInTheDocument();
    expect(within(row).getByText('not ready')).toBeInTheDocument();
    expect(within(row).getByLabelText('Possible duplicate')).toBeInTheDocument();
    expect(calls.find((c) => c.url.startsWith('/api/v1/admin/businesses?'))?.url).toBe('/api/v1/admin/businesses?page=1&pageSize=20&sort=name&order=asc&q=espresso&status=draft&categoryId=c1');
    expect(screen.getByRole('link', { name: 'Businesses' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add business/i })).toHaveAttribute('href', '/admin/businesses/new');
  });

  it('hides write controls for read-only roles', async () => {
    const provider = (await import('@/test/render')).authenticatedProvider();
    provider.getPermissions = async () => ['listings.read'];
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses'], authProvider: provider });
    await screen.findByRole('link', { name: 'Peel Street Espresso' });
    expect(screen.queryByRole('link', { name: /add business/i })).not.toBeInTheDocument();
  });

  // Mounts the whole route tree so the post-create navigation is real; it is the
  // heaviest spec in the suite, so it gets its own budget under parallel load.
  it('creates a draft, maps nested field errors from the envelope, then navigates to the new record', { timeout: 60_000 }, async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses/new'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Add business' })).toBeInTheDocument();
    await ue.type(screen.getByLabelText('Business name'), 'Fresh Cafe');
    await ue.type(screen.getByLabelText(/^description/i), 'A brand new cafe with a long enough description for publication.');
    await ue.click(screen.getByLabelText(/primary category/i));
    await ue.click(await screen.findByTitle('Cafes'));
    await ue.click(screen.getByLabelText(/^local area/i));
    await ue.click(await screen.findByTitle('Adelaide CBD'));
    await ue.type(screen.getByLabelText(/address line 1/i), '1 King William St');
    await ue.type(screen.getByLabelText(/^suburb/i), 'Adelaide');
    await ue.type(screen.getByLabelText(/^postcode/i), '5000');
    await ue.type(screen.getByLabelText(/^website/i), 'nope');
    await ue.click(screen.getByRole('button', { name: /add link/i }));
    await ue.type(screen.getByLabelText('Link URL'), 'https://menu.example.com/');
    await ue.type(screen.getByLabelText('Link label'), 'Menu');
    await ue.click(screen.getByRole('button', { name: /create draft/i }));
    expect(await screen.findByText('Website must be an http(s) URL')).toBeInTheDocument();
    expect(await screen.findByText('Enter a South Australian postcode')).toBeInTheDocument();
    await ue.clear(screen.getByLabelText(/^website/i));
    await ue.click(screen.getByRole('button', { name: /create draft/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Fresh Cafe' })).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/admin/businesses' && !c.body?.includes('nope'));
    expect(JSON.parse(post!.body!)).toMatchObject({ name: 'Fresh Cafe', primaryCategoryId: 'c1', localAreaId: 'l1', address: { line1: '1 King William St', suburb: 'Adelaide', postcode: '5000' }, publicUrl: null, contentRightsReviewed: false, links: [{ kind: 'other', url: 'https://menu.example.com/', label: 'Menu' }] });
    expect(JSON.parse(post!.body!)).not.toHaveProperty('slug');
  });

  it('sends the admin to sign in when the session expires during a save', async () => {
    const ue = user();
    const provider = (await import('@/test/render')).authenticatedProvider();
    let expired = false;
    provider.onError = async (error) => (expired ? { logout: true, redirectTo: '/login', error } : {});
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/v1/admin/businesses/b1' && init?.method === 'PATCH') {
        expired = true;
        return realFetch(input, { ...init, headers: { ...(init.headers as Record<string, string>), 'x-test-expired': '1' } });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses/b1'], authProvider: provider });
    await screen.findByRole('heading', { level: 1, name: 'Peel Street Espresso' });
    await ue.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('loads the hours schedule, maps nested validation errors, and saves with the record version', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses/b1'] });
    await screen.findByRole('heading', { level: 1, name: 'Peel Street Espresso' });
    expect(await screen.findByText('closed now')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('09:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Christmas Day')).toBeInTheDocument();
    expect(screen.getByDisplayValue('18:00')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('24:00')).not.toBeInTheDocument(); // shown as 00:00 + "closes next day" (same instant)
    expect(screen.getByDisplayValue('https://instagram.com/lce')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /save hours/i }));
    expect(await screen.findByText(/closing time must be after the opening time/i)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /save hours/i }));
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect(JSON.parse(puts[1]!.body!)).toMatchObject({ expectedVersion: 3, mode: 'scheduled', weekly: { monday: { state: 'intervals', intervals: [{ start: '09:00', end: '17:00', endNextDay: false }] }, friday: { state: 'open24' }, saturday: { state: 'intervals', intervals: [{ start: '18:00', end: '00:00', endNextDay: true }] } }, exceptions: [{ date: '2026-12-25', kind: 'closed', note: 'Christmas Day' }] });
  });

  it('shows blockers, surfaces stale edits and walks publish through blocked → duplicate override → published', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses/b1'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Peel Street Espresso' })).toBeInTheDocument();
    // The heading now counts what is outstanding, so the operator sees the size
    // of the job before opening the list.
    // What is still missing is listed beside the publish action, from the server's own blockers.
    expect(screen.getByText(/1 thing to fix before publishing/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('owner@example.com')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/changed by someone else/i)).toBeInTheDocument();
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(JSON.parse(patch!.body!)).toMatchObject({ expectedVersion: 3, name: 'Peel Street Espresso' });
    expect(JSON.parse(patch!.body!)).not.toHaveProperty('privateEnquiryEmail');

    await ue.click(screen.getByRole('button', { name: /^publish business$/i }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: /^publish business$/i }));
    expect(await within(dialog).findByText('Content rights must be reviewed')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: /^publish business$/i }));
    const override = await within(dialog).findByLabelText(/duplicate override reason/i);
    await ue.type(override, 'Different owner and floor; verified by phone');
    await ue.click(within(dialog).getByRole('button', { name: /^publish business$/i }));
    const publishes = calls.filter((c) => c.url === '/api/v1/admin/businesses/b1/publish');
    expect(publishes).toHaveLength(3);
    expect(JSON.parse(publishes[2]!.body!)).toEqual({ expectedVersion: 3, duplicateOverrideReason: 'Different owner and floor; verified by phone' });
  });

  it('groups the editor so a long form can be read, and separates the private address from the public ones', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses/b1'], authProvider: providerWithPermissions(['listings.read', 'listings.update', 'listings.publish']) });
    await screen.findByRole('heading', { level: 1, name: 'Peel Street Espresso' });

    for (const section of ['Business identity', 'Categories and services', 'Adelaide location', 'Contact details', 'Private enquiry address', 'Publishing', 'Verification', 'Record history']) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    }
    // The private address says what it is for and what it is not.
    const privateSection = screen.getByRole('heading', { level: 2, name: 'Private enquiry address' }).closest('.ant-card')!;
    expect(within(privateSection as HTMLElement).getByText(/never shown on the site/i)).toBeInTheDocument();
    // How it is stored is our business, not the administrator's.
    expect(document.body.textContent).not.toMatch(/encrypt/i);
  });

  it('moves a published listing through the address control, leaving the old address working', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses/b-published'], authProvider: providerWithPermissions(['listings.read', 'listings.update', 'listings.publish']) });
    await screen.findByRole('heading', { level: 1, name: 'Peel Street Espresso' });

    // The address is shown, not typed into, until Edit is pressed.
    expect(screen.getByText('/business/peel-street-espresso')).toBeInTheDocument();
    const ue = user();
    await ue.click(screen.getByRole('button', { name: 'Edit' }));
    const field = screen.getByLabelText('Web address');
    expect(screen.getByText(/links already shared keep working/i)).toBeInTheDocument();
    await ue.clear(field);
    await ue.type(field, 'moved-espresso');
    await ue.click(screen.getByRole('button', { name: 'Save' }));

    const posted = await waitFor(() => {
      const call = calls.find((entry) => entry.method === 'POST' && entry.url.endsWith('/slug'));
      expect(call, 'the address change is sent to the slug endpoint').toBeDefined();
      return call!;
    });
    expect(JSON.parse(posted.body!)).toMatchObject({ slug: 'moved-espresso', expectedVersion: 3 });
  });

  it('refuses an address that is not a slug, before asking the server', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses/b-published'], authProvider: providerWithPermissions(['listings.read', 'listings.update', 'listings.publish']) });
    await screen.findByRole('heading', { level: 1, name: 'Peel Street Espresso' });
    const ue = user();
    await ue.click(screen.getByRole('button', { name: 'Edit' }));
    await ue.clear(screen.getByLabelText('Web address'));
    await ue.type(screen.getByLabelText('Web address'), 'Not A Slug!');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/lowercase letters, numbers and hyphens/i);
    expect(calls.some((entry) => entry.method === 'POST' && entry.url.endsWith('/slug'))).toBe(false);
  });

  it('keeps the save action in reach and says whether there is anything unsaved', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/businesses/b1'], authProvider: providerWithPermissions(['listings.read', 'listings.update']) });
    await screen.findByRole('heading', { level: 1, name: 'Peel Street Espresso' });

    expect(screen.getByText(/1 thing still to fix before it can be published/i)).toBeInTheDocument();
    const ue = user();
    await ue.type(screen.getByLabelText('Business name'), '!');
    expect(await screen.findByText('You have unsaved changes.')).toBeInTheDocument();
  });
});