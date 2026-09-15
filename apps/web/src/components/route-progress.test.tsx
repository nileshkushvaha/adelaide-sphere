// @vitest-environment jsdom
/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors are the subject: the indicator watches every internal link, not only next/link. */
import { fireEvent, render, screen } from '@testing-library/react';
import { RouteProgress } from './route-progress';

// The component reads the rendered address from the router; the test drives the
// pending state through real clicks, which is what a visitor does. jsdom serves
// the document at '/', so the mocked address matches it.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(''),
}));

describe('RouteProgress', () => {
  it('announces a pending navigation when an internal link is followed', () => {
    render(
      <>
        <RouteProgress />
        <a href="/blog">Blog</a>
      </>,
    );
    expect(screen.getByRole('status').textContent).toBe('');
    fireEvent.click(screen.getByRole('link', { name: 'Blog' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading the next page');
  });

  it('stays quiet for links that do not replace the page', () => {
    render(
      <>
        <RouteProgress />
        <a href="mailto:hello@example.com">Email</a>
        <a href="https://example.com/" target="_blank" rel="noreferrer">
          Elsewhere
        </a>
        <a href="/">This page</a>
      </>,
    );
    for (const name of ['Email', 'Elsewhere', 'This page']) {
      fireEvent.click(screen.getByRole('link', { name }));
      expect(screen.getByRole('status').textContent).toBe('');
    }
  });
});
