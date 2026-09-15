import { StatusPage } from './status-page';

interface Props {
  title?: string;
  description?: string;
}

/**
 * The 404 body, shared by the root boundary and the per-segment ones. Segment
 * boundaries matter: without them Next serves its bare error document for a
 * `notFound()` thrown inside a dynamic page, which would leave the page without
 * server-rendered content or the site shell (SRS SEO 001).
 */
export function NotFoundContent({ title = 'Page not found', description = 'This page does not exist or is no longer published.' }: Props) {
  return <StatusPage status="404" title={title} description={description} />;
}
