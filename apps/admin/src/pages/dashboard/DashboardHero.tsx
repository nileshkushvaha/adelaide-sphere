import type { Dashboard } from '@/api/dashboard';

const count = new Intl.NumberFormat('en-AU');

/**
 * The dashboard's opening band: one sentence about what needs doing, and the
 * few figures an editor checks first. Colour here is decoration on a surface
 * that carries white text at WCAG AA contrast; no value depends on it.
 */
export function DashboardHero({ data }: { data: Dashboard }) {
  const days = data.periodDays ?? 30;
  const waiting = (data.metrics ?? []).filter((metric) => metric.value > 0 && metric.tone !== 'neutral').reduce((sum, metric) => sum + metric.value, 0);
  const series = data.trend?.series ?? [];
  const submissions = series.reduce((sum, item) => sum + item.total, 0);
  const published = (data.figures ?? []).find((figure) => figure.key === 'publishedBusinesses');

  const stats = [
    { label: 'Waiting for a decision', value: count.format(waiting) },
    ...(series.length > 0 ? [{ label: `Submissions, last ${days} days`, value: count.format(submissions) }] : []),
    ...(published ? [{ label: 'Published businesses', value: count.format(published.value) }] : []),
    ...(data.averageRating !== null && data.averageRating !== undefined ? [{ label: 'Average rating', value: `${data.averageRating.toFixed(1)} / 5` }] : []),
  ];

  return (
    <section aria-labelledby="dashboard-hero-title" className="ms-dash-hero">
      <p className="ms-dash-hero__eyebrow">Directory overview</p>
      <h2 id="dashboard-hero-title" className="ms-dash-hero__title">
        {waiting > 0 ? `${count.format(waiting)} ${waiting === 1 ? 'item needs' : 'items need'} a decision` : 'Everything is up to date'}
      </h2>
      <p className="ms-dash-hero__lead">
        {waiting > 0 ? 'Moderation, reports and enquiry delivery come first; the figures below show how the directory is moving.' : `No reviews, comments, reports or enquiries are waiting. Here is how the last ${days} days went.`}
      </p>
      <dl className="ms-dash-hero__stats">
        {stats.map((stat) => (
          <div key={stat.label} className="ms-dash-hero__stat">
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
