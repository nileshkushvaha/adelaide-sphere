import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from './DashboardPage';
import { renderWithProviders } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const days = Array.from({ length: 30 }, (_, index) => `2026-08-${String(index + 1).padStart(2, '0')}`);
const points = (last: number) => days.map((_, index) => (index === days.length - 1 ? last : index % 3));

const payload = {
  metrics: [
    { key: 'pendingReviews', label: 'Reviews awaiting moderation', value: 3, href: '/reviews', tone: 'attention' },
    { key: 'openReports', label: 'Open abuse reports', value: 0, href: '/reports', tone: 'neutral' },
  ],
  scheduledPosts: [{ id: 'p1', title: 'Winter markets', scheduledAt: '2026-09-08T09:00:00.000Z', overdue: true }],
  activity: [{ id: 'l1', action: 'blog.post.publish', actorName: 'Alex Editor', targetType: 'post', createdAt: '2026-09-06T00:00:00.000Z' }],
  periodDays: 30,
  trend: {
    days,
    series: [
      { key: 'reviews', label: 'Reviews received', href: '/reviews', points: points(4), total: 12, previousTotal: 8 },
      { key: 'enquiries', label: 'Enquiries received', href: '/enquiries', points: points(1), total: 5, previousTotal: 0 },
    ],
  },
  figures: [
    { key: 'publishedBusinesses', label: 'Published businesses', value: 172, href: '/businesses', recent: 6 },
    { key: 'approvedReviews', label: 'Approved reviews', value: 40, href: '/reviews', recent: null },
  ],
  averageRating: 4.3,
  ratingDistribution: [
    { key: '5', label: '5 stars', value: 20 },
    { key: '4', label: '4 stars', value: 12 },
    { key: '3', label: '3 stars', value: 5 },
    { key: '2', label: '2 stars', value: 2 },
    { key: '1', label: '1 star', value: 1 },
  ],
  enquiryDelivery: [
    { key: 'delivered', label: 'Delivered', value: 3 },
    { key: 'failed', label: 'Failed', value: 1 },
  ],
  listingStatus: [
    { key: 'published', label: 'Published', value: 172 },
    { key: 'draft', label: 'Draft', value: 9 },
    { key: 'archived', label: 'Archived', value: 0 },
  ],
  topCategories: [{ key: 'c1', label: 'Cafés', value: 31 }],
  generatedAt: '2026-09-06T01:00:00.000Z',
};

const serve = (data: unknown, status = 200) =>
  (async (input: RequestInfo | URL) => (String(input).startsWith('/api/v1/admin/dashboard') ? jsonResponse(status, data) : jsonResponse(200, { data: { status: 'ok' } }))) as typeof fetch;

describe('dashboard', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows the counts that need attention, scheduled work and recent activity', async () => {
    globalThis.fetch = serve({ data: payload });
    renderWithProviders(<DashboardPage />, { initialEntries: ['/admin/'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    const metric = await screen.findByRole('link', { name: 'Reviews awaiting moderation: 3' });
    expect(metric).toHaveAttribute('href', '/admin/reviews');
    expect(screen.getByText('Winter markets')).toBeInTheDocument();
    expect(screen.getByText('overdue')).toBeInTheDocument();
    // Audit keys are turned into something a person reads.
    expect(screen.getByText(/published a post/)).toBeInTheDocument();
    expect(screen.queryByText(/blog\.post\.publish/)).not.toBeInTheDocument();
  });

  it('states each headline figure with its change in words, not colour', async () => {
    globalThis.fetch = serve({ data: payload });
    renderWithProviders(<DashboardPage />, { initialEntries: ['/admin/'] });
    expect(await screen.findByText('Reviews received, last 30 days')).toBeInTheDocument();
    expect(screen.getByText('+50% vs previous 30 days (8)')).toBeInTheDocument();
    expect(screen.getByText('None in the previous 30 days')).toBeInTheDocument();
    expect(screen.getByText('+6 in the last 30 days')).toBeInTheDocument();
    expect(screen.getByText('Average rating 4.3 out of 5')).toBeInTheDocument();
  });

  it('draws the submissions trend with a legend and a table view that lists every day', async () => {
    globalThis.fetch = serve({ data: payload });
    renderWithProviders(<DashboardPage />, { initialEntries: ['/admin/'] });
    const chart = await screen.findByRole('group', { name: /received each day over the last 30 days/i });
    expect(chart).toHaveAttribute('tabindex', '0');
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText('Reviews received')).toBeInTheDocument();
    expect(within(legend).getByText('Enquiries received')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Table'));
    // A scrolling table: Ant Design draws its header and body as two tables inside one.
    const table = (await screen.findByRole('columnheader', { name: 'Reviews received' })).closest('.ant-table') as HTMLElement;
    expect(within(table).getByRole('columnheader', { name: 'Day' })).toBeInTheDocument();
    // Newest day first, with its value.
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('4');
  });

  it('breaks down delivery, listing status, ratings and categories with labels, not colour alone', async () => {
    globalThis.fetch = serve({ data: payload });
    renderWithProviders(<DashboardPage />, { initialEntries: ['/admin/'] });
    const delivery = await screen.findByRole('list', { name: 'Enquiry delivery states' });
    expect(within(delivery).getByText('Failed')).toBeInTheDocument();
    expect(within(delivery).getByText('25%')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Listings by status' })).toHaveTextContent('Draft9');
    expect(screen.getByRole('list', { name: 'Approved reviews by star rating' })).toHaveTextContent('5 stars20');
    expect(screen.getByText('Average 4.3 / 5')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Published listings by primary category' })).toHaveTextContent('Cafés31');
  });

  it('explains an account with no visible metrics, and omits every chart it may not see', async () => {
    globalThis.fetch = serve({ data: { metrics: [], scheduledPosts: null, activity: null, generatedAt: payload.generatedAt } });
    renderWithProviders(<DashboardPage />, { initialEntries: ['/admin/'] });
    expect(await screen.findByText(/no permissions that expose dashboard counts/i)).toBeInTheDocument();
    // Lists the account may not see are left out rather than shown as empty.
    expect(screen.queryByText('Scheduled articles')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Submissions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enquiry delivery' })).not.toBeInTheDocument();
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
  });

  it('surfaces an API failure with a retry action', async () => {
    globalThis.fetch = serve({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable. Please try again shortly.', fields: {}, requestId: 'req-1' } }, 503);
    renderWithProviders(<DashboardPage />, { initialEntries: ['/admin/'] });
    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
