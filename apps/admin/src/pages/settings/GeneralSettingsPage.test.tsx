import { screen } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';
import { PRICING_PERIODS, PRICING_PLAN_KEYS } from '@adelaide-sphere/domain/pricing';

const record = {
  applicationName: 'Adelaide Sphere',
  shortName: 'Sphere',
  organisationName: null,
  tagline: 'Find local businesses across Adelaide',
  metaDescription: null,
  supportEmail: 'listings@adelaidesphere.com',
  supportPhone: '03 9000 0000',
  supportPhoneDisplay: { display: '03 9000 0000', telHref: 'tel:+61390000000' },
  websiteUrl: null,
  address: null,
  logoMediaId: null,
  faviconMediaId: null,
  shareImageMediaId: null,
  headerTopBarEnabled: false,
  social: { facebook: 'https://www.facebook.com/adelaidesphere', instagram: null, x: null, youtube: null, pinterest: null },
  copyrightText: null,
  footerText: null,
  pricing: { enabled: true, plans: PRICING_PLAN_KEYS.map((key) => ({ key, name: key === 'guest_post' ? 'Guest post' : 'Business listing', priceCents: 19900, period: PRICING_PERIODS[0], summary: null, features: [] })) },
  logo: null,
  favicon: null,
  shareImage: null,
  version: 2,
  updatedAt: '2026-09-07T00:00:00.000Z',
  updatedByAdminId: 'a1',
};

describe('general settings page', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  let puts = 0;

  beforeEach(() => {
    calls.length = 0;
    puts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url === '/api/v1/admin/settings/general' && method === 'GET') return jsonResponse(200, { data: record });
      if (url === '/api/v1/admin/settings/general' && method === 'PUT') {
        puts += 1;
        if (puts === 1) {
          return jsonResponse(400, {
            error: { code: 'VALIDATION_ERROR', message: 'Some settings are invalid', fields: { 'social.facebook': ['Enter a full https URL on facebook.com'] }, requestId: 'r' },
          });
        }
        return jsonResponse(200, { data: { ...record, version: 3 } });
      }
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads the record, saves with the record version and shows the API field errors on the right inputs', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/settings/general'] });

    expect(await screen.findByRole('heading', { level: 1, name: 'General settings' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Adelaide Sphere')).toBeInTheDocument();
    expect(screen.getByDisplayValue('listings@adelaidesphere.com')).toBeInTheDocument();
    // The normalised phone comes back as its display form and is editable as text.
    expect(screen.getByDisplayValue('03 9000 0000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://www.facebook.com/adelaidesphere')).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: /save settings/i }));
    // A per-field error from the API lands on the field it belongs to, not in a banner alone.
    expect(await screen.findByText('Enter a full https URL on facebook.com')).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: /save settings/i }));
    const put = calls.filter((call) => call.method === 'PUT').at(-1)!;
    const body = JSON.parse(put.body!) as Record<string, unknown>;
    expect(body.expectedVersion).toBe(2);
    expect(body.applicationName).toBe('Adelaide Sphere');
    // Unset platforms are sent as null so the API clears them, never as "undefined".
    expect(body.social).toEqual({ facebook: 'https://www.facebook.com/adelaidesphere', instagram: null, x: null, youtube: null, pinterest: null });
  });

  it('offers a field for every platform the public shell renders, Pinterest included', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/settings/general'] });
    // Each field is labelled by the platform's name beside its mark, so the icon is never the only cue.
    for (const platform of ['Facebook', 'Instagram', 'X (Twitter)', 'YouTube', 'Pinterest']) {
      expect(await screen.findByLabelText(new RegExp(`${platform.replace('(', '\\(').replace(')', '\\)')} URL`, 'i'))).toBeInTheDocument();
    }
  });

  it('offers the contact bar toggle and the copyright template help', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/settings/general'] });
    expect(await screen.findByRole('switch', { name: /show the contact bar/i })).toBeInTheDocument();
    expect(screen.getByText(/\{year\} and \{name\} stay up to date/i)).toBeInTheDocument();
    // Each branding slot supports picking a processed asset or uploading one.
    // By visible label rather than by role: a role-plus-name query computes an
    // accessible name for every button on the page, which under jsdom takes the
    // better part of a minute here and times the test out for no finding.
    expect(screen.getAllByText('Choose image')).toHaveLength(4);
    expect(screen.getAllByText('Upload image')).toHaveLength(4);
  });
});
