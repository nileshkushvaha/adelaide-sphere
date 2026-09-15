import Link from 'next/link';
import { Button } from '@adelaide-sphere/ui';

/**
 * The one link that replaces the numbered pages under a list that loads as it
 * is scrolled. It is rendered by the server and disappears the moment the list
 * hydrates, so it is there for crawlers — which follow `rel="next"` through the
 * whole set — and for anyone without JavaScript, and never competes with the
 * button for a visitor who has it.
 */
export function NextPageLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex justify-center">
      <Button asChild variant="outline">
        <Link href={href} rel="next">
          {label}
        </Link>
      </Button>
    </div>
  );
}
