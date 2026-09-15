import { NotFoundContent } from '@/components/not-found-content';

/** Segment boundary so a `notFound()` from the listing page renders inside the site shell. */
export default function BusinessNotFound() {
  return <NotFoundContent title="Listing not found" description="This business is not published, or the address has changed." />;
}
