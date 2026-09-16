import type { ReactNode } from 'react';
import { Alert, Button, Col, List, Row, Skeleton, Space, Typography } from 'antd';
import {
  AlertOutlined,
  AppstoreOutlined,
  CommentOutlined,
  EnvironmentOutlined,
  FileSearchOutlined,
  MailOutlined,
  PictureOutlined,
  ReadOutlined,
  ReloadOutlined,
  ShopOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router';
import { dashboardApi, type Dashboard, type DashboardMetric } from '@/api/dashboard';
import { ApiStatus } from '@/components/ApiStatus';
import { BarList, SegmentedBar, TrendChart, type SegmentTone, type TrendSeries } from '@/components/charts';
import { EmptyState, PageHeader, Pill, SectionCard, StatCard } from '@/components/ui';
import { brand } from '@/config/theme';
import { formatDateTime } from '@/shared/format';
import { useAsync } from '@/shared/useAsync';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { DashboardHero } from './dashboard/DashboardHero';
import { KpiTile, type KpiAccent } from './dashboard/KpiTile';
import { SystemHealthCard } from './dashboard/SystemHealthCard';
import { ActivityFeed } from './activity/ActivityFeed';

/** Icon per work-queue metric; falls back to nothing for anything new from the API. */
const METRIC_ICONS: Record<string, ReactNode> = {
  pendingReviews: <StarOutlined aria-hidden="true" />,
  pendingComments: <CommentOutlined aria-hidden="true" />,
  openReports: <AlertOutlined aria-hidden="true" />,
  failedEnquiries: <MailOutlined aria-hidden="true" />,
  newEnquiries: <MailOutlined aria-hidden="true" />,
  draftListings: <ShopOutlined aria-hidden="true" />,
  quarantinedMedia: <PictureOutlined aria-hidden="true" />,
  duePosts: <ReadOutlined aria-hidden="true" />,
};

const FIGURE_ICONS: Record<string, ReactNode> = {
  publishedBusinesses: <ShopOutlined />,
  publishedPosts: <ReadOutlined />,
  approvedReviews: <StarOutlined />,
  activeCategories: <AppstoreOutlined />,
  activeAreas: <EnvironmentOutlined />,
};

const SERIES_ICONS: Record<string, ReactNode> = { reviews: <StarOutlined />, comments: <CommentOutlined />, enquiries: <MailOutlined /> };

/** Decorative tile accents, fixed per figure so the page looks the same whichever tiles a role can see. */
const ACCENTS: Record<string, KpiAccent> = {
  reviews: 'amber',
  comments: 'violet',
  enquiries: 'teal',
  publishedBusinesses: 'sky',
  publishedPosts: 'indigo',
  approvedReviews: 'rose',
  activeCategories: 'violet',
  activeAreas: 'teal',
};

/** Colour follows the entity, never its position: hiding a queue for lack of permission never repaints the others. */
const SERIES_COLORS: Record<string, string> = { reviews: 'var(--as-series-1)', comments: 'var(--as-series-2)', enquiries: 'var(--as-series-3)' };

const DELIVERY_TONES: Record<string, SegmentTone> = { delivered: 'good', providerAccepted: 'good', queued: 'warning', retrying: 'warning', failed: 'critical', suppressed: 'serious' };
const LISTING_TONES: Record<string, SegmentTone> = { published: 'good', draft: 'warning', archived: 'neutral' };

const count = new Intl.NumberFormat('en-AU');

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: brand.textSubtle, margin: '8px 0 12px' }}>
      {children}
    </h2>
  );
}

/** Headline tiles: the three submission queues with their change, then the directory's totals. */
function KpiRow({ data }: { data: Dashboard }) {
  const days = data.periodDays ?? 30;
  const tiles: ReactNode[] = [
    ...(data.trend?.series ?? []).map((series) => (
      <KpiTile
        key={series.key}
        label={`${series.label}, last ${days} days`}
        value={count.format(series.total)}
        icon={SERIES_ICONS[series.key]}
        accent={ACCENTS[series.key]}
        href={series.href}
        change={{ current: series.total, previous: series.previousTotal }}
        trend={series.points}
        color={SERIES_COLORS[series.key]}
      />
    )),
    ...(data.figures ?? []).map((figure) => (
      <KpiTile
        key={figure.key}
        label={figure.label}
        value={count.format(figure.value)}
        icon={FIGURE_ICONS[figure.key]}
        accent={ACCENTS[figure.key]}
        href={figure.href}
        detail={
          figure.key === 'approvedReviews' && data.averageRating !== null && data.averageRating !== undefined
            ? `Average rating ${data.averageRating.toFixed(1)} out of 5`
            : figure.recent === null
              ? null
              : figure.recent > 0
                ? `+${count.format(figure.recent)} in the last ${days} days`
                : `None new in the last ${days} days`
        }
      />
    )),
  ];
  if (tiles.length === 0) return null;
  return (
    <section aria-labelledby="dashboard-overview">
      <SectionHeading id="dashboard-overview">At a glance</SectionHeading>
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {tiles.map((tile, index) => (
          <Col key={index} xs={24} sm={12} xl={8} xxl={6}>
            {tile}
          </Col>
        ))}
      </Row>
    </section>
  );
}

/** Operational overview (SRS ADM 003): what needs attention, how the directory is moving, and nothing private. */
export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const [state, reload, refresh] = useAsync((signal) => dashboardApi().summary(signal), []);
  const data = state.status === 'ready' ? state.data : null;
  const refreshing = state.status === 'ready' && state.refreshing === true;

  // The payload is defensive: a partial response must not blank the screen.
  const metrics: DashboardMetric[] = data?.metrics ?? [];
  const needsAttention = metrics.filter((metric) => metric.value > 0 && metric.tone !== 'neutral');
  const series: TrendSeries[] = (data?.trend?.series ?? []).map((item) => ({ key: item.key, label: item.label, points: item.points, color: SERIES_COLORS[item.key] ?? 'var(--as-series-1)' }));
  const days = data?.periodDays ?? 30;
  const enquiryDelivery = data?.enquiryDelivery ?? [];
  const listingStatus = data?.listingStatus ?? [];
  const ratingDistribution = data?.ratingDistribution ?? [];
  const topCategories = data?.topCategories ?? [];
  const hasSideColumn = enquiryDelivery.length > 0 || listingStatus.length > 0;
  // A widget the API returns as null is one this account may not see (change log 1.13);
  // an empty list is one with nothing in it.
  const scheduledPosts = data?.scheduledPosts ?? null;
  const activity = data?.activity ?? null;
  const nothingVisible =
    metrics.length === 0 && series.length === 0 && (data?.figures ?? []).length === 0 && scheduledPosts === null && activity === null && !hasSideColumn && ratingDistribution.length === 0 && topCategories.length === 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`The last ${days} days, and what needs a decision now. Figures follow your permissions.`}
        meta={data ? <Pill tone="neutral">Updated {formatDateTime(data.generatedAt)}</Pill> : null}
        actions={
          <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={data ? refresh : reload} loading={state.status === 'loading' || refreshing}>
            Refresh
          </Button>
        }
      />

      {state.status === 'error' && (
        <Alert type="error" showIcon style={{ marginBottom: 20 }} message={state.message} description={state.reference} action={<Button onClick={reload}>Retry</Button>} />
      )}

      {state.status === 'loading' && <Skeleton active paragraph={{ rows: 8 }} />}

      {data && (
        // A refresh holds the previous render, dimmed, rather than flashing a skeleton.
        <div aria-busy={refreshing} style={{ opacity: refreshing ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
          <DashboardHero data={data} />

          {(metrics.length > 0 || nothingVisible) && (
          <section aria-labelledby="dashboard-queues">
            <SectionHeading id="dashboard-queues">Needs a decision</SectionHeading>
            {needsAttention.length === 0 && metrics.length > 0 && (
              <Alert type="success" showIcon style={{ marginBottom: 16 }} message="Nothing is waiting for moderation or delivery" description="Reviews, comments, reports and enquiries are all clear." />
            )}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
              {metrics.map((metric) => (
                <Col key={metric.key} xs={24} sm={12} xl={8} xxl={6}>
                  <StatCard label={metric.label} value={metric.value} href={metric.href} tone={metric.tone} icon={METRIC_ICONS[metric.key]} />
                </Col>
              ))}
            </Row>
            {nothingVisible && (
              <SectionCard title="No metrics available">
                <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                  Your account has no permissions that expose dashboard counts. Ask a Super Admin if you expect to moderate or publish content.
                </Typography.Paragraph>
              </SectionCard>
            )}
          </section>
          )}

          <KpiRow data={data} />

          {(series.length > 0 || hasSideColumn) && (
            <Row gutter={[20, 0]}>
              {series.length > 0 && (
                <Col xs={24} xl={hasSideColumn ? 15 : 24} xxl={hasSideColumn ? 16 : 24}>
                  <SectionCard title="Submissions" description={`Reviews, comments and enquiries received each day over the last ${days} days, in Adelaide time.`}>
                    <TrendChart days={data.trend.days} series={series} label={`Reviews, comments and enquiries received each day over the last ${days} days`} />
                  </SectionCard>
                </Col>
              )}
              {hasSideColumn && (
                <Col xs={24} xl={series.length > 0 ? 9 : 24} xxl={series.length > 0 ? 8 : 24}>
                  {enquiryDelivery.length > 0 && (
                    <SectionCard title="Enquiry delivery" description={`Enquiries received in the last ${days} days, by delivery state.`} extra={<Link to="/enquiries">Enquiries</Link>}>
                      <SegmentedBar
                        label="Enquiry delivery states"
                        emptyText={`No enquiries in the last ${days} days.`}
                        segments={enquiryDelivery.map((item) => ({ ...item, tone: DELIVERY_TONES[item.key] ?? 'neutral' }))}
                      />
                    </SectionCard>
                  )}
                  {listingStatus.length > 0 && (
                    <SectionCard title="Listings by status" description="Every business record, whether or not it is public." extra={<Link to="/businesses">Businesses</Link>}>
                      <SegmentedBar label="Listings by status" emptyText="No listings yet." segments={listingStatus.map((item) => ({ ...item, tone: LISTING_TONES[item.key] ?? 'neutral' }))} />
                    </SectionCard>
                  )}
                </Col>
              )}
            </Row>
          )}

          {(ratingDistribution.length > 0 || topCategories.length > 0) && (
            <Row gutter={[20, 0]}>
              {ratingDistribution.length > 0 && (
                <Col xs={24} xl={topCategories.length > 0 ? 12 : 24}>
                  <SectionCard
                    title="Rating spread"
                    description="Approved reviews by star rating."
                    extra={data.averageRating !== null && data.averageRating !== undefined ? <Pill tone="neutral">Average {data.averageRating.toFixed(1)} / 5</Pill> : null}
                  >
                    <BarList label="Approved reviews by star rating" emptyText="No approved reviews yet." items={ratingDistribution} />
                  </SectionCard>
                </Col>
              )}
              {topCategories.length > 0 && (
                <Col xs={24} xl={ratingDistribution.length > 0 ? 12 : 24}>
                  <SectionCard title="Largest categories" description="Primary categories with the most published listings." extra={<Link to="/categories">Categories</Link>}>
                    <BarList label="Published listings by primary category" emptyText="No published listings yet." items={topCategories} />
                  </SectionCard>
                </Col>
              )}
            </Row>
          )}

          {(scheduledPosts !== null || activity !== null) && (
          <Row gutter={[20, 0]}>
            {scheduledPosts !== null && (
            <Col xs={24} xl={activity !== null ? 12 : 24}>
              <SectionCard title="Scheduled articles" description="Publishing runs automatically; overdue items mean the scheduler needs attention.">
                {scheduledPosts.length === 0 ? (
                  <EmptyState title="Nothing scheduled" description="Articles you schedule for a future Adelaide time appear here until they publish." />
                ) : (
                  <List
                    dataSource={scheduledPosts}
                    renderItem={(post) => (
                      <List.Item
                        actions={[
                          <Link key="open" to={`/posts/${post.id}`}>
                            Open
                          </Link>,
                        ]}
                      >
                        <div>
                          <Typography.Text strong>{post.title}</Typography.Text>
                          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                            <Space size={8}>
                              <span>{formatDateTime(post.scheduledAt)}</span>
                              {post.overdue && <Pill tone="critical">overdue</Pill>}
                            </Space>
                          </Typography.Paragraph>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </SectionCard>
            </Col>
            )}
            {activity !== null && (
            <Col xs={24} xl={scheduledPosts !== null ? 12 : 24}>
              <SectionCard
                title="Recent activity"
                description="The latest entries from the audit log."
                extra={
                  <Link to="/audit">
                    <Space size={6}>
                      <FileSearchOutlined aria-hidden="true" />
                      Full log
                    </Space>
                  </Link>
                }
              >
                {activity.length === 0 ? (
                  <EmptyState title="No recent activity" description="Administrator actions appear here as soon as they happen." />
                ) : (
                  // The same rows as the activity log, in their short form, so the two screens read alike.
                  <ActivityFeed
                    byDay={false}
                    variant="compact"
                    entries={activity.map((entry) => ({
                      id: entry.id,
                      action: entry.action,
                      category: entry.category,
                      domainLabel: entry.domainLabel,
                      outcome: entry.outcome,
                      actorName: entry.actorName,
                      targetType: entry.targetType,
                      targetId: entry.targetId,
                      targetLabel: entry.targetLabel,
                      createdAt: entry.createdAt,
                    }))}
                  />
                )}
              </SectionCard>
            </Col>
            )}
          </Row>
          )}

          <SystemHealthCard />

          <SectionCard title="Service status">
            <ApiStatus />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
