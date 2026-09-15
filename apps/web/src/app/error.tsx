'use client';

import { useEffect } from 'react';
import { Button } from '@adelaide-sphere/ui';
import { StatusPage } from '@/components/status-page';

/**
 * Route error boundary: a failed request is never presented as "no results"
 * (SRS DIR 006/NFR 012). It keeps the site shell, says plainly that this is a
 * failure on our side, offers a retry that re-renders the segment, and prints
 * the digest so a report can be matched to the server log.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The message stays in the browser console and the server log; the page
    // shows only the digest, never the error text.
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      status="500"
      title="We couldn’t load this page"
      description="Something on our side failed while building this page. Nothing you did caused it, and nothing you submitted was lost. Try again in a moment, or carry on from one of these."
      reference={error.digest ?? null}
      actions={<Button onClick={() => reset()}>Try again</Button>}
    />
  );
}
