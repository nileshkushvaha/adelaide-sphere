import { NotFoundContent } from '@/components/not-found-content';

/** Segment boundary so a `notFound()` from an article renders inside the site shell. */
export default function BlogNotFound() {
  return <NotFoundContent title="Article not found" description="This article is not published, or the address has changed." />;
}
