// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessCard as BusinessCardData } from '@/lib/api';
import { LazyBusinessGrid } from './lazy-list';

const loadBusinessPage = vi.fn<(input: { query: string; category?: string; area?: string; page: number }) => Promise<BusinessCardData[]>>();
vi.mock('@/lib/lazy-actions', () => ({
  loadBusinessPage: (input: { query: string; category?: string; area?: string; page: number }) => loadBusinessPage(input),
  loadPostPage: vi.fn(),
}));

/** The observers created by the component, so a test can say "this came into view". */
const observers: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];
class StubObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  private readonly entry: { callback: IntersectionObserverCallback; targets: Element[] };
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, targets: [] };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.entry.targets.length = 0;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/** Fires the most recently created observer, as a scroll into view would. */
function scrollIntoView() {
  const latest = observers.filter((entry) => entry.targets.length > 0).at(-1);
  if (!latest) throw new Error('nothing is being observed');
  latest.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
}

const card = (n: number): BusinessCardData => ({
  id: `b${n}`,
  name: `Business ${n}`,
  slug: `business-${n}`,
  primaryCategory: { name: 'Plumbers', slug: 'plumbers', icon: null },
  localArea: { name: 'Carlton', slug: 'carlton', icon: null },
  rating: null,
  image: null,
});

const page = (start: number) => [card(start), card(start + 1)];

/**
 * The directory list grows as it is scrolled (the numbered pages stay below it
 * for anyone without JavaScript, so nothing here replaces them).
 */
describe('Lazy directory results', () => {
  beforeEach(() => {
    observers.length = 0;
    loadBusinessPage.mockReset();
    vi.stubGlobal('IntersectionObserver', StubObserver);
  });

  it('appends the next page when the button is pressed, with the filters the visitor has', async () => {
    loadBusinessPage.mockResolvedValue(page(3));
    render(<LazyBusinessGrid initial={page(1)} page={1} pageCount={3} query="q=plumber&sort=rating" area="carlton" />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more businesses' }));

    expect(await screen.findByText('Business 3')).toBeInTheDocument();
    expect(screen.getByText('Business 1')).toBeInTheDocument();
    expect(loadBusinessPage).toHaveBeenCalledWith({ query: 'q=plumber&sort=rating', category: undefined, area: 'carlton', page: 2 });
  });

  it('loads the next page on its own when the end of the list comes into view', async () => {
    loadBusinessPage.mockResolvedValue(page(3));
    render(<LazyBusinessGrid initial={page(1)} page={1} pageCount={3} query="" />);

    scrollIntoView();

    expect(await screen.findByText('Business 4')).toBeInTheDocument();
  });

  it('stops offering more once the last page is on screen', () => {
    render(<LazyBusinessGrid initial={page(1)} page={2} pageCount={2} query="" />);

    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
    expect(loadBusinessPage).not.toHaveBeenCalled();
  });

  it('keeps the page usable when a load fails, and lets it be retried', async () => {
    loadBusinessPage.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(page(3));
    render(<LazyBusinessGrid initial={page(1)} page={1} pageCount={3} query="" />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more businesses' }));

    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText('Business 1')).toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText('Business 3')).toBeInTheDocument());
  });
});
